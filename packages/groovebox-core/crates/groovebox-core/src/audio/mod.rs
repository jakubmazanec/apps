use crate::dsp::clip::soft_clip;
use crate::effect_ram::{PIECES, Piece};
use crate::message::{
    MESSAGE_QUEUE, Message, MessageKind, REPORT_QUEUE, Report, Target, VERSION_QUEUE, Version,
};
use crate::param::{
    self, Entry, MASTER_LEVEL, METRONOME, METRONOME_LEVEL, MUTE, OUTPUT_VOLUME, TEMPO, TRACK_LEVEL,
};
use crate::project::pool::SOUND_DEFAULTS;
use crate::queue::{Consumer, Producer};
use crate::sample_ram::Reader;
use crate::sequencer::{Event, Sequencer};
use crate::store::NoteReader;
use click::Click;
use preview::Preview;
use slots::Slots;
use sounds::Sounds;
use voice::Glide;
use voices::Voices;

pub mod click;
pub mod delay;
pub mod preview;
pub mod reverb;
pub mod sample;
pub mod slots;
pub mod sounds;
pub mod synth;
pub mod voice;
pub mod voices;

pub const SAMPLE_RATE: u32 = 48_000;
/// The core renders on its own fixed schedule of this many samples, whatever the host's batch
/// size.
pub const CHUNK: usize = 32;
pub const MAX_BATCH: usize = 128;

/// One chunk of both channels for each of the four tracks.
pub type Buses = [[[f32; CHUNK]; 2]; 4];

pub struct Audio {
    position: u64,
    sounds: Sounds,
    voices: Voices,
    preview: Preview,
    /// The output volume's value, where it glides to and the chunks it takes to get there.
    volume: Glide,
    /// The block table it reads blocks through, 0 or 1.
    table: u8,
    /// Plays the trees of the versions.
    sequencer: Sequencer,
    /// Whether a beat starts the click: METRONOME is on.
    metronome: bool,
    click: Click,
    /// The click's level, gliding as the output volume does.
    metronome_level: Glide,
    /// Each track's level, which scales its bus, gliding as the output volume does.
    levels: [Glide; 4],
    /// The level of the sum of the buses, gliding as the output volume does.
    master: Glide,
    /// Each track's effect slots, which its bus goes through before its level.
    slots: Slots,
}

impl Audio {
    pub const fn new() -> Self {
        Self {
            position: 0,
            sounds: Sounds::factory(),
            voices: Voices::new(),
            preview: Preview::new(),
            volume: Glide::at(OUTPUT_VOLUME.default),
            table: 0,
            sequencer: Sequencer::new(),
            metronome: false,
            click: Click::new(),
            metronome_level: Glide::at(METRONOME_LEVEL.default),
            levels: [Glide::at(TRACK_LEVEL.default); 4],
            master: Glide::at(MASTER_LEVEL.default),
            slots: Slots::new(),
        }
    }

    /// The sample at which the next `render` starts.
    pub fn position(&self) -> u64 {
        self.position
    }

    /// Renders `left.len()` samples, which must be a multiple of `CHUNK`. At each chunk start it
    /// applies every message that is due, then every version whose moment is due, and reports the
    /// sample at which it applied each. Then the sequencer starts and ends the pattern's notes due
    /// by the chunk start: a note of a sound the audio part does not hold starts nothing (S22),
    /// and the others play their sound's engine; a beat starts the click while the metronome is on.
    /// It then adds up each track's voices and the last chunk of each voice a new note took or
    /// choked or a `ForgetSample`, `DeleteSound` or `Silence` faded into its bus, sends each bus
    /// through its track's effect slots and multiplies it by its track's level, adds the buses and
    /// multiplies the sum by the master level, adds the preview and the click at the metronome
    /// level, soft-clips the sum and multiplies it by the output volume; every level moves in a
    /// line across the chunk. The slots follow the tempo of the latest `Play`, `Tempo` or
    /// `SetParam` of TEMPO, and a `Silence` clears them; the fades of its chunk go around them.
    ///
    /// It takes a message or a version only while the report queue has room for its report and
    /// never waits: one it leaves stays in its queue, in order, for a later chunk start. It counts
    /// the room once per chunk start, so a version never goes ahead of a message left waiting.
    ///
    /// It reads the files' blocks through `readers[v]`, the reader of block table `v`, as
    /// `Tables::readers` allows: through the table that the latest `UseTable` named and only frames
    /// below the length of the latest `Preview`'s file and of each file a `NoteOn` or a
    /// `SoundEngine` named, which the note's voice reads until the note ends. It reads none of the preview's file from the
    /// chunk at which a `StopPreview` or a newer `Preview` applies, and none of a file once a
    /// `ForgetSample` of it applies, in message order: a `NoteOn` of the file before it in the same
    /// chunk reads the file's first chunk, which the forget then fades. The forget's report comes
    /// after that read, and the control part takes the blocks back only after the report.
    ///
    /// It reads the note memory through `notes`, only the blocks of the trees of the versions it
    /// applied, and keeps the slots' echoes in `effects`, the effect memory.
    #[expect(
        clippy::too_many_arguments,
        reason = "the audio part uses three memories and three queues"
    )]
    pub fn render(
        &mut self,
        left: &mut [f32],
        right: &mut [f32],
        readers: &[Reader<'_>; 2],
        notes: &NoteReader<'_>,
        effects: &mut [Piece; PIECES],
        messages: &mut Consumer<'_, Message, MESSAGE_QUEUE>,
        versions: &mut Consumer<'_, Version, VERSION_QUEUE>,
        reports: &mut Producer<'_, Report, REPORT_QUEUE>,
    ) {
        assert_eq!(left.len(), right.len());
        assert_eq!(left.len() % CHUNK, 0);
        let (left, _) = left.as_chunks_mut::<CHUNK>();
        let (right, _) = right.as_chunks_mut::<CHUNK>();
        for (left, right) in left.iter_mut().zip(right) {
            let mut fades: Buses = [[[0.0; CHUNK]; 2]; 4];
            let mut silenced = false;
            let mut room = reports.free();
            while room > 0
                && let Some(message) = messages
                    .peek()
                    .filter(|message| message.at <= self.position)
            {
                messages.pop();
                room -= 1;
                let reader = &readers[usize::from(self.table)];
                match message.kind {
                    MessageKind::NewSound { sound } => self.sounds.add(sound, SOUND_DEFAULTS),
                    MessageKind::CopySound { sound, of } => {
                        let engine = self.sounds.engine(of);
                        self.sounds.add(sound, *self.sounds.values(of));
                        self.sounds.set_engine(sound, engine);
                    }
                    MessageKind::DeleteSound { sound } => {
                        self.voices.delete(sound, &mut fades);
                        self.sounds.remove(sound);
                    }
                    MessageKind::SetParam {
                        target: Target::Sound(sound),
                        id,
                        value,
                    } => {
                        self.sounds.set(sound, id, value);
                        self.voices.set(sound, id, value);
                    }
                    MessageKind::SetParam {
                        target: Target::Device,
                        id,
                        value,
                    } if id == OUTPUT_VOLUME.id => self.volume.set(value, OUTPUT_VOLUME.glide),
                    MessageKind::SetParam {
                        target: Target::Device,
                        id,
                        value,
                    } if id == METRONOME.id => self.metronome = value != 0,
                    MessageKind::SetParam {
                        target: Target::Device,
                        id,
                        value,
                    } if id == METRONOME_LEVEL.id => {
                        self.metronome_level.set(value, METRONOME_LEVEL.glide);
                    }
                    MessageKind::NoteOn {
                        note,
                        track,
                        sound,
                        pitch,
                        velocity,
                        engine,
                    } => self.voices.note_on(
                        note,
                        track,
                        sound,
                        pitch,
                        velocity,
                        engine,
                        &self.sounds,
                        reader,
                        &mut fades,
                    ),
                    MessageKind::NoteOff { note } => {
                        self.voices.note_off(note, &self.sounds, reader);
                    }
                    MessageKind::UseTable { version } => self.table = version,
                    MessageKind::Preview { sample } => self.preview.start(sample),
                    MessageKind::StopPreview => self.preview.stop(),
                    MessageKind::ForgetSample { file } => {
                        self.preview.forget(file);
                        self.voices.forget(file, &mut fades);
                        self.sounds.forget(file);
                    }
                    MessageKind::Play { run } => {
                        self.sequencer.play(run, notes);
                        self.slots.set_tempo(run.tempo);
                    }
                    MessageKind::Stop => self.sequencer.stop(|event| {
                        if let Event::End(sounding) = event {
                            self.voices.note_off(sounding.id, &self.sounds, reader);
                        }
                    }),
                    MessageKind::Silence => {
                        self.voices.silence(&mut fades);
                        self.preview.stop();
                        self.click.silence();
                        self.slots.clear();
                        silenced = true;
                    }
                    MessageKind::SoundEngine { sound, engine } => {
                        self.sounds.set_engine(sound, engine);
                    }
                    MessageKind::Tempo { run } => {
                        self.sequencer.retime(run);
                        self.slots.set_tempo(run.tempo);
                    }
                    MessageKind::Meter { meter } => self.sequencer.meter(meter, notes),
                    MessageKind::SetParam {
                        target: Target::Track(track),
                        id,
                        value,
                    } if id == MUTE.id => self.sequencer.mute(track, value != 0),
                    MessageKind::SetParam {
                        target: Target::Track(track),
                        id,
                        value,
                    } if id == TRACK_LEVEL.id => {
                        self.levels[usize::from(track)].set(value, TRACK_LEVEL.glide);
                    }
                    MessageKind::SetParam {
                        target: Target::Project,
                        id,
                        value,
                    } if id == MASTER_LEVEL.id => self.master.set(value, MASTER_LEVEL.glide),
                    MessageKind::SetParam {
                        target: Target::Project,
                        id,
                        value,
                    } if id == TEMPO.id => {
                        // At least 3,000, so it fits.
                        self.slots.set_tempo(value as u32);
                    }
                    MessageKind::SetParam {
                        target: Target::Slot { track, slot },
                        id,
                        value,
                    } => self.slots.set(track, slot, id, value),
                    MessageKind::SlotEffect {
                        track,
                        slot,
                        effect,
                    } => self.slots.set_effect(track, slot, effect),
                    MessageKind::MoveSlot { track, from, to } => {
                        self.slots.move_slot(track, from, to);
                    }
                    // Another device value is not the audio part's.
                    MessageKind::SetParam { .. } => {}
                }
                // The report has room: the audio part takes a message only while it does.
                let _ = reports.push(Report::Applied {
                    number: message.number,
                    sample: self.position,
                });
            }
            while room > 0
                && let Some(version) = versions
                    .peek()
                    .filter(|version| version.moment <= self.position)
            {
                versions.pop();
                room -= 1;
                self.sequencer.switch(version.track, version.tree, notes);
                let _ = reports.push(Report::Applied {
                    number: version.number,
                    sample: self.position,
                });
            }

            let reader = &readers[usize::from(self.table)];
            self.sequencer
                .advance(self.position, notes, |event| match event {
                    Event::Start { id, track, note } if self.sounds.holds(note.sound) => {
                        self.voices.note_on(
                            id,
                            track,
                            note.sound,
                            note.pitch,
                            note.velocity,
                            self.sounds.engine(note.sound),
                            &self.sounds,
                            reader,
                            &mut fades,
                        );
                    }
                    Event::Beat { first } if self.metronome => self.click.start(first),
                    Event::Start { .. } | Event::Beat { .. } => {}
                    Event::End(sounding) => self.voices.note_off(sounding.id, &self.sounds, reader),
                });
            let mut mix: Buses = [[[0.0; CHUNK]; 2]; 4];
            self.voices.render(reader, &mut mix);
            for (track, (bus, fades)) in (0..).zip(mix.iter_mut().zip(&fades)) {
                let add_fades = |bus: &mut [[f32; CHUNK]; 2]| {
                    for (x, fade) in bus.as_flattened_mut().iter_mut().zip(fades.as_flattened()) {
                        *x += fade;
                    }
                };
                // A `Silence` chunk's fades go around the slots it cleared, so none of them echoes.
                if !silenced {
                    add_fades(bus);
                }
                self.slots.render(track, bus, effects);
                if silenced {
                    add_fades(bus);
                }
            }
            let mut preview = [[0.0; CHUNK]; 2];
            self.preview.render(reader, &mut preview);
            let mut click = [0.0; CHUNK];
            self.click.render(&mut click);
            let gain = glide_in_a_line(&mut self.volume, &OUTPUT_VOLUME);
            let level = glide_in_a_line(&mut self.metronome_level, &METRONOME_LEVEL);
            let track_levels = self
                .levels
                .each_mut()
                .map(|level| glide_in_a_line(level, &TRACK_LEVEL));
            let master = glide_in_a_line(&mut self.master, &MASTER_LEVEL);
            for n in 0..CHUNK {
                let levels = track_levels.each_ref().map(|level| level(n));
                let tracks = |channel: usize| {
                    mix.iter()
                        .zip(levels)
                        .fold(0.0, |sum, (mix, level)| sum + mix[channel][n] * level)
                        * master(n)
                };
                left[n] = soft_clip(tracks(0) + preview[0][n] + click[n] * level(n)) * gain(n);
                right[n] = soft_clip(tracks(1) + preview[1][n] + click[n] * level(n)) * gain(n);
            }
            self.position += CHUNK as u64;
        }
    }
}

/// Moves `glide` one chunk along and gives what `entry` makes of it at the end of each sample of
/// the chunk, in a line from where the chunk started.
fn glide_in_a_line(glide: &mut Glide, entry: &Entry) -> impl Fn(usize) -> f32 + use<> {
    let before = param::real(entry, glide.value);
    glide.step();
    let after = param::real(entry, glide.value);
    move |n| before + (after - before) * (n + 1) as f32 / CHUNK as f32
}

impl Default for Audio {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(all(test, not(feature = "loom")))]
mod tests {
    use super::*;
    use crate::budget::POOL_SOUNDS;
    use crate::effect_ram::EffectRam;
    use crate::library::FileId;
    use crate::message::{
        MESSAGE_QUEUE, Message, MessageKind, NoteEngine, NoteId, REPORT_QUEUE, Report, SampleFile,
        Target, VERSION_QUEUE, Version,
    };
    use crate::param::{
        CHOKE_GROUP, CUTOFF, DECAY, DELAY_FEEDBACK, DELAY_LEVEL, DELAY_TIME, END, Entry, GATE,
        LEGATO, LEVEL, LOOP, LOOP_END, METRONOME, METRONOME_LEVEL, MONO, MUTE, ONE_SHOT,
        OUTPUT_VOLUME, PLAY_MODE, POLY, RESONANCE, REVERB_LEVEL, SPREAD, SUPERSAW, SUSTAIN, TEMPO,
        TRIGGER, WAVE,
    };
    use crate::project::pool::{SOUND_DEFAULTS, SOUND_VALUES, Sound, SoundNumber};
    use crate::project::track::Effect;
    use crate::project::{Project, Signature};
    use crate::queue::{Consumer, Producer, Queue};
    use crate::sample_ram::{
        BLOCK, BLOCKS, Blocks, Listed, Listing, SampleRam, Tables, blocks_for,
    };
    use crate::sequencer::{Meter, Run};
    use crate::store::note::Note;
    use crate::store::{NoteRam, Tree};
    use std::boxed::Box;
    use std::vec::Vec;

    /// An audio part with its own queues, block tables, sample RAM, note memory and effect memory,
    /// holding no sounds, as the tests start from an empty pool. The test plays the control side of
    /// the tables through `listing` and `blocks`, and of the note memory through `version`. The
    /// audio part is on the heap: a debug build's copies of it on the stack overflow a test
    /// thread's 2 MiB.
    struct Rig<'a> {
        audio: Box<Audio>,
        to_audio: Producer<'a, Message, MESSAGE_QUEUE>,
        inbox: Consumer<'a, Message, MESSAGE_QUEUE>,
        outbox: Producer<'a, Report, REPORT_QUEUE>,
        from_audio: Consumer<'a, Report, REPORT_QUEUE>,
        tables: Box<Tables>,
        ram: Box<SampleRam>,
        listing: Listing,
        blocks: Blocks,
        notes: Box<NoteRam>,
        versions: Box<Queue<Version, VERSION_QUEUE>>,
        effects: Box<EffectRam>,
    }

    impl<'a> Rig<'a> {
        #[allow(unsafe_code)]
        fn new(
            messages: &'a Queue<Message, MESSAGE_QUEUE>,
            reports: &'a Queue<Report, REPORT_QUEUE>,
        ) -> Self {
            // SAFETY: each rig takes one producer and one consumer from its own queues.
            unsafe {
                Self {
                    audio: Box::new(Audio {
                        sounds: Sounds::new(),
                        ..Audio::new()
                    }),
                    to_audio: messages.producer(),
                    inbox: messages.consumer(),
                    outbox: reports.producer(),
                    from_audio: reports.consumer(),
                    tables: Box::new(Tables::new()),
                    ram: SampleRam::boxed(),
                    listing: Listing::new(),
                    blocks: Blocks::new(),
                    notes: NoteRam::boxed(),
                    versions: Box::new(Queue::new()),
                    effects: EffectRam::boxed(),
                }
            }
        }

        fn send(&mut self, number: u32, at: u64, kind: MessageKind) {
            assert_eq!(self.to_audio.push(Message { number, at, kind }), Ok(()));
        }

        /// Sends version `number`: track `track` plays a tree of `notes` from `moment`.
        #[allow(unsafe_code)]
        fn version(&self, number: u32, moment: u64, track: u8, notes: &[Note]) {
            // SAFETY: the store and the producer live only for this call, which no render runs
            // during, and the store writes only new blocks, which no tree the audio part has
            // reaches.
            let (mut store, mut versions) =
                unsafe { (self.notes.store(), self.versions.producer()) };
            let tree = notes
                .iter()
                .fold(Tree(None), |tree, &note| store.insert(tree, note).0);
            let version = Version {
                number,
                moment,
                track,
                tree,
            };
            assert_eq!(versions.push(version), Ok(()));
        }

        /// Makes the audio part hold sound 1, as a `NewSound` does, without a message or a report.
        fn add_sound(&mut self) {
            self.audio.sounds.add(SoundNumber(1), SOUND_DEFAULTS);
        }

        /// Turns the output volume to full at once, so that the output is what the clipper gives.
        fn full_volume(&mut self) {
            self.audio.volume = Glide::at(OUTPUT_VOLUME.high);
        }

        /// A rig at full volume that holds two mono files of `frames` frames: file 0 of
        /// `samples(frames)` and file 1 of the samples after them.
        fn with_two_files(
            messages: &'a Queue<Message, MESSAGE_QUEUE>,
            reports: &'a Queue<Report, REPORT_QUEUE>,
            frames: u32,
        ) -> Self {
            let mut rig = Self::new(messages, reports);
            rig.full_volume();
            let both = samples(2 * frames as usize);
            rig.add_file(0, false, &both[..frames as usize]);
            rig.add_file(1, false, &both[frames as usize..]);
            rig
        }

        /// A `Rig::with_two_files` of `LENGTH` frames that holds sound 1, a sample sound of such
        /// a file with `changes` (see `sample_sound`).
        fn with_sample_sound(
            messages: &'a Queue<Message, MESSAGE_QUEUE>,
            reports: &'a Queue<Report, REPORT_QUEUE>,
            changes: &[(&Entry, i32)],
        ) -> Self {
            let mut rig = Self::with_two_files(messages, reports, LENGTH);
            rig.audio
                .sounds
                .add(SoundNumber(1), sample_sound(LENGTH, changes));
            rig
        }

        /// Writes `samples` into free blocks of the sample RAM as `file`, a stereo file's frames
        /// left then right, and lists the blocks as its slice.
        fn add_file(&mut self, file: u16, stereo: bool, samples: &[i16]) {
            let frames = samples.len() as u32 / (1 + u32::from(stereo));
            let blocks: Vec<u32> = self
                .blocks
                .take(blocks_for(frames, 1 + u8::from(stereo)))
                .expect("enough blocks are free")
                .collect();
            self.write(&blocks, samples);
            let listed = self
                .listing
                .add(&self.tables, FileId(file), blocks.into_iter());
            assert_eq!(listed, Some(Listed::Appended));
        }

        /// Writes `samples` into `blocks` of the sample RAM, a stereo file's frames left then
        /// right.
        #[allow(unsafe_code)]
        fn write(&self, blocks: &[u32], samples: &[i16]) {
            for (&block, part) in blocks.iter().zip(samples.chunks(BLOCK / 2)) {
                // SAFETY: the readers live only while a render runs, so between renders no other
                // reference to these bytes does.
                let bytes = unsafe { self.ram.bytes(block * BLOCK as u32, 2 * part.len() as u32) };
                for (bytes, sample) in bytes.as_chunks_mut::<2>().0.iter_mut().zip(part) {
                    *bytes = sample.to_le_bytes();
                }
            }
        }

        /// Fills the blocks of `file` with `i16::MAX`, as the control part may once the audio part
        /// has let go of the file: a read of it would sound near full scale.
        fn overwrite(&self, file: u16) {
            let blocks: Vec<u32> = self.listing.blocks(&self.tables, FileId(file)).collect();
            self.write(&blocks, &std::vec![i16::MAX; blocks.len() * BLOCK / 2]);
        }

        #[allow(unsafe_code)]
        fn render_stereo(&mut self, length: usize) -> [Vec<f32>; 2] {
            let mut left = std::vec![f32::NAN; length];
            let mut right = std::vec![f32::NAN; length];
            // SAFETY: the test tells the audio part only about files it listed and wrote, and
            // writes their blocks only between renders, while no reader lives. It writes no block
            // of a tree it gave the audio part, and takes the only consumer of its versions. The
            // pieces live only for this render.
            let (readers, notes, mut versions, effects) = unsafe {
                (
                    self.tables.readers(&self.ram),
                    self.notes.reader(),
                    self.versions.consumer(),
                    self.effects.pieces(),
                )
            };
            self.audio.render(
                &mut left,
                &mut right,
                &readers,
                &notes,
                effects,
                &mut self.inbox,
                &mut versions,
                &mut self.outbox,
            );
            [left, right]
        }

        /// Renders `length` samples of a mono sound and checks that both channels are the same.
        fn render(&mut self, length: usize) -> Vec<f32> {
            let [left, right] = self.render_stereo(length);
            assert_eq!(bits(&left), bits(&right));
            left
        }

        fn report(&mut self) -> Option<Report> {
            self.from_audio.pop()
        }
    }

    fn applied(number: u32, sample: u64) -> Option<Report> {
        Some(Report::Applied { number, sample })
    }

    fn note_on(note: u32) -> MessageKind {
        note_of(note, 1, 60, NoteEngine::Synth)
    }

    /// A note of `sound` on track 0 at `pitch` and velocity 127 that plays `engine`.
    fn note_of(note: u32, sound: u32, pitch: u8, engine: NoteEngine) -> MessageKind {
        MessageKind::NoteOn {
            note: NoteId(note),
            track: 0,
            sound: SoundNumber(sound),
            pitch,
            velocity: 127,
            engine,
        }
    }

    fn note_off(note: u32) -> MessageKind {
        MessageKind::NoteOff { note: NoteId(note) }
    }

    fn is_silent(samples: &[f32]) -> bool {
        samples.iter().all(|sample| sample.to_bits() == 0)
    }

    fn bits(samples: &[f32]) -> Vec<u32> {
        samples.iter().map(|sample| sample.to_bits()).collect()
    }

    fn peak(samples: &[f32]) -> f32 {
        samples
            .iter()
            .fold(0.0, |peak, &x| libm::fmaxf(peak, libm::fabsf(x)))
    }

    #[test]
    fn a_new_audio_part_holds_the_values_of_the_factory_project_s_sounds() {
        static FACTORY: Project = Project::factory();
        let audio = Box::new(Audio::new());

        for sound in FACTORY.pool.sounds() {
            assert_eq!(audio.sounds.values(sound.number), &sound.values);
            assert_eq!(audio.sounds.engine(sound.number), NoteEngine::Synth);
        }
        assert!(!audio.sounds.holds(SoundNumber(14)));
    }

    #[test]
    fn silence_without_messages() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);

        assert!(is_silent(&rig.render(128)));
        assert_eq!(rig.audio.position(), 128);
    }

    #[test]
    fn note_messages_are_reported_at_the_chunk_they_apply() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.add_sound();
        rig.send(0, 0, note_on(0));
        rig.send(1, 40, note_on(1));
        rig.send(2, 100, note_off(0));

        rig.render(256);

        assert_eq!(rig.report(), applied(0, 0));
        assert_eq!(rig.report(), applied(1, 64));
        assert_eq!(rig.report(), applied(2, 128));
        assert_eq!(rig.report(), None);
        assert_eq!(rig.inbox.peek(), None);
    }

    #[test]
    fn message_applies_at_the_first_chunk_boundary_at_or_after_its_sample() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.add_sound();
        rig.send(0, 40, note_on(0));

        rig.render(128);

        assert_eq!(rig.report(), applied(0, 64));
        assert_eq!(rig.report(), None);
    }

    #[test]
    fn late_message_applies_at_the_next_chunk() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.add_sound();
        rig.render(128);

        rig.send(7, 10, note_on(0));
        rig.render(128);

        assert_eq!(rig.report(), applied(7, 128));
    }

    #[test]
    fn messages_for_the_same_chunk_apply_in_order() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.add_sound();
        rig.send(0, 33, note_on(0));
        rig.send(1, 40, note_off(0));
        rig.send(2, 96, note_on(1));

        rig.render(96);
        assert_eq!(rig.report(), applied(0, 64));
        assert_eq!(rig.report(), applied(1, 64));
        assert_eq!(rig.report(), None);

        rig.render(32);
        assert_eq!(rig.report(), applied(2, 96));
    }

    #[test]
    fn a_full_report_queue_leaves_messages_and_versions_for_later_chunks() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        for number in 0..REPORT_QUEUE as u32 {
            assert_eq!(
                rig.outbox.push(Report::Applied { number, sample: 0 }),
                Ok(())
            );
        }
        rig.send(999, 0, play(0));
        rig.version(1_000, 0, 0, &[step(0)]);

        // The audio part renders on without waiting and takes neither.
        rig.render(64);
        assert_eq!(rig.audio.sequencer.run(), None);
        assert_eq!(rig.audio.sequencer.tree(0), Tree(None));

        // Each report read makes room for one more, taken in its turn at the next chunk start.
        assert_eq!(rig.report(), applied(0, 0));
        rig.render(CHUNK);
        assert_ne!(rig.audio.sequencer.run(), None);
        assert_eq!(rig.audio.sequencer.tree(0), Tree(None));
        assert_eq!(rig.report(), applied(1, 0));
        rig.render(CHUNK);
        assert_ne!(rig.audio.sequencer.tree(0), Tree(None));
        for number in 2..REPORT_QUEUE as u32 {
            assert_eq!(rig.report(), applied(number, 0));
        }
        assert_eq!(rig.report(), applied(999, 64));
        assert_eq!(rig.report(), applied(1_000, 96));
        assert_eq!(rig.report(), None);
    }

    #[test]
    #[should_panic]
    fn render_refuses_a_batch_that_is_not_a_multiple_of_the_chunk() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);

        rig.render(100);
    }

    #[test]
    #[should_panic]
    #[allow(unsafe_code)]
    fn render_refuses_channels_of_different_lengths() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        // SAFETY: the audio part is told about no file and given no tree, and the rig's pieces
        // have no other user.
        let (readers, notes, mut versions, effects) = unsafe {
            (
                rig.tables.readers(&rig.ram),
                rig.notes.reader(),
                rig.versions.consumer(),
                rig.effects.pieces(),
            )
        };

        rig.audio.render(
            &mut [0.0; 64],
            &mut [0.0; 32],
            &readers,
            &notes,
            effects,
            &mut rig.inbox,
            &mut versions,
            &mut rig.outbox,
        );
    }

    fn cutoff(rig: &Rig<'_>, sound: u32) -> i32 {
        rig.audio.sounds.values(SoundNumber(sound))[Sound::place(CUTOFF.id)]
    }

    fn set_cutoff(sound: u32, value: i32) -> MessageKind {
        MessageKind::SetParam {
            target: Target::Sound(SoundNumber(sound)),
            id: CUTOFF.id,
            value,
        }
    }

    fn new_sound(sound: u32) -> MessageKind {
        MessageKind::NewSound {
            sound: SoundNumber(sound),
        }
    }

    #[test]
    fn the_audio_part_keeps_its_own_copy_of_every_sound() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.send(0, 0, new_sound(1));
        rig.send(1, 0, set_cutoff(1, 100));
        rig.send(2, 0, new_sound(2));

        let samples = rig.render(32);

        assert!(is_silent(&samples));
        assert_eq!(cutoff(&rig, 1), 100);
        assert_eq!(*rig.audio.sounds.values(SoundNumber(2)), SOUND_DEFAULTS);
    }

    #[test]
    fn a_copy_takes_the_values_the_audio_part_holds() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.send(0, 0, new_sound(1));
        rig.send(1, 0, set_cutoff(1, 9_000));
        rig.send(
            2,
            0,
            MessageKind::CopySound {
                sound: SoundNumber(2),
                of: SoundNumber(1),
            },
        );
        rig.send(3, 0, set_cutoff(1, 5));

        rig.render(32);

        assert_eq!(cutoff(&rig, 2), 9_000);
        assert_eq!(cutoff(&rig, 1), 5);
    }

    #[test]
    fn a_device_value_changes_no_sound() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.send(0, 0, new_sound(1));
        rig.send(
            1,
            0,
            MessageKind::SetParam {
                target: Target::Device,
                id: OUTPUT_VOLUME.id,
                value: 3,
            },
        );

        rig.render(32);

        assert_eq!(*rig.audio.sounds.values(SoundNumber(1)), SOUND_DEFAULTS);
        assert_eq!(rig.report(), applied(0, 0));
        assert_eq!(rig.report(), applied(1, 0));
    }

    fn set_sound(sound: u32, entry: &Entry, value: i32) -> MessageKind {
        MessageKind::SetParam {
            target: Target::Sound(SoundNumber(sound)),
            id: entry.id,
            value,
        }
    }

    fn set_volume(value: i32) -> MessageKind {
        MessageKind::SetParam {
            target: Target::Device,
            id: OUTPUT_VOLUME.id,
            value,
        }
    }

    #[test]
    fn a_new_synth_on_a_pad_is_heard() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.send(0, 0, new_sound(1));
        rig.send(1, 0, note_on(0));
        rig.send(2, 32, note_off(0));

        assert!(!is_silent(&rig.render(32)));

        let released = rig.render(9_600);
        assert!(is_silent(&released[9_600 - CHUNK..]));
    }

    #[test]
    fn the_output_volume_turns_it_down_after_the_clipper() {
        let at_volume = |volume| {
            let (messages, reports) = (Queue::new(), Queue::new());
            let mut rig = Rig::new(&messages, &reports);
            rig.send(0, 0, new_sound(1));
            rig.send(1, 0, set_sound(1, &LEVEL, 65_535));
            rig.send(2, 0, set_volume(volume));
            for note in 0..8 {
                rig.send(3 + note, 0, note_on(note));
            }
            rig.render(512)
        };

        // The volume glides over 128 samples.
        let (full, half) = (at_volume(65_535), at_volume(32_768));
        let (full, half) = (&full[128..], &half[128..]);

        // The note is loud enough for the clipper to bend it.
        assert!(peak(full) > 0.5, "peak {}", peak(full));
        for (full, half) in full.iter().zip(half) {
            assert!(libm::fabsf(half - full / 4.0) < 1e-4, "{full} and {half}");
        }
    }

    #[test]
    fn the_output_volume_glides_over_four_chunks() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.send(0, 0, new_sound(1));
        rig.send(1, 0, note_on(0));
        rig.render(256);

        rig.send(2, 256, set_volume(0));
        let gliding = rig.render(4 * CHUNK);
        let after = rig.render(CHUNK);

        assert!(gliding[3 * CHUNK..].iter().any(|&x| x != 0.0));
        assert!(after.iter().all(|&x| x == 0.0));
    }

    fn set_level(target: Target, entry: &Entry, value: i32) -> MessageKind {
        MessageKind::SetParam {
            target,
            id: entry.id,
            value,
        }
    }

    #[test]
    fn a_track_level_scales_only_its_own_track() {
        let output = |second_note: bool, level| {
            let (messages, reports) = (Queue::new(), Queue::new());
            let mut rig = Rig::new(&messages, &reports);
            rig.send(0, 0, new_sound(1));
            rig.send(1, 0, note_on(0));
            if second_note {
                rig.send(
                    2,
                    0,
                    MessageKind::NoteOn {
                        note: NoteId(1),
                        track: 1,
                        sound: SoundNumber(1),
                        pitch: 60,
                        velocity: 127,
                        engine: NoteEngine::Synth,
                    },
                );
            }
            rig.send(3, 0, set_level(Target::Track(1), &TRACK_LEVEL, level));
            rig.render(256)
        };

        let alone = output(false, 65_535);

        // The level glides over 128 samples.
        assert_eq!(bits(&output(true, 0)[128..]), bits(&alone[128..]));
        assert_ne!(bits(&output(true, 65_535)), bits(&alone));
    }

    #[test]
    fn the_master_level_leaves_the_preview_and_the_click_alone() {
        let output = |note: bool, master| {
            let (queue, reports) = (Queue::new(), Queue::new());
            let mut rig = Rig::with_two_files(&queue, &reports, FRAMES);
            rig.send(0, 0, new_sound(1));
            if note {
                rig.send(1, 0, note_on(0));
            }
            rig.send(2, 0, preview(0, FRAMES, false));
            rig.send(3, 0, set_device(&METRONOME, 1));
            rig.send(4, 0, play(0));
            rig.send(5, 0, set_level(Target::Project, &MASTER_LEVEL, master));
            rig.render(1_440)
        };

        let alone = output(false, 65_535);

        // The level glides over 128 samples.
        assert!(!is_silent(&alone[128..]));
        assert_eq!(bits(&output(true, 0)[128..]), bits(&alone[128..]));
        assert_ne!(bits(&output(true, 65_535)), bits(&alone));
    }

    #[test]
    fn a_level_change_glides_over_four_chunks() {
        let output = |level| {
            let (messages, reports) = (Queue::new(), Queue::new());
            let mut rig = Rig::new(&messages, &reports);
            rig.send(0, 0, new_sound(1));
            rig.send(1, 0, note_on(0));
            rig.send(2, 256, set_level(Target::Track(0), &TRACK_LEVEL, level));
            rig.render(512)
        };

        let (steady, changed) = (output(65_535), output(32_768));

        // The note stays within the clipper's straight part, so only the gain differs.
        assert!(peak(&steady) <= 0.5, "peak {}", peak(&steady));
        assert!(!is_silent(&steady[256..384]));
        assert_eq!(bits(&changed[..256]), bits(&steady[..256]));
        let ends =
            [65_535, 57_344, 49_152, 40_960, 32_768].map(|value| param::real(&TRACK_LEVEL, value));
        for (n, (changed, steady)) in changed[256..].iter().zip(&steady[256..]).enumerate() {
            let chunk = (n / CHUNK).min(4);
            let (before, after) = (ends[chunk], ends[(chunk + 1).min(4)]);
            let gain = before + (after - before) * (n % CHUNK + 1) as f32 / CHUNK as f32;
            assert!(libm::fabsf(changed - steady * gain) < 1e-6, "sample {n}");
        }
    }

    #[test]
    fn a_value_change_reaches_a_held_note() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.send(0, 0, new_sound(1));
        rig.send(1, 0, note_on(0));
        assert!(!is_silent(&rig.render(256)[256 - CHUNK..]));

        rig.send(2, 256, set_sound(1, &LEVEL, 0));
        // The level glides over 128 samples and reaches 0 in the fourth chunk.
        let gliding = rig.render(4 * CHUNK);

        assert!(!is_silent(&gliding[2 * CHUNK..3 * CHUNK]));
        assert!(gliding[3 * CHUNK..].iter().all(|&x| x == 0.0));
    }

    #[test]
    fn a_choked_voice_fades_out_in_the_chunk_of_the_note_that_chokes_it() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.send(0, 0, new_sound(1));
        rig.send(1, 0, new_sound(2));
        rig.send(2, 0, set_sound(1, &CHOKE_GROUP, 1));
        rig.send(3, 0, set_sound(2, &CHOKE_GROUP, 1));
        // The second sound is silent, so only the fade of the first is heard.
        rig.send(4, 0, set_sound(2, &LEVEL, 0));
        rig.send(5, 0, note_on(0));
        rig.send(
            6,
            256,
            MessageKind::NoteOn {
                note: NoteId(1),
                track: 0,
                sound: SoundNumber(2),
                pitch: 60,
                velocity: 127,
                engine: NoteEngine::Synth,
            },
        );
        assert!(!is_silent(&rig.render(256)));

        let fade = rig.render(CHUNK);
        let after = rig.render(CHUNK);

        assert!(fade.iter().any(|&x| x != 0.0));
        assert_eq!(fade[CHUNK - 1], 0.0);
        assert!(after.iter().all(|&x| x == 0.0));
    }

    fn delete_sound(sound: u32) -> MessageKind {
        MessageKind::DeleteSound {
            sound: SoundNumber(sound),
        }
    }

    #[test]
    fn a_deleted_sounds_voices_fade_within_one_chunk() {
        let played = |notes: &[(u32, u32)], delete: bool| {
            let (messages, reports) = (Queue::new(), Queue::new());
            let mut rig = Rig::new(&messages, &reports);
            rig.send(0, 0, new_sound(1));
            rig.send(1, 0, new_sound(2));
            for (number, &(note, sound)) in (2..).zip(notes) {
                rig.send(number, 0, note_of(note, sound, 60, NoteEngine::Synth));
            }
            if delete {
                rig.send(notes.len() as u32 + 2, 64, delete_sound(1));
            }
            let out = rig.render(160);
            (out, rig.audio.voices.sounding())
        };

        let (deleted, sounding) = played(&[(0, 1)], true);

        let fade = &deleted[64..96];
        assert!(!is_silent(fade));
        assert_eq!(fade[CHUNK - 1], 0.0);
        assert!(is_silent(&deleted[96..]));
        assert_eq!(sounding, 0);
        // The voice of the other sound plays on, and the fade ends at 0 within the chunk.
        let (both, sounding) = played(&[(0, 1), (1, 2)], true);
        let (alone, _) = played(&[(1, 2)], false);
        assert_ne!(bits(&both[64..95]), bits(&alone[64..95]));
        assert_eq!(bits(&both[95..]), bits(&alone[95..]));
        assert_eq!(sounding, 1);
    }

    #[test]
    fn a_note_off_after_its_sound_is_deleted_does_nothing() {
        for mode in [POLY, MONO, LEGATO] {
            let (messages, reports) = (Queue::new(), Queue::new());
            let mut rig = Rig::new(&messages, &reports);
            rig.send(0, 0, new_sound(1));
            rig.send(1, 0, new_sound(2));
            rig.send(2, 0, set_sound(1, &PLAY_MODE, mode));
            // Two held keys of sound 1, as a pad and a KEYS note, or as two keys.
            rig.send(3, 0, note_of(0, 1, 60, NoteEngine::Synth));
            rig.send(4, 0, note_of(1, 1, 64, NoteEngine::Synth));
            rig.send(5, 64, delete_sound(1));
            rig.send(6, 128, note_off(1));
            rig.send(7, 128, note_off(0));
            rig.send(8, 160, note_of(2, 2, 60, NoteEngine::Synth));

            rig.render(128);
            assert_eq!(rig.audio.voices.sounding(), 0, "{mode}");
            rig.render(32);
            assert_eq!(rig.audio.voices.sounding(), 0, "{mode}");
            rig.render(64);
            assert_eq!(rig.audio.voices.sounding(), 1, "{mode}");
        }
    }

    #[test]
    fn a_choke_note_after_a_delete_reads_no_deleted_sound() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.send(0, 0, new_sound(1));
        rig.send(1, 0, new_sound(2));
        rig.send(2, 0, set_sound(1, &CHOKE_GROUP, 1));
        rig.send(3, 0, set_sound(2, &CHOKE_GROUP, 1));
        rig.send(4, 0, note_of(0, 1, 60, NoteEngine::Synth));
        rig.send(5, 64, delete_sound(1));
        rig.send(6, 128, note_of(1, 2, 60, NoteEngine::Synth));
        rig.send(7, 160, note_off(0));

        rig.render(192);

        assert_eq!(rig.audio.voices.sounding(), 1);
    }

    #[test]
    fn the_audio_part_has_room_for_a_new_sound_after_a_delete_on_a_full_pool() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        for sound in 1..=POOL_SOUNDS as u32 {
            rig.audio.sounds.add(SoundNumber(sound), SOUND_DEFAULTS);
        }
        rig.send(0, 0, delete_sound(1));
        rig.send(1, 0, new_sound(POOL_SOUNDS as u32 + 1));

        rig.render(32);

        assert_eq!(
            *rig.audio.sounds.values(SoundNumber(POOL_SOUNDS as u32 + 1)),
            SOUND_DEFAULTS
        );
    }

    #[test]
    fn a_chunk_of_deletes_then_a_new_sound_on_a_full_pool_keeps_the_others_found() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        for sound in 1..=POOL_SOUNDS as u32 {
            let mut values = SOUND_DEFAULTS;
            values[Sound::place(CUTOFF.id)] = sound as i32;
            rig.audio.sounds.add(SoundNumber(sound), values);
        }
        // The most the queue holds: the deletes of sounds 2 to 256, then a new sound.
        let deletes = MESSAGE_QUEUE as u32 - 1;
        for number in 0..deletes {
            rig.send(number, 0, delete_sound(number + 2));
        }
        rig.send(deletes, 0, new_sound(POOL_SOUNDS as u32 + 1));

        rig.render(32);

        assert_eq!(rig.inbox.peek(), None);
        assert_eq!(cutoff(&rig, 1), 1);
        assert_eq!(cutoff(&rig, deletes + 2), deletes as i32 + 2);
        assert_eq!(cutoff(&rig, POOL_SOUNDS as u32), POOL_SOUNDS as i32);
        assert_eq!(
            *rig.audio.sounds.values(SoundNumber(POOL_SOUNDS as u32 + 1)),
            SOUND_DEFAULTS
        );
    }

    #[test]
    fn the_loudest_mix_stays_within_one() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.send(0, 0, new_sound(1));
        rig.send(1, 0, set_sound(1, &WAVE, SUPERSAW));
        rig.send(2, 0, set_sound(1, &SPREAD, 65_535));
        rig.send(3, 0, set_sound(1, &LEVEL, 65_535));
        rig.send(4, 0, set_sound(1, &RESONANCE, 65_535));
        rig.send(5, 0, set_volume(65_535));
        for note in 0..32 {
            rig.send(6 + note, 0, note_on(note));
        }

        let [left, right] = rig.render_stereo(48_000);

        assert!(
            left.iter()
                .chain(&right)
                .all(|x| x.is_finite() && libm::fabsf(*x) <= 1.0)
        );
        assert!(peak(&left) > 0.9 && peak(&right) > 0.9);
    }

    #[test]
    fn the_output_does_not_depend_on_the_batch_size() {
        let rendered = |batch: usize| {
            let (messages, reports) = (Queue::new(), Queue::new());
            let mut rig = Rig::new(&messages, &reports);
            rig.send(0, 0, new_sound(1));
            rig.send(1, 0, set_sound(1, &WAVE, SUPERSAW));
            rig.send(2, 0, set_sound(1, &SPREAD, 32_768));
            rig.send(3, 0, note_on(0));
            rig.send(4, 100, set_volume(20_000));
            rig.send(5, 200, note_on(1));
            rig.send(6, 300, note_off(0));
            let mut channels = [Vec::new(), Vec::new()];
            for _ in 0..512 / batch {
                let [left, right] = rig.render_stereo(batch);
                channels[0].extend(bits(&left));
                channels[1].extend(bits(&right));
            }
            channels
        };

        let by_chunks = rendered(CHUNK);

        assert_eq!(by_chunks, rendered(MAX_BATCH));
        assert!(by_chunks[0].iter().any(|&x| x != 0));
    }

    /// `count` samples, each unlike its neighbours and quiet enough that a preview of them and 32
    /// quiet notes stay below 0.5.
    fn samples(count: usize) -> Vec<i16> {
        (0..count)
            .map(|n| (n * 37 % 8_192) as i16 - 4_096)
            .collect()
    }

    /// The samples as the preview plays them: at the Level default through the centred pan.
    fn played(samples: &[i16]) -> Vec<f32> {
        let gain = param::real(&LEVEL, LEVEL.default) * libm::sqrtf(0.5);
        samples
            .iter()
            .map(|&sample| f32::from(sample) / 32_768.0 * gain)
            .collect()
    }

    /// `samples` of a file that ends right after them as the preview plays them: the last 48
    /// frames, 1 ms, fade out in a straight line, the nth from the end scaled by n / 48.
    fn fade_out(mut samples: Vec<f32>) -> Vec<f32> {
        let frames = samples.len();
        for (n, sample) in samples.iter_mut().enumerate() {
            *sample *= (frames - n).min(48) as f32 / 48.0;
        }
        samples
    }

    fn preview(file: u16, frames: u32, stereo: bool) -> MessageKind {
        MessageKind::Preview {
            sample: SampleFile {
                file: FileId(file),
                frames,
                stereo,
            },
        }
    }

    /// The frames of each file of `Rig::with_two_files`: past a block and not a whole number of
    /// chunks.
    const FRAMES: u32 = 1_100;

    /// What a `Rig::with_two_files` of `FRAMES` plays for `length` samples with `messages`,
    /// numbered from 0.
    fn previewed(messages: &[(u64, MessageKind)], length: usize) -> Vec<f32> {
        let (queue, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::with_two_files(&queue, &reports, FRAMES);
        for (number, &(at, kind)) in (0..).zip(messages) {
            rig.send(number, at, kind);
        }
        rig.render(length)
    }

    /// Adds two outputs sample by sample.
    fn sum(first: &[f32], second: &[f32]) -> Vec<f32> {
        first.iter().zip(second).map(|(a, b)| a + b).collect()
    }

    #[test]
    fn a_preview_plays_the_file_once_at_the_default_sound_level() {
        let out = previewed(&[(0, preview(0, FRAMES, false))], 1_216);

        let frames = FRAMES as usize;
        assert_eq!(
            bits(&out[..frames]),
            bits(&fade_out(played(&samples(frames))))
        );
        assert!(is_silent(&out[frames..]));
    }

    #[test]
    fn a_preview_fades_out_over_the_last_48_frames_of_its_file() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.full_volume();
        // The last 48 of 1,100 frames span three chunks.
        let file = played(&[i16::MAX; FRAMES as usize]);
        rig.add_file(0, false, &[i16::MAX; FRAMES as usize]);
        rig.send(0, 0, preview(0, FRAMES, false));

        let out = rig.render(1_216);

        let (frames, before) = (FRAMES as usize, FRAMES as usize - 48);
        assert_eq!(bits(&out[..before]), bits(&file[..before]));
        assert_eq!(bits(&out[..frames]), bits(&fade_out(file)));
        assert!(is_silent(&out[frames..]));
    }

    #[test]
    fn a_preview_of_fewer_than_48_frames_fades_out_over_its_whole_file() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.full_volume();
        rig.add_file(0, false, &[i16::MAX; 20]);
        rig.send(0, 0, preview(0, 20, false));

        let out = rig.render(64);

        assert_eq!(bits(&out[..20]), bits(&fade_out(played(&[i16::MAX; 20]))));
        assert!(is_silent(&out[20..]));
    }

    #[test]
    fn a_stereo_preview_keeps_its_channels() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.full_volume();
        // 600 frames, past the 512 of a block.
        let file = samples(2 * 600);
        rig.add_file(0, true, &file);
        rig.send(0, 0, preview(0, 600, true));

        let [left, right] = rig.render_stereo(640);

        let [lefts, rights] = [0, 1].map(|channel| {
            file.iter()
                .skip(channel)
                .step_by(2)
                .copied()
                .collect::<Vec<_>>()
        });
        assert_eq!(bits(&left[..600]), bits(&fade_out(played(&lefts))));
        assert_eq!(bits(&right[..600]), bits(&fade_out(played(&rights))));
        assert!(is_silent(&left[600..]) && is_silent(&right[600..]));
    }

    #[test]
    fn stop_and_forget_fade_within_one_chunk() {
        let file = played(&samples(FRAMES as usize));
        for stop in [
            MessageKind::StopPreview,
            MessageKind::ForgetSample { file: FileId(0) },
        ] {
            let out = previewed(&[(0, preview(0, FRAMES, false)), (64, stop)], 160);

            let (playing, fade, after) = (&out[..64], &out[64..96], &out[96..]);
            assert_eq!(bits(playing), bits(&file[..64]), "{stop:?}");
            // The fade starts where the file goes on.
            assert!(libm::fabsf(fade[0] - file[64]) < 1e-6, "{stop:?}");
            assert_eq!(fade[CHUNK - 1], 0.0, "{stop:?}");
            assert!(is_silent(after), "{stop:?}");
        }
    }

    #[test]
    fn a_stop_before_the_last_48_frames_fades_by_the_stop_alone() {
        let stop = [
            (0, preview(0, FRAMES, false)),
            (64, MessageKind::StopPreview),
        ];
        // A rig of longer files plays the same first samples of file 0, with no end near.
        let (queue, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::with_two_files(&queue, &reports, 2 * FRAMES);
        rig.send(0, 0, preview(0, 2 * FRAMES, false));
        rig.send(1, 64, MessageKind::StopPreview);

        assert_eq!(bits(&rig.render(160)), bits(&previewed(&stop, 160)));
    }

    #[test]
    fn a_stop_reads_nothing_more_of_the_file() {
        for stop in [
            MessageKind::StopPreview,
            MessageKind::ForgetSample { file: FileId(0) },
            preview(1, FRAMES, false),
        ] {
            let messages = [(0, preview(0, FRAMES, false)), (64, stop)];
            let (queue, reports) = (Queue::new(), Queue::new());
            let mut rig = Rig::with_two_files(&queue, &reports, FRAMES);
            for (number, &(at, kind)) in (0..).zip(&messages) {
                rig.send(number, at, kind);
            }
            rig.render(64);
            // From the stop's chunk on the audio part reads none of file 0, so wiping its blocks
            // now changes nothing that it plays: the fade is of what it read before.
            let blocks: Vec<u32> = rig.listing.blocks(&rig.tables, FileId(0)).collect();
            rig.write(&blocks, &[0; 2 * 1_024]);

            let fade = rig.render(CHUNK);

            assert_eq!(
                bits(&fade),
                bits(&previewed(&messages, 96)[64..]),
                "{stop:?}"
            );
        }
    }

    #[test]
    fn forgetting_another_file_changes_nothing() {
        let start = (0, preview(0, FRAMES, false));
        let forget = (64, MessageKind::ForgetSample { file: FileId(1) });

        let out = previewed(&[start, forget], 1_216);

        assert_eq!(bits(&out), bits(&previewed(&[start], 1_216)));
    }

    #[test]
    fn a_new_preview_fades_the_old_one_out() {
        let first = (0, preview(0, FRAMES, false));
        let second = (64, preview(1, FRAMES, false));
        let faded = previewed(&[first, (64, MessageKind::StopPreview)], 256);

        let both = previewed(&[first, second], 256);

        assert_eq!(bits(&both), bits(&sum(&faded, &previewed(&[second], 256))));
        // A preview that a third one replaces before it sounded plays nothing, so no more than
        // two ever overlap.
        let third = (64, preview(0, FRAMES, false));
        let replaced = previewed(&[first, second, third], 256);
        assert_eq!(
            bits(&replaced),
            bits(&sum(&faded, &previewed(&[third], 256)))
        );
    }

    #[test]
    #[allow(unsafe_code)]
    fn use_table_switches_at_its_chunk() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.full_volume();
        // File 1 lies in table 0 from entry 1. Once file 0 has gone, file 2 takes every other
        // block, so they are packed into table 1, file 1 from entry 0.
        rig.add_file(0, false, &samples(1));
        let file = samples(2 * 1_024);
        rig.add_file(1, false, &file);
        // SAFETY: the audio part was never told about file 0.
        unsafe { rig.listing.forget(FileId(0)) };
        rig.blocks.give_back(0);
        let rest = rig.blocks.take(BLOCKS - 2).expect("the rest is free");
        let listed = rig.listing.add(&rig.tables, FileId(2), rest);
        assert_eq!(listed, Some(Listed::Packed { version: 1 }));
        // Only table 1 lists file 2: through table 0 its frames past its first block would be
        // file 1's.
        let other = samples(4 * 1_024)[2 * 1_024..].to_vec();
        let blocks: Vec<u32> = rig.listing.blocks(&rig.tables, FileId(2)).take(2).collect();
        rig.write(&blocks, &other);
        rig.send(0, 0, preview(1, 2 * 1_024, false));
        rig.send(1, 40, MessageKind::UseTable { version: 1 });
        // A message after the `UseTable` names file 2 as table 1 lists it.
        rig.send(2, 2_112, preview(2, 2 * 1_024, false));

        let before = rig.render(64);
        assert_eq!(rig.audio.table, 0);
        let after = rig.render(2 * 1_024);
        assert_eq!(rig.audio.table, 1);
        let later = rig.render(2 * 1_024);

        let out = [before, after].concat();
        assert_eq!(bits(&out[..2 * 1_024]), bits(&fade_out(played(&file))));
        assert_eq!(bits(&later), bits(&fade_out(played(&other))));
        assert_eq!(rig.report(), applied(0, 0));
        assert_eq!(rig.report(), applied(1, 64));
        assert_eq!(rig.report(), applied(2, 2_112));
    }

    #[test]
    fn the_preview_takes_no_voice() {
        let play = |notes: bool, previews: bool| {
            let (messages, reports) = (Queue::new(), Queue::new());
            let mut rig = Rig::new(&messages, &reports);
            rig.full_volume();
            rig.add_file(0, false, &samples(FRAMES as usize));
            rig.send(0, 0, new_sound(1));
            // Quiet notes, so that the sum stays below 0.5, where the clipper changes nothing.
            rig.send(1, 0, set_sound(1, &LEVEL, 8_000));
            for note in (0..32).filter(|_| notes) {
                rig.send(2 + note, 0, note_on(note));
            }
            if previews {
                rig.send(40, 64, preview(0, FRAMES, false));
            }
            rig.render(512)
        };
        let (voices, preview) = (play(true, false), play(false, true));
        assert!(!is_silent(&voices) && !is_silent(&preview));

        let both = play(true, true);

        // Every note keeps its voice: the output is the voices alone and the preview alone.
        assert!(peak(&both) < 0.5, "peak {}", peak(&both));
        assert_eq!(bits(&both), bits(&sum(&voices, &preview)));
    }

    /// A reader of a sample RAM that holds no file, for the voices' tests, whose synth notes read
    /// none.
    #[allow(unsafe_code)]
    pub(super) fn empty_reader() -> Reader<'static> {
        static TABLES: Tables = Tables::new();
        static RAM: SampleRam = SampleRam::new();
        // SAFETY: a synth note reads no file.
        let [reader, _] = unsafe { TABLES.readers(&RAM) };
        reader
    }

    /// The frames of each file of `Rig::with_sample_sound`: 200 ms.
    const LENGTH: u32 = 9_600;

    /// The values of a sample sound of a file of `frames` frames, as a new sample sound of a file
    /// without a loop starts (One-shot, Loop off, from the first frame to the last, Root note 60),
    /// with `changes`.
    fn sample_sound(frames: u32, changes: &[(&Entry, i32)]) -> [i32; SOUND_VALUES] {
        let last = frames as i32 - 1;
        let mut values = SOUND_DEFAULTS;
        for &(entry, value) in [(&TRIGGER, ONE_SHOT), (&END, last), (&LOOP_END, last)]
            .iter()
            .chain(changes)
        {
            values[Sound::place(entry.id)] = value;
        }
        values
    }

    /// The engine of a note that plays `file`, a mono file of `LENGTH` frames.
    fn plays(file: u16) -> NoteEngine {
        NoteEngine::Sample(Some(SampleFile {
            file: FileId(file),
            frames: LENGTH,
            stereo: false,
        }))
    }

    #[test]
    fn a_one_shot_sample_plays_to_its_end_at_full_sustain() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::with_sample_sound(&messages, &reports, &[]);
        rig.send(0, 0, note_of(0, 1, 60, plays(0)));

        let out = rig.render(LENGTH as usize);

        // As loud near its end, past frame 9,000, as at its start.
        let (start, end) = (peak(&out[..640]), peak(&out[8_960..]));
        assert!(libm::fabsf(end / start - 1.0) < 0.1, "{start} then {end}");
        assert_eq!(rig.audio.voices.sounding(), 0);
        assert!(is_silent(&rig.render(CHUNK)));
    }

    #[test]
    fn a_looping_one_shot_sample_ends_by_its_decay() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::with_sample_sound(&messages, &reports, &[(&LOOP, 1)]);
        rig.send(0, 0, note_of(0, 1, 60, plays(0)));

        // Decay's 300 ms twice over.
        let out = rig.render(28_800);

        assert!(!is_silent(&out[LENGTH as usize..][..CHUNK]));
        assert!(is_silent(&out[28_800 - CHUNK..]));
        assert_eq!(rig.audio.voices.sounding(), 0);
    }

    #[test]
    fn lowering_sustain_shortens_a_one_shot_sample() {
        let (messages, reports) = (Queue::new(), Queue::new());
        // A decay of 10 ms.
        let changes: &[(&Entry, i32)] = &[(&SUSTAIN, 0), (&DECAY, 6_554)];
        let mut rig = Rig::with_sample_sound(&messages, &reports, changes);
        rig.send(0, 0, note_of(0, 1, 60, plays(0)));

        let out = rig.render(3_200);

        assert!(!is_silent(&out[..CHUNK]));
        assert!(is_silent(&out[3_200 - CHUNK..]));
        assert_eq!(rig.audio.voices.sounding(), 0);
    }

    #[test]
    fn a_gate_sample_releases_when_let_go_and_ends_at_its_end_when_held() {
        for let_go in [false, true] {
            let (messages, reports) = (Queue::new(), Queue::new());
            let mut rig = Rig::with_sample_sound(&messages, &reports, &[(&TRIGGER, GATE)]);
            rig.send(0, 0, note_of(0, 1, 60, plays(0)));
            if let_go {
                rig.send(1, 320, note_off(0));
            }

            // A release of about 100 ms ends a let-go note long before the file's end.
            rig.render(8_000);
            let held = usize::from(!let_go);
            assert_eq!(rig.audio.voices.sounding(), held, "let go {let_go}");
            rig.render(LENGTH as usize - 8_000 - CHUNK);
            assert_eq!(rig.audio.voices.sounding(), held, "let go {let_go}");
            rig.render(CHUNK);
            assert_eq!(rig.audio.voices.sounding(), 0, "let go {let_go}");
        }
    }

    #[test]
    fn a_sample_plays_an_octave_up_twelve_semitones_above_its_root() {
        let played = |file: &[i16], pitch| {
            let (messages, reports) = (Queue::new(), Queue::new());
            let mut rig = Rig::new(&messages, &reports);
            rig.full_volume();
            rig.add_file(0, false, file);
            let frames = file.len() as u32;
            rig.audio
                .sounds
                .add(SoundNumber(1), sample_sound(frames, &[]));
            let sample = SampleFile {
                file: FileId(0),
                frames,
                stereo: false,
            };
            rig.send(0, 0, note_of(0, 1, pitch, NoteEngine::Sample(Some(sample))));
            let out = rig.render(LENGTH as usize / 2 + CHUNK);
            (bits(&out), rig.audio.voices.sounding())
        };
        let file = samples(LENGTH as usize);
        let every_other: Vec<i16> = file.iter().step_by(2).copied().collect();

        // Root note 60 and pitch 72 read every other frame, so the note ends in half the time.
        let (up, sounding) = played(&file, 72);

        assert_eq!(up, played(&every_other, 60).0);
        assert_eq!(sounding, 0);
    }

    #[test]
    fn a_stereo_file_makes_a_stereo_voice() {
        let file = samples(2 * 640);
        let played = |samples: &[i16], stereo: bool| {
            let (messages, reports) = (Queue::new(), Queue::new());
            let mut rig = Rig::new(&messages, &reports);
            rig.full_volume();
            rig.add_file(0, stereo, samples);
            rig.audio.sounds.add(SoundNumber(1), sample_sound(640, &[]));
            let sample = SampleFile {
                file: FileId(0),
                frames: 640,
                stereo,
            };
            rig.send(0, 0, note_of(0, 1, 60, NoteEngine::Sample(Some(sample))));
            rig.render_stereo(640).map(|channel| bits(&channel))
        };

        let [left, right] = played(&file, true);

        // Each channel plays as a mono file of it does.
        let [lefts, rights] = [0, 1].map(|channel| {
            file.iter()
                .skip(channel)
                .step_by(2)
                .copied()
                .collect::<Vec<_>>()
        });
        assert_eq!(left, played(&lefts, false)[0]);
        assert_eq!(right, played(&rights, false)[1]);
        assert_ne!(left, right);
    }

    #[test]
    fn a_missing_sample_takes_a_voice_and_sounds_nothing() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::with_sample_sound(&messages, &reports, &[(&CHOKE_GROUP, 1)]);
        let mut synth = SOUND_DEFAULTS;
        synth[Sound::place(CHOKE_GROUP.id)] = 1;
        rig.audio.sounds.add(SoundNumber(2), synth);
        rig.send(0, 0, note_of(0, 2, 60, NoteEngine::Synth));
        rig.send(1, 64, note_of(1, 1, 60, NoteEngine::Sample(None)));
        assert!(!is_silent(&rig.render(64)));

        // Only the fade of the synth it chokes sounds, and its own voice is free after one chunk.
        let fade = rig.render(CHUNK);

        assert!(!is_silent(&fade));
        assert_eq!(fade[CHUNK - 1], 0.0);
        assert_eq!(rig.audio.voices.sounding(), 0);
        assert!(is_silent(&rig.render(CHUNK)));
    }

    #[test]
    fn mono_restarts_a_sample_and_legato_keeps_its_place() {
        // Each note at its own sample, playing a file: 2 is silence.
        let played = |mode, notes: &[(u64, u16)]| {
            let (messages, reports) = (Queue::new(), Queue::new());
            let mut rig = Rig::with_sample_sound(&messages, &reports, &[(&PLAY_MODE, mode)]);
            rig.add_file(2, false, &[0; LENGTH as usize]);
            for (note, &(at, file)) in (0..).zip(notes) {
                rig.send(note, at, note_of(note, 1, 60, plays(file)));
            }
            let out = rig.render(LENGTH as usize + 320);
            (bits(&out), rig.audio.voices.sounding())
        };
        let (alone, _) = played(MONO, &[(0, 0)]);

        // Mono plays file 0 from its start as a new note of it would: the silence before left no
        // trace in the filter.
        let (mono, sounding) = played(MONO, &[(0, 2), (320, 0)]);
        assert_eq!(mono[320..], alone[..LENGTH as usize]);
        assert_eq!(sounding, 0);
        // Legato goes on with file 0 from where it was.
        let (legato, _) = played(LEGATO, &[(0, 0), (320, 1)]);
        assert_eq!(legato, alone);
    }

    /// The old and the new file, files 2 and 3 of `played_in_mode`, of `LENGTH` frames each. The
    /// frames are all multiples of 31, so that the straight fade out of any of them over a chunk
    /// is a whole number.
    fn old_and_new_files() -> [Vec<i16>; 2] {
        let file = samples(2 * LENGTH as usize);
        [&file[..LENGTH as usize], &file[LENGTH as usize..]]
            .map(|frames| frames.iter().map(|x| x / 31 * 31).collect())
    }

    /// The frames of the one note that plays what a Mono voice does when `notes`, pairs of a
    /// start (a multiple of `CHUNK`, in frames) and a file, restart it in turn: from its start
    /// the file plays, and the frames of the file before it fade out in a straight line over the
    /// chunk in which it begins.
    fn restarted(notes: &[(usize, &[i16])]) -> Vec<i16> {
        let mut played: Vec<i16> = Vec::new();
        for &(at, file) in notes {
            let mut next = [&played[..at], file].concat();
            for n in 0..CHUNK.min(played.len() - at) {
                let fade = (CHUNK - 1 - n) as i32 * i32::from(played[at + n]) / (CHUNK - 1) as i32;
                next[at + n] += fade as i16;
            }
            played = next;
        }
        played
    }

    /// What a sample sound that plays `file` once, from the first sample, gives for `length`
    /// samples.
    fn plays_once(file: &[i16], length: usize) -> Vec<f32> {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.full_volume();
        rig.add_file(0, false, file);
        let frames = file.len() as u32;
        rig.audio
            .sounds
            .add(SoundNumber(1), sample_sound(frames, &[]));
        rig.send(
            0,
            0,
            note_of(
                0,
                1,
                60,
                NoteEngine::Sample(Some(SampleFile {
                    file: FileId(0),
                    frames,
                    stereo: false,
                })),
            ),
        );
        rig.render(length)
    }

    /// What a sample sound of play mode `mode` gives for `length` samples with `messages`,
    /// numbered from 0, and how many voices sound after, when files 2 and 3 are
    /// `old_and_new_files`.
    fn played_in_mode(
        mode: i32,
        messages: &[(u64, MessageKind)],
        length: usize,
    ) -> (Vec<f32>, usize) {
        let (queue, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::with_sample_sound(&queue, &reports, &[(&PLAY_MODE, mode)]);
        for (file, frames) in (2..).zip(old_and_new_files()) {
            rig.add_file(file, false, &frames);
        }
        for (number, &(at, kind)) in (0..).zip(messages) {
            rig.send(number, at, kind);
        }
        (rig.render(length), rig.audio.voices.sounding())
    }

    #[test]
    fn a_mono_restart_fades_the_old_sample_out_as_the_new_one_starts() {
        let [old, new] = old_and_new_files();

        let (out, sounding) = played_in_mode(
            MONO,
            &[
                (0, note_of(0, 1, 60, plays(2))),
                (320, note_of(1, 1, 60, plays(3))),
            ],
            320 + LENGTH as usize + CHUNK,
        );

        // The old sample's next chunk adds to the new sample's first and goes through the same
        // filter and envelopes, so one note that plays the sum of them gives the same output.
        assert_eq!(
            bits(&out),
            bits(&plays_once(
                &restarted(&[(0, &old), (320, &new)]),
                out.len()
            ))
        );
        assert_eq!(sounding, 0);
    }

    #[test]
    fn a_mono_restart_at_another_velocity_fades_the_old_sample_at_its_own_volume() {
        // What a Mono sample sound plays with `messages`, numbered from 0, when file 2 is the old
        // file, sounding from its start so that at a restart the filter still holds some of it,
        // and file 3 is the new file.
        let played = |messages: &[(u64, MessageKind)]| {
            let (queue, reports) = (Queue::new(), Queue::new());
            let mut rig = Rig::with_sample_sound(&queue, &reports, &[(&PLAY_MODE, MONO)]);
            let [old, new] = old_and_new_files();
            rig.add_file(2, false, &old);
            rig.add_file(3, false, &new);
            for (number, &(at, kind)) in (0..).zip(messages) {
                rig.send(number, at, kind);
            }
            rig.render(352)
        };
        let old = (0, note_of(0, 1, 60, plays(2)));
        let new = MessageKind::NoteOn {
            note: NoteId(1),
            track: 0,
            sound: SoundNumber(1),
            pitch: 60,
            velocity: 32,
            engine: plays(3),
        };

        let out = played(&[old, (320, new)]);

        // The old sample fades as a restart at its own velocity onto a missing sample fades it, what
        // the filter still holds of it included, and the new note's first chunk adds to that.
        let faded = played(&[old, (320, note_of(1, 1, 60, NoteEngine::Sample(None)))]);
        let first = played(&[(320, new)]);
        assert!(!is_silent(&faded[320..]) && !is_silent(&first[320..]));
        for n in 320..352 {
            let expected = faded[n] + first[n];
            assert!(
                libm::fabsf(out[n] - expected) < 1e-6,
                "{n}: {} and {expected}",
                out[n]
            );
        }
    }

    #[test]
    fn a_mono_synth_restart_at_another_velocity_moves_its_volume_in_a_line() {
        // What a Mono synth sound plays when a note at velocity 127 is restarted at sample 320 by
        // one of the same pitch at `velocity`.
        let played = |velocity| {
            let (messages, reports) = (Queue::new(), Queue::new());
            let mut rig = Rig::new(&messages, &reports);
            rig.send(0, 0, new_sound(1));
            rig.send(1, 0, set_sound(1, &PLAY_MODE, MONO));
            rig.send(2, 0, note_of(0, 1, 60, NoteEngine::Synth));
            let restart = MessageKind::NoteOn {
                note: NoteId(1),
                track: 0,
                sound: SoundNumber(1),
                pitch: 60,
                velocity,
                engine: NoteEngine::Synth,
            };
            rig.send(3, 320, restart);
            rig.render(384)
        };
        let (soft, loud) = (played(32), played(127));
        let read = |id| SOUND_DEFAULTS[Sound::place(id)];
        let ratio = voice::level_gain(read, 32) / voice::level_gain(read, 127);
        assert!(ratio < 0.9 && !is_silent(&loud[320..]));

        // The oscillator and the envelopes go on the same either way: only the volume moves, from
        // the old note's to the new one's across the restart chunk.
        for n in 320..384 {
            let step = ((n - 319) as f32 / CHUNK as f32).min(1.0);
            let expected = loud[n] * (1.0 + (ratio - 1.0) * step);
            assert!(
                libm::fabsf(soft[n] - expected) < 1e-6,
                "{n}: {} and {expected}",
                soft[n]
            );
        }
    }

    #[test]
    fn a_mono_return_to_a_held_key_fades_the_same_way() {
        let [old, new] = old_and_new_files();

        let (out, sounding) = played_in_mode(
            MONO,
            &[
                (0, note_of(0, 1, 60, plays(2))),
                (320, note_of(1, 1, 60, plays(3))),
                (640, note_off(1)),
            ],
            640 + LENGTH as usize + CHUNK,
        );

        // The first key is still held, so the return restarts its file.
        assert_eq!(
            bits(&out),
            bits(&plays_once(
                &restarted(&[(0, &old), (320, &new), (640, &old)]),
                out.len()
            ))
        );
        assert_eq!(sounding, 0);
    }

    #[test]
    fn a_legato_note_after_its_key_was_let_go_restarts_and_fades_the_same_way() {
        let [old, new] = old_and_new_files();

        // One-shot ignores the letting go, so the sample sounds on, with its key up.
        let (out, sounding) = played_in_mode(
            LEGATO,
            &[
                (0, note_of(0, 1, 60, plays(2))),
                (320, note_off(0)),
                (352, note_of(1, 1, 60, plays(3))),
            ],
            352 + LENGTH as usize + CHUNK,
        );

        assert_eq!(
            bits(&out),
            bits(&plays_once(
                &restarted(&[(0, &old), (352, &new)]),
                out.len()
            ))
        );
        assert_eq!(sounding, 0);
    }

    #[test]
    fn two_mono_notes_in_one_chunk_fade_the_sound_that_was_heard() {
        let [old, _] = old_and_new_files();

        // The first note's file never sounds: both notes apply at the chunk of sample 352.
        let (out, sounding) = played_in_mode(
            MONO,
            &[
                (0, note_of(0, 1, 60, plays(2))),
                (321, note_of(1, 1, 60, plays(3))),
                (335, note_of(2, 1, 60, plays(2))),
            ],
            352 + LENGTH as usize + CHUNK,
        );

        // The output is that of a single restart onto the second note's file.
        assert_eq!(
            bits(&out),
            bits(&plays_once(
                &restarted(&[(0, &old), (352, &old)]),
                out.len()
            ))
        );
        assert_eq!(sounding, 0);
    }

    #[test]
    fn a_mono_restart_onto_a_missing_sample_fades_the_old_one_and_sounds_nothing() {
        let [old, _] = old_and_new_files();

        let (out, sounding) = played_in_mode(
            MONO,
            &[
                (0, note_of(0, 1, 60, plays(2))),
                (320, note_of(1, 1, 60, NoteEngine::Sample(None))),
            ],
            640,
        );

        assert_eq!(
            bits(&out[..352]),
            bits(&plays_once(
                &restarted(&[(0, &old), (320, &[0; LENGTH as usize])]),
                352
            ))
        );
        assert!(is_silent(&out[352..]));
        assert_eq!(sounding, 0);
    }

    #[test]
    fn a_mono_restart_reads_nothing_more_of_the_old_file() {
        let played = |overwrite: bool, restart: bool| {
            let (messages, reports) = (Queue::new(), Queue::new());
            let mut rig = Rig::with_sample_sound(&messages, &reports, &[(&PLAY_MODE, MONO)]);
            rig.send(0, 0, note_of(0, 1, 60, plays(0)));
            if restart {
                rig.send(1, 64, note_of(1, 1, 60, plays(1)));
            }
            let before = rig.render(64);
            if overwrite {
                rig.overwrite(0);
            }
            bits(&[before, rig.render(128)].concat())
        };
        // A voice that still reads the file plays what was written.
        assert_ne!(played(true, false), played(false, false));

        // The restart fades the chunk read ahead before it, and plays the other file.
        assert_eq!(played(true, true), played(false, true));
    }

    #[test]
    fn forget_fades_the_voices_reading_the_file_within_one_chunk() {
        let played = |files: &[u16], forget: bool| {
            let (messages, reports) = (Queue::new(), Queue::new());
            let mut rig = Rig::with_sample_sound(&messages, &reports, &[]);
            for (note, &file) in (0..).zip(files) {
                rig.send(note, 0, note_of(note, 1, 60, plays(file)));
            }
            if forget {
                let forget = MessageKind::ForgetSample { file: FileId(0) };
                rig.send(files.len() as u32, 64, forget);
            }
            let out = rig.render(160);
            (out, rig.audio.voices.sounding())
        };

        let (forgotten, sounding) = played(&[0], true);

        let fade = &forgotten[64..96];
        assert!(!is_silent(fade));
        assert_eq!(fade[CHUNK - 1], 0.0);
        assert!(is_silent(&forgotten[96..]));
        assert_eq!(sounding, 0);
        // A voice of another file plays on.
        let (both, sounding) = played(&[0, 1], true);
        assert_eq!(bits(&both), bits(&sum(&forgotten, &played(&[1], false).0)));
        assert_eq!(sounding, 1);
    }

    #[test]
    fn a_forgotten_file_is_not_read_from_the_chunk_its_forget_applies() {
        let played = |forget: bool, overwrite: bool| {
            let (messages, reports) = (Queue::new(), Queue::new());
            let mut rig = Rig::with_sample_sound(&messages, &reports, &[]);
            rig.send(0, 0, note_of(0, 1, 60, plays(0)));
            if forget {
                rig.send(1, 64, MessageKind::ForgetSample { file: FileId(0) });
            }
            let before = rig.render(64);
            if overwrite {
                rig.overwrite(0);
            }
            bits(&[before, rig.render(128)].concat())
        };
        // A voice that still reads the file plays what was written.
        assert_ne!(played(false, true), played(false, false));

        assert_eq!(played(true, true), played(true, false));
    }

    #[test]
    fn a_mono_return_to_a_forgotten_key_plays_silence() {
        let played = |overwrite: bool| {
            let (messages, reports) = (Queue::new(), Queue::new());
            let mut rig = Rig::with_sample_sound(&messages, &reports, &[(&PLAY_MODE, MONO)]);
            // The second key moves the voice to file 1, so the forget leaves it playing.
            rig.send(0, 0, note_of(0, 1, 60, plays(0)));
            rig.send(1, 64, note_of(1, 1, 60, plays(1)));
            rig.send(2, 128, MessageKind::ForgetSample { file: FileId(0) });
            rig.send(3, 192, note_off(1));
            rig.render(160);
            if overwrite {
                rig.overwrite(0);
            }
            let out = rig.render(160);
            (bits(&out), rig.audio.voices.sounding())
        };

        let (out, sounding) = played(true);

        // The return at sample 192 plays no file and ends.
        assert_eq!(out, played(false).0);
        assert!(out[64..].iter().all(|&x| x == 0));
        assert_eq!(sounding, 0);
    }

    #[test]
    fn a_steal_fades_a_sample_voice_without_reading() {
        let played = |at_64: &[MessageKind], overwrite: bool| {
            let (messages, reports) = (Queue::new(), Queue::new());
            let mut rig = Rig::with_sample_sound(&messages, &reports, &[]);
            // Sound 2 is silent: its notes only take voices.
            let mut silent = SOUND_DEFAULTS;
            silent[Sound::place(LEVEL.id)] = 0;
            rig.audio.sounds.add(SoundNumber(2), silent);
            rig.send(0, 0, note_of(0, 1, 60, plays(0)));
            for note in 1..32 {
                rig.send(note, 0, note_of(note, 2, 60, NoteEngine::Synth));
            }
            for (number, &kind) in (32..).zip(at_64) {
                rig.send(number, 64, kind);
            }
            let before = rig.render(64);
            if overwrite {
                rig.overwrite(0);
            }
            bits(&[before, rig.render(128)].concat())
        };
        // A voice that still reads the file plays what was written.
        assert_ne!(played(&[], true), played(&[], false));

        // The 33rd note takes the oldest voice of its sound, which reads file 0, alone and in the
        // chunk that forgets file 0.
        let steal = note_of(32, 1, 60, plays(1));
        let forget = MessageKind::ForgetSample { file: FileId(0) };
        for at_64 in [&[steal][..], &[steal, forget]] {
            assert_eq!(played(at_64, true), played(at_64, false), "{at_64:?}");
        }
    }

    #[test]
    fn a_note_and_the_forget_of_its_file_in_one_chunk_give_one_faded_chunk() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::with_sample_sound(&messages, &reports, &[]);
        // The note reads the file's first chunk before the forget applies, which fades it.
        rig.send(0, 64, note_of(0, 1, 60, plays(0)));
        rig.send(1, 64, MessageKind::ForgetSample { file: FileId(0) });

        let out = rig.render(160);

        let fade = &out[64..96];
        assert!(is_silent(&out[..64]));
        assert!(!is_silent(fade));
        assert_eq!(fade[CHUNK - 1], 0.0);
        assert!(is_silent(&out[96..]));
        assert_eq!(rig.audio.voices.sounding(), 0);
    }

    /// The engine of a note that plays file 2 of `played_by`, a stereo file of `LENGTH` frames.
    fn plays_stereo() -> NoteEngine {
        NoteEngine::Sample(Some(SampleFile {
            file: FileId(2),
            frames: LENGTH,
            stereo: true,
        }))
    }

    /// A note of sound 1 on track 1 that plays a missing sample: it sounds nothing and ends, and
    /// takes a started note's place in the count of seeds.
    fn silent_on_track_1(note: u32) -> MessageKind {
        MessageKind::NoteOn {
            note: NoteId(note),
            track: 1,
            sound: SoundNumber(1),
            pitch: 60,
            velocity: 127,
            engine: NoteEngine::Sample(None),
        }
    }

    /// Both channels of what a `Rig::with_sample_sound` with `changes`, which also holds file 2
    /// (see `plays_stereo`), plays for `length` samples with `messages`, numbered from 0.
    fn played_by(
        changes: &[(&Entry, i32)],
        messages: &[(u64, MessageKind)],
        length: usize,
    ) -> [Vec<u32>; 2] {
        let (queue, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::with_sample_sound(&queue, &reports, changes);
        rig.add_file(2, true, &samples(2 * LENGTH as usize));
        for (number, &(at, kind)) in (0..).zip(messages) {
            rig.send(number, at, kind);
        }
        rig.render_stereo(length).map(|channel| bits(&channel))
    }

    /// Both channels of `played` from sample `from` on.
    fn from(from: usize, played: [Vec<u32>; 2]) -> [Vec<u32>; 2] {
        played.map(|channel| channel[from..].to_vec())
    }

    #[test]
    fn a_mono_note_of_another_engine_takes_a_voice_of_its_own() {
        // As after the sound's engine changed while its first note sounds.
        let mono: &[(&Entry, i32)] = &[(&PLAY_MODE, MONO)];
        for (first, second) in [(plays(0), NoteEngine::Synth), (NoteEngine::Synth, plays(0))] {
            let next = (320, note_of(1, 1, 60, second));
            let changed = played_by(mono, &[(0, note_of(0, 1, 60, first)), next], 640);

            // The first note's voice fades in the chunk of the second, which then plays as a new
            // note of its engine does.
            let fresh = played_by(mono, &[(0, silent_on_track_1(0)), next], 640);
            assert_eq!(from(352, changed), from(352, fresh), "{second:?}");
        }
    }

    #[test]
    fn a_mono_restart_onto_a_file_of_other_channels_takes_a_voice_of_its_own() {
        let notes = [
            (0, note_of(0, 1, 60, plays(0))),
            (320, note_of(1, 1, 60, plays_stereo())),
        ];
        let mono: &[(&Entry, i32)] = &[(&PLAY_MODE, MONO)];

        let changed = played_by(mono, &notes, 640);

        // The mono voice fades and the stereo file plays in both channels as a new note of it.
        assert_eq!(
            from(352, changed),
            from(352, played_by(mono, &notes[1..], 640))
        );
        // Legato keeps its file, and with it its channels.
        let legato: &[(&Entry, i32)] = &[(&PLAY_MODE, LEGATO)];
        assert_eq!(
            played_by(legato, &notes, 640),
            played_by(legato, &notes[..1], 640)
        );
    }

    #[test]
    fn a_mono_return_to_a_key_of_another_engine_or_channels_releases() {
        let changes: &[(&Entry, i32)] = &[(&PLAY_MODE, MONO), (&TRIGGER, GATE)];
        for (first, second) in [
            (plays(0), NoteEngine::Synth),
            (NoteEngine::Synth, plays(0)),
            (plays(0), plays_stereo()),
        ] {
            let next = [(64, note_of(1, 1, 60, second)), (320, note_off(1))];
            let returned = played_by(
                changes,
                &[[(0, note_of(0, 1, 60, first))].as_slice(), &next].concat(),
                8_000,
            );

            // The second note takes a voice of its own and its key's release ends it, as for a
            // note played alone, though the first key is still held.
            let alone = played_by(
                changes,
                &[[(0, silent_on_track_1(0))].as_slice(), &next].concat(),
                8_000,
            );
            assert_eq!(from(96, returned), from(96, alone), "{second:?}");
        }
    }

    /// A note of sound 1 at pitch 60 and velocity 127 on step `k` of bar 1: at place `k × 480`,
    /// one step long.
    fn step(k: u16) -> Note {
        Note {
            bar: 0,
            place: k * 480,
            length: 480,
            sound: SoundNumber(1),
            pitch: 60,
            velocity: 127,
            curve: None,
        }
    }

    /// The pattern plays from bar 1 at 120 BPM, which starts at sample `anchor`: a step every
    /// 6,000 samples.
    fn play(anchor: u64) -> MessageKind {
        MessageKind::Play {
            run: Run {
                anchor,
                tick: 0,
                tempo: 12_000,
            },
        }
    }

    #[test]
    fn play_starts_the_trees_notes_at_their_samples() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.send(0, 0, new_sound(1));
        rig.send(1, 0, play(0));
        rig.version(2, 0, 0, &[step(0), step(4)]);

        let out = rig.render(24_032);

        // Step 0 sounds until the chunk its end at sample 6,000 applies in, then releases; step 4
        // starts at sample 24,000.
        assert!(!is_silent(&out[..CHUNK]));
        assert!(!is_silent(&out[5_984..6_016]));
        assert!(is_silent(&out[6_016 + 9_600..24_000]));
        assert!(!is_silent(&out[24_000..]));
        assert_eq!(rig.report(), applied(0, 0));
        assert_eq!(rig.report(), applied(1, 0));
        assert_eq!(rig.report(), applied(2, 0));
    }

    #[test]
    fn a_version_applies_at_its_moment_and_is_reported() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.send(0, 0, new_sound(1));
        rig.send(1, 0, play(0));
        rig.version(2, 4_000, 0, &[step(0), step(1)]);

        let out = rig.render(6_048);

        // Step 0 was due before the version applied, so only step 1 starts, at sample 6,000.
        assert!(is_silent(&out[..6_016]));
        assert!(!is_silent(&out[6_016..]));
        assert_eq!(rig.report(), applied(0, 0));
        assert_eq!(rig.report(), applied(1, 0));
        assert_eq!(rig.report(), applied(2, 4_000));
        assert_eq!(rig.report(), None);
    }

    #[test]
    fn play_anchors_at_its_run_not_at_its_chunk() {
        // Step 0 of a run anchored at sample 50 is due before the chunk at 128 that the `Play`
        // applies in, so it starts there; it ends at 6,050, as step 1 starts, both in the chunk at
        // 6,080.
        let by_messages = {
            let (messages, reports) = (Queue::new(), Queue::new());
            let mut rig = Rig::new(&messages, &reports);
            rig.send(0, 0, new_sound(1));
            rig.send(1, 128, note_on(0));
            rig.send(2, 6_080, note_off(0));
            rig.send(3, 6_080, note_on(1));
            bits(&rig.render(6_144))
        };
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.send(0, 0, new_sound(1));
        rig.version(1, 0, 0, &[step(0), step(1)]);
        let stopped = rig.render(128);

        rig.send(2, 50, play(50));
        let playing = rig.render(6_016);

        assert_eq!(bits(&[stopped, playing].concat()), by_messages);
        assert_eq!(rig.report(), applied(0, 0));
        assert_eq!(rig.report(), applied(1, 0));
        assert_eq!(rig.report(), applied(2, 128));
    }

    #[test]
    fn stop_releases_the_patterns_notes_and_keeps_a_held_pad() {
        // A pad's note held from sample 0, and step 0's note let go of at sample 1,000.
        let by_messages = {
            let (messages, reports) = (Queue::new(), Queue::new());
            let mut rig = Rig::new(&messages, &reports);
            rig.send(0, 0, new_sound(1));
            rig.send(1, 0, note_of(0, 1, 64, NoteEngine::Synth));
            rig.send(2, 0, note_on(1));
            rig.send(3, 1_000, note_off(1));
            bits(&rig.render(12_000))
        };
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.send(0, 0, new_sound(1));
        rig.send(1, 0, note_of(0, 1, 64, NoteEngine::Synth));
        rig.version(2, 0, 0, &[step(0)]);
        rig.send(3, 0, play(0));
        rig.send(4, 1_000, MessageKind::Stop);

        let out = rig.render(12_000);

        // Step 0 fades with its own release and does not come back at sample 6,000.
        assert_eq!(bits(&out), by_messages);
        assert_eq!(rig.audio.voices.sounding(), 1);
        assert_eq!(rig.audio.sequencer.run(), None);
    }

    #[test]
    fn a_hand_played_note_on_a_muted_track_sounds() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.send(0, 0, new_sound(1));
        rig.send(
            1,
            0,
            MessageKind::SetParam {
                target: Target::Track(0),
                id: MUTE.id,
                value: 1,
            },
        );
        rig.send(2, 0, play(0));
        rig.version(3, 0, 0, &[step(0)]);

        // Step 0, due at sample 0, starts nothing.
        assert!(is_silent(&rig.render(128)));

        rig.send(4, 128, note_on(0));

        assert!(!is_silent(&rig.render(128)));
    }

    #[test]
    fn silence_fades_every_voice_within_a_chunk_and_stops_the_preview() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::with_two_files(&messages, &reports, FRAMES);
        rig.send(0, 0, new_sound(1));
        rig.send(1, 0, new_sound(2));
        // A released voice and a held one of another sound.
        rig.send(2, 0, note_on(0));
        rig.send(3, 0, note_of(1, 2, 64, NoteEngine::Synth));
        rig.send(4, 0, preview(0, FRAMES, false));
        rig.send(5, 32, note_off(0));
        rig.send(6, 64, MessageKind::Silence);

        let out = rig.render(160);

        let fade = &out[64..96];
        assert!(!is_silent(fade));
        assert_eq!(fade[CHUNK - 1], 0.0);
        assert!(is_silent(&out[96..]));
        assert_eq!(rig.audio.voices.sounding(), 0);
    }

    #[test]
    fn notes_of_a_deleted_sound_start_nothing() {
        // Sound 2's note, held from sample 0, alone.
        let alone = {
            let (messages, reports) = (Queue::new(), Queue::new());
            let mut rig = Rig::new(&messages, &reports);
            rig.send(0, 0, new_sound(1));
            rig.send(1, 0, new_sound(2));
            rig.send(2, 0, note_of(0, 2, 64, NoteEngine::Synth));
            bits(&rig.render(12_032)[3_040..])
        };
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.send(0, 0, new_sound(1));
        rig.send(1, 0, new_sound(2));
        rig.send(2, 0, note_of(0, 2, 64, NoteEngine::Synth));
        rig.send(3, 0, play(0));
        rig.version(4, 0, 0, &[step(0), step(1)]);
        rig.send(5, 3_000, delete_sound(1));

        let out = rig.render(12_032);

        // Step 0's voice fades in the delete's chunk. The tree still holds sound 1's notes: step 1
        // starts nothing at sample 6,000, and its end at 12,000, of a note that never started,
        // touches no voice.
        assert_eq!(bits(&out[3_040..]), alone);
        assert_eq!(rig.audio.voices.sounding(), 1);
    }

    #[test]
    fn a_forgotten_file_plays_no_pattern_note() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::with_sample_sound(&messages, &reports, &[]);
        let engine = MessageKind::SoundEngine {
            sound: SoundNumber(1),
            engine: plays(0),
        };
        rig.send(0, 0, engine);
        rig.send(1, 0, play(0));
        rig.send(2, 3_000, MessageKind::ForgetSample { file: FileId(0) });
        rig.version(3, 0, 0, &[step(0), step(1)]);

        let before = rig.render(3_008);
        rig.overwrite(0);
        let after = rig.render(9_024);

        // Step 0 plays file 0 until the forget fades it; step 1, at sample 6,000, reads nothing.
        assert!(!is_silent(&before[..CHUNK]));
        assert!(!is_silent(&after[..CHUNK]));
        assert!(is_silent(&after[CHUNK..]));
    }

    #[test]
    fn a_copied_sound_plays_its_originals_engine() {
        let played = |pattern: bool| {
            let (messages, reports) = (Queue::new(), Queue::new());
            let mut rig = Rig::with_sample_sound(&messages, &reports, &[]);
            let engine = MessageKind::SoundEngine {
                sound: SoundNumber(1),
                engine: plays(0),
            };
            rig.send(0, 0, engine);
            let copy = MessageKind::CopySound {
                sound: SoundNumber(2),
                of: SoundNumber(1),
            };
            rig.send(1, 0, copy);
            if pattern {
                rig.send(2, 0, play(0));
                let note = Note {
                    sound: SoundNumber(2),
                    ..step(0)
                };
                rig.version(3, 0, 0, &[note]);
            } else {
                rig.send(2, 0, note_of(0, 2, 60, plays(0)));
            }
            bits(&rig.render(640))
        };

        // Sound 2's pattern note plays file 0, as a note of it that names the file does.
        assert_eq!(played(true), played(false));
    }

    fn set_device(entry: &Entry, value: i32) -> MessageKind {
        MessageKind::SetParam {
            target: Target::Device,
            id: entry.id,
            value,
        }
    }

    /// The first `length` samples of a click started on a bar's first beat or on another.
    pub(super) fn clicked(first: bool, length: usize) -> Vec<f32> {
        let mut click = Click::new();
        click.start(first);
        let mut out = std::vec![0.0; length];
        for chunk in out.as_chunks_mut::<CHUNK>().0 {
            click.render(chunk);
        }
        out
    }

    /// A rig with the metronome on that plays an empty pattern from sample 0, with `messages`
    /// at their samples after the `Play`, rendered for `length` samples.
    fn clicking(messages: &[(u64, MessageKind)], length: usize) -> Vec<f32> {
        let (queue, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&queue, &reports);
        rig.send(0, 0, set_device(&METRONOME, 1));
        rig.send(1, 0, play(0));
        for (number, &(at, kind)) in (2..).zip(messages) {
            rig.send(number, at, kind);
        }
        rig.render(length)
    }

    #[test]
    fn while_the_metronome_is_on_each_beat_clicks() {
        let out = clicking(&[], 72_000);

        for beat in [0, 24_000, 48_000] {
            assert!(!is_silent(&out[beat..beat + CHUNK]), "{beat}");
            assert!(is_silent(&out[beat + 1_440..beat + 24_000]), "{beat}");
        }
        // The bar's first beat clicks higher than the others.
        assert_ne!(bits(&out[..1_440]), bits(&out[24_000..25_440]));
        assert_eq!(bits(&out[24_000..25_440]), bits(&out[48_000..49_440]));
    }

    #[test]
    fn off_or_stopped_nothing_clicks() {
        let silent = |metronome, playing| {
            let (messages, reports) = (Queue::new(), Queue::new());
            let mut rig = Rig::new(&messages, &reports);
            rig.send(0, 0, set_device(&METRONOME, metronome));
            if playing {
                rig.send(1, 0, play(0));
            }
            is_silent(&rig.render(48_032))
        };

        assert!(silent(0, true));
        assert!(silent(1, false));
        assert!(!silent(1, true));
    }

    #[test]
    fn the_click_joins_before_the_soft_clipper_at_its_level() {
        let at_level = |level| clicking(&[(0, set_device(&METRONOME_LEVEL, level))], 1_440);
        let click = clicked(true, 1_440);
        let volume = param::real(&OUTPUT_VOLUME, OUTPUT_VOLUME.default);

        // The level glides over 128 samples.
        let (full, quarter) = (at_level(65_535), at_level(32_768));

        // The click is loud enough for the clipper to bend it.
        assert!(peak(&click) > 0.5, "peak {}", peak(&click));
        assert_eq!(
            bits(&full[128..]),
            bits(
                &click[128..]
                    .iter()
                    .map(|&x| soft_clip(x) * volume)
                    .collect::<Vec<f32>>()
            )
        );
        for (quarter, x) in quarter[128..].iter().zip(&click[128..]) {
            assert!(
                libm::fabsf(quarter - x / 4.0 * volume) < 1e-4,
                "{x} and {quarter}"
            );
        }
    }

    #[test]
    fn stop_lets_a_click_finish_and_silence_cuts_it() {
        let clicks = clicking(&[], 2_048);
        let stopped = clicking(&[(100, MessageKind::Stop)], 2_048);
        let silenced = clicking(
            &[(100, MessageKind::Stop), (100, MessageKind::Silence)],
            2_048,
        );

        assert_eq!(bits(&stopped), bits(&clicks));
        assert!(!is_silent(&stopped[1_408..1_440]));
        assert!(is_silent(&stopped[1_440..]));
        assert_eq!(bits(&silenced[..128]), bits(&clicks[..128]));
        let fade = &silenced[128..160];
        assert!(!is_silent(fade));
        assert_eq!(fade[CHUNK - 1], 0.0);
        assert!(is_silent(&silenced[160..]));
    }

    /// Sound 1's notes `starts` from the pad, each held one step at 120 BPM, rendered for
    /// `length` samples.
    fn played_at(starts: &[u64], length: usize) -> Vec<u32> {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.send(0, 0, new_sound(1));
        for (note, &start) in (0..).zip(starts) {
            rig.send(2 * note + 1, start, note_on(note));
            rig.send(2 * note + 2, start + 6_000, note_off(note));
        }
        bits(&rig.render(length))
    }

    #[test]
    fn a_tempo_message_moves_the_notes_not_yet_started() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.send(0, 0, new_sound(1));
        rig.send(1, 0, play(0));
        rig.version(2, 0, 0, &[step(0), step(4)]);
        rig.send(
            3,
            3_000,
            MessageKind::Tempo {
                run: Run {
                    anchor: 3_012,
                    tick: 241,
                    tempo: 6_000,
                },
            },
        );

        assert_eq!(
            bits(&rig.render(45_024)),
            played_at(&[0, 3_012 + (1_920 - 241) * 150_000 / 6_000], 45_024)
        );
    }

    #[test]
    fn a_meter_message_takes_hold_at_its_bar_line() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.send(0, 0, new_sound(1));
        rig.send(1, 0, play(0));
        rig.version(2, 0, 0, &[step(0)]);
        rig.send(
            3,
            50_000,
            MessageKind::Meter {
                meter: Meter {
                    tick: 7_680,
                    bar: 0,
                    bars: 1,
                    signature: Signature { beats: 3, unit: 4 },
                },
            },
        );

        assert_eq!(
            bits(&rig.render(168_032)),
            played_at(&[0, 96_000, 96_000 + 72_000], 168_032)
        );
    }

    fn set_slot(track: u8, slot: u8, entry: &Entry, value: i32) -> MessageKind {
        MessageKind::SetParam {
            target: Target::Slot { track, slot },
            id: entry.id,
            value,
        }
    }

    #[test]
    fn a_new_project_has_a_delay_at_level_0_which_changes_nothing() {
        let played = |empty: bool| {
            let (messages, reports) = (Queue::new(), Queue::new());
            let mut rig = Rig::new(&messages, &reports);
            rig.send(0, 0, new_sound(1));
            if empty {
                for slot in 0..6 {
                    rig.send(
                        1 + u32::from(slot),
                        0,
                        MessageKind::SlotEffect {
                            track: 0,
                            slot,
                            effect: Effect::Empty,
                        },
                    );
                }
            }
            rig.send(7, 0, note_on(0));
            rig.send(8, 6_000, note_off(0));
            bits(&rig.render(48_000))
        };

        assert_eq!(played(false), played(true));
    }

    #[test]
    fn the_reverb_in_slot_2_takes_the_delays_echoes() {
        let played = |reverb: bool| {
            let (messages, reports) = (Queue::new(), Queue::new());
            let mut rig = Rig::new(&messages, &reports);
            rig.send(0, 0, new_sound(1));
            rig.send(1, 0, set_slot(0, 0, &DELAY_LEVEL, 65_535));
            rig.send(2, 0, set_slot(0, 1, &REVERB_LEVEL, 65_535));
            if !reverb {
                rig.send(
                    3,
                    0,
                    MessageKind::SlotEffect {
                        track: 0,
                        slot: 1,
                        effect: Effect::Empty,
                    },
                );
            }
            rig.send(4, 0, note_on(0));
            rig.send(5, 32, note_off(0));
            if reverb {
                // Slot 2 starts afresh once the note is over, so all it takes from then on is the
                // echo.
                rig.send(
                    6,
                    9_600,
                    MessageKind::SlotEffect {
                        track: 0,
                        slot: 1,
                        effect: Effect::Reverb,
                    },
                );
                rig.send(7, 9_600, set_slot(0, 1, &REVERB_LEVEL, 65_535));
            }
            rig.render_stereo(12_032)
        };

        let (reverb, empty) = (played(true), played(false));

        for (reverb, empty) in reverb.iter().zip(&empty) {
            // A new track's slot 2 is a reverb: the note's room.
            assert_ne!(bits(&reverb[..9_600]), bits(&empty[..9_600]));
            assert_eq!(bits(&reverb[9_600..12_000]), bits(&empty[9_600..12_000]));
            assert!(!is_silent(&empty[12_000..]));
            assert_ne!(bits(&reverb[12_000..]), bits(&empty[12_000..]));
        }
    }

    #[test]
    fn moving_a_lone_delay_changes_nothing_in_the_output() {
        let played = |moved: bool| {
            let (messages, reports) = (Queue::new(), Queue::new());
            let mut rig = Rig::new(&messages, &reports);
            rig.send(0, 0, new_sound(1));
            rig.send(1, 0, set_slot(0, 0, &DELAY_LEVEL, 65_535));
            rig.send(2, 0, set_slot(0, 0, &DELAY_FEEDBACK, 32_768));
            rig.send(3, 0, note_on(0));
            rig.send(4, 1_000, note_off(0));
            if moved {
                rig.send(
                    5,
                    24_000,
                    MessageKind::MoveSlot {
                        track: 0,
                        from: 0,
                        to: 3,
                    },
                );
            }
            rig.render(60_000)
        };

        let unmoved = played(false);

        // Echoes of 1/8 at 120 BPM ring on after the move.
        assert!(!is_silent(&unmoved[24_000..36_000]));
        assert_eq!(bits(&played(true)), bits(&unmoved));
    }

    #[test]
    fn moving_swaps_settings_and_memory_together() {
        let played = |moved: bool, silenced: bool| {
            let (messages, reports) = (Queue::new(), Queue::new());
            let mut rig = Rig::new(&messages, &reports);
            rig.send(0, 0, new_sound(1));
            // Slot 1 a delay at 1/4 and Level 100%, slot 2 one at 1/8 and Level 0.
            rig.send(1, 0, set_slot(0, 0, &DELAY_TIME, 1_920));
            rig.send(2, 0, set_slot(0, 0, &DELAY_LEVEL, 65_535));
            rig.send(
                3,
                0,
                MessageKind::SlotEffect {
                    track: 0,
                    slot: 1,
                    effect: Effect::Delay,
                },
            );
            rig.send(4, 0, note_on(0));
            rig.send(5, 32, note_off(0));
            if moved {
                rig.send(
                    6,
                    12_000,
                    MessageKind::MoveSlot {
                        track: 0,
                        from: 0,
                        to: 1,
                    },
                );
            }
            if silenced {
                rig.send(7, 24_000, set_slot(0, 1, &DELAY_LEVEL, 0));
            }
            rig.render(72_000)
        };

        let moved = played(true, false);

        // The note is over long before its echo.
        assert!(is_silent(&moved[12_000..24_000]));
        assert!(!is_silent(&moved[24_000..24_032]));
        assert_eq!(bits(&moved), bits(&played(false, false)));
        // The level glides to 0 over 128 samples.
        let silenced = played(true, true);
        assert!(!is_silent(&silenced[24_000..24_032]));
        assert!(is_silent(&silenced[24_128..]));
    }

    /// A rig whose slot 1 of track 0 is a delay at Level 100% that rings with the echo of a short
    /// note, rendered up to sample 12,032.
    fn ringing<'a>(
        messages: &'a Queue<Message, MESSAGE_QUEUE>,
        reports: &'a Queue<Report, REPORT_QUEUE>,
    ) -> Rig<'a> {
        let mut rig = Rig::new(messages, reports);
        rig.send(0, 0, new_sound(1));
        rig.send(1, 0, set_slot(0, 0, &DELAY_LEVEL, 65_535));
        rig.send(2, 0, note_on(0));
        rig.send(3, 32, note_off(0));
        let played = rig.render(12_032);
        assert!(is_silent(&played[9_600..12_000]));
        assert!(!is_silent(&played[12_000..]));
        rig
    }

    #[test]
    fn a_new_type_clears_the_slot_and_takes_its_defaults() {
        let delay = MessageKind::SlotEffect {
            track: 0,
            slot: 0,
            effect: Effect::Delay,
        };
        // With Level back at 100% no echo of what came before is heard.
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = ringing(&messages, &reports);
        rig.send(4, 12_032, delay);
        rig.send(5, 12_032, set_slot(0, 0, &DELAY_LEVEL, 65_535));

        assert!(is_silent(&rig.render(36_000)));

        // Level is 0 again: a new note's echo 12,000 samples on is not heard.
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = ringing(&messages, &reports);
        rig.send(4, 12_032, delay);
        rig.send(5, 12_032, note_on(1));
        rig.send(6, 12_064, note_off(1));

        let played = rig.render(36_000);

        assert!(!is_silent(&played[..CHUNK]));
        assert!(is_silent(&played[9_600..]));
    }

    #[test]
    fn silence_clears_every_slot_and_the_next_note_starts_dry() {
        let played = |level: i32| {
            let (messages, reports) = (Queue::new(), Queue::new());
            let mut rig = Rig::new(&messages, &reports);
            rig.send(0, 0, new_sound(1));
            // A note held on each track until the `Silence` fades it out.
            for track in 0..4 {
                let number = 1 + 3 * u32::from(track);
                rig.send(number, 0, set_slot(track, 0, &DELAY_TIME, 480));
                rig.send(number + 1, 0, set_slot(track, 0, &DELAY_LEVEL, level));
                rig.send(
                    number + 2,
                    0,
                    MessageKind::NoteOn {
                        note: NoteId(track.into()),
                        track,
                        sound: SoundNumber(1),
                        pitch: 60,
                        velocity: 127,
                        engine: NoteEngine::Synth,
                    },
                );
            }
            rig.send(13, 24_000, MessageKind::Silence);
            rig.send(14, 30_080, note_on(4));
            rig.render(36_096)
        };

        let (wet, dry) = (played(65_535), played(0));

        // The echoes ring up to the `Silence`.
        assert_ne!(bits(&wet[23_968..24_000]), bits(&dry[23_968..24_000]));
        assert!(!is_silent(&wet[24_000..24_032]));
        // From the chunk after it, nothing: no echo of the fade 1/16 later, at 30,000.
        assert!(is_silent(&wet[24_032..30_080]));
        assert_eq!(bits(&wet[30_080..36_080]), bits(&dry[30_080..36_080]));
        assert!(!is_silent(&wet[30_080..36_080]));
    }

    #[test]
    fn the_delay_follows_a_tempo_change_while_stopped() {
        let played = |level: i32| {
            let (messages, reports) = (Queue::new(), Queue::new());
            let mut rig = Rig::new(&messages, &reports);
            rig.send(0, 0, new_sound(1));
            rig.send(
                1,
                0,
                MessageKind::SetParam {
                    target: Target::Project,
                    id: TEMPO.id,
                    value: 6_000,
                },
            );
            rig.send(2, 0, set_slot(0, 0, &DELAY_TIME, 480));
            rig.send(3, 0, set_slot(0, 0, &DELAY_LEVEL, level));
            rig.send(4, 0, note_on(0));
            rig.send(5, 32, note_off(0));
            rig.render(12_032)
        };

        let (wet, dry) = (played(65_535), played(0));

        // 1/16 at 60 BPM: 12,000 samples.
        assert!(is_silent(&wet[9_600..12_000]));
        assert_eq!(bits(&wet[..12_000]), bits(&dry[..12_000]));
        assert!(!is_silent(&wet[12_000..]));
    }
}
