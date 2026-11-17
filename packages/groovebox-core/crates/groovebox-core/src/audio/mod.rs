use crate::dsp::clip::soft_clip;
use crate::message::{MESSAGE_QUEUE, Message, MessageKind, REPORT_QUEUE, Report, Target};
use crate::param::{self, OUTPUT_VOLUME};
use crate::project::pool::SOUND_DEFAULTS;
use crate::queue::{Consumer, Producer};
use crate::sample_ram::Reader;
use preview::Preview;
use sounds::Sounds;
use voice::Glide;
use voices::Voices;

pub mod preview;
pub mod sounds;
pub mod synth;
pub mod voice;
pub mod voices;

pub const SAMPLE_RATE: u32 = 48_000;
/// The core renders on its own fixed schedule of this many samples, whatever the host's batch
/// size.
pub const CHUNK: usize = 32;
pub const MAX_BATCH: usize = 128;

pub struct Audio {
    position: u64,
    sounds: Sounds,
    voices: Voices,
    preview: Preview,
    /// The output volume's value, where it glides to and the chunks it takes to get there.
    volume: Glide,
    /// The block table it reads blocks through, 0 or 1.
    table: u8,
}

impl Audio {
    pub const fn new() -> Self {
        Self {
            position: 0,
            sounds: Sounds::new(),
            voices: Voices::new(),
            preview: Preview::new(),
            volume: Glide::at(OUTPUT_VOLUME.default),
            table: 0,
        }
    }

    /// The sample at which the next `render` starts.
    pub fn position(&self) -> u64 {
        self.position
    }

    /// Renders `left.len()` samples, which must be a multiple of `CHUNK`. At each chunk start it
    /// applies every message that is due and reports the sample at which it applied it. It then
    /// adds up the voices, the last chunk of each voice a new note took or choked and the preview,
    /// soft-clips the sum and multiplies it by the output volume, which moves in a line across the
    /// chunk.
    ///
    /// It reads the files' blocks through `readers[v]`, the reader of block table `v`, as
    /// `Tables::readers` allows: through the table that the latest `UseTable` named and only frames
    /// below the length of the latest `Preview`'s file. It reads none of that file from the chunk
    /// at which a `StopPreview`, a newer `Preview` or a `ForgetSample` of it applies.
    pub fn render(
        &mut self,
        left: &mut [f32],
        right: &mut [f32],
        readers: &[Reader<'_>; 2],
        messages: &mut Consumer<'_, Message, MESSAGE_QUEUE>,
        reports: &mut Producer<'_, Report, REPORT_QUEUE>,
    ) {
        assert_eq!(left.len(), right.len());
        assert_eq!(left.len() % CHUNK, 0);
        let (left, _) = left.as_chunks_mut::<CHUNK>();
        let (right, _) = right.as_chunks_mut::<CHUNK>();
        for (left, right) in left.iter_mut().zip(right) {
            let mut fades = [[0.0; CHUNK]; 2];
            while let Some(message) = messages
                .peek()
                .filter(|message| message.at <= self.position)
            {
                messages.pop();
                match message.kind {
                    MessageKind::NewSound { sound } => self.sounds.add(sound, SOUND_DEFAULTS),
                    MessageKind::CopySound { sound, of } => {
                        self.sounds.add(sound, *self.sounds.values(of));
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
                    MessageKind::NoteOn {
                        note,
                        track,
                        sound,
                        pitch,
                        velocity,
                    } => self.voices.note_on(
                        note,
                        track,
                        sound,
                        pitch,
                        velocity,
                        &self.sounds,
                        &mut fades,
                    ),
                    MessageKind::NoteOff { note } => self.voices.note_off(note, &self.sounds),
                    MessageKind::UseTable { version } => self.table = version,
                    MessageKind::Preview {
                        file,
                        frames,
                        stereo,
                    } => self.preview.start(file, frames, stereo),
                    MessageKind::StopPreview => self.preview.stop(),
                    MessageKind::ForgetSample { file } => self.preview.forget(file),
                    // Another device value is not the audio part's.
                    MessageKind::SetParam { .. } => {}
                }
                // A full queue drops the report: the audio part never waits.
                let _ = reports.push(Report::Applied {
                    number: message.number,
                    sample: self.position,
                });
            }

            let mut mix = [[0.0; CHUNK]; 2];
            self.voices.render(&mut mix);
            let mut preview = [[0.0; CHUNK]; 2];
            self.preview
                .render(&readers[usize::from(self.table)], &mut preview);
            let before = param::real(&OUTPUT_VOLUME, self.volume.value);
            self.volume.step();
            let after = param::real(&OUTPUT_VOLUME, self.volume.value);
            for n in 0..CHUNK {
                let gain = before + (after - before) * (n + 1) as f32 / CHUNK as f32;
                left[n] = soft_clip(mix[0][n] + fades[0][n] + preview[0][n]) * gain;
                right[n] = soft_clip(mix[1][n] + fades[1][n] + preview[1][n]) * gain;
            }
            self.position += CHUNK as u64;
        }
    }
}

impl Default for Audio {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(all(test, not(feature = "loom")))]
mod tests {
    use super::*;
    use crate::library::FileId;
    use crate::message::{
        MESSAGE_QUEUE, Message, MessageKind, NoteId, REPORT_QUEUE, Report, Target,
    };
    use crate::param::{
        CHOKE_GROUP, CUTOFF, Entry, LEVEL, OUTPUT_VOLUME, RESONANCE, SPREAD, SUPERSAW, WAVE,
    };
    use crate::project::pool::{SOUND_DEFAULTS, Sound, SoundNumber};
    use crate::queue::{Consumer, Producer, Queue};
    use crate::sample_ram::{
        BLOCK, BLOCKS, Blocks, Listed, Listing, SampleRam, Tables, blocks_for,
    };
    use std::boxed::Box;
    use std::vec::Vec;

    /// An audio part with its own queues, block tables and sample RAM. The test plays the control
    /// side of the tables through `listing` and `blocks`.
    struct Rig<'a> {
        audio: Audio,
        to_audio: Producer<'a, Message, MESSAGE_QUEUE>,
        inbox: Consumer<'a, Message, MESSAGE_QUEUE>,
        outbox: Producer<'a, Report, REPORT_QUEUE>,
        from_audio: Consumer<'a, Report, REPORT_QUEUE>,
        tables: Box<Tables>,
        ram: Box<SampleRam>,
        listing: Listing,
        blocks: Blocks,
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
                    audio: Audio::new(),
                    to_audio: messages.producer(),
                    inbox: messages.consumer(),
                    outbox: reports.producer(),
                    from_audio: reports.consumer(),
                    tables: Box::new(Tables::new()),
                    ram: SampleRam::boxed(),
                    listing: Listing::new(),
                    blocks: Blocks::new(),
                }
            }
        }

        fn send(&mut self, number: u32, at: u64, kind: MessageKind) {
            assert_eq!(self.to_audio.push(Message { number, at, kind }), Ok(()));
        }

        /// Makes the audio part hold sound 1, as a `NewSound` does, without a message or a report.
        fn add_sound(&mut self) {
            self.audio.sounds.add(SoundNumber(1), SOUND_DEFAULTS);
        }

        /// Turns the output volume to full at once, so that the output is what the clipper gives.
        fn full_volume(&mut self) {
            self.audio.volume = Glide::at(OUTPUT_VOLUME.high);
        }

        /// A rig at full volume that holds two mono files of `FRAMES` frames: file 0 of
        /// `samples(FRAMES)` and file 1 of the samples after them.
        fn with_two_files(
            messages: &'a Queue<Message, MESSAGE_QUEUE>,
            reports: &'a Queue<Report, REPORT_QUEUE>,
        ) -> Self {
            let mut rig = Self::new(messages, reports);
            rig.full_volume();
            let both = samples(2 * FRAMES as usize);
            rig.add_file(0, false, &both[..FRAMES as usize]);
            rig.add_file(1, false, &both[FRAMES as usize..]);
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

        #[allow(unsafe_code)]
        fn render_stereo(&mut self, length: usize) -> [Vec<f32>; 2] {
            let mut left = std::vec![f32::NAN; length];
            let mut right = std::vec![f32::NAN; length];
            // SAFETY: the test tells the audio part only about files it listed and wrote, and
            // writes their blocks only between renders, while no reader lives.
            let readers = unsafe { self.tables.readers(&self.ram) };
            self.audio.render(
                &mut left,
                &mut right,
                &readers,
                &mut self.inbox,
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
        MessageKind::NoteOn {
            note: NoteId(note),
            track: 0,
            sound: SoundNumber(1),
            pitch: 60,
            velocity: 127,
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
    fn a_full_report_queue_drops_the_report_without_waiting() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.add_sound();
        for number in 0..REPORT_QUEUE as u32 {
            assert_eq!(
                rig.outbox.push(Report::Applied { number, sample: 0 }),
                Ok(())
            );
        }
        rig.send(999, 0, note_on(0));

        rig.render(32);

        assert_eq!(rig.inbox.peek(), None);
        for number in 0..REPORT_QUEUE as u32 {
            assert_eq!(rig.report(), applied(number, 0));
        }
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
        // SAFETY: the audio part is told about no file.
        let readers = unsafe { rig.tables.readers(&rig.ram) };

        rig.audio.render(
            &mut [0.0; 64],
            &mut [0.0; 32],
            &readers,
            &mut rig.inbox,
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
            },
        );
        assert!(!is_silent(&rig.render(256)));

        let fade = rig.render(CHUNK);
        let after = rig.render(CHUNK);

        assert!(fade.iter().any(|&x| x != 0.0));
        assert_eq!(fade[CHUNK - 1], 0.0);
        assert!(after.iter().all(|&x| x == 0.0));
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

    fn preview(file: u16, frames: u32, stereo: bool) -> MessageKind {
        MessageKind::Preview {
            file: FileId(file),
            frames,
            stereo,
        }
    }

    /// The frames of each file of `Rig::with_two_files`: past a block and not a whole number of
    /// chunks.
    const FRAMES: u32 = 1_100;

    /// What a `Rig::with_two_files` plays for `length` samples with `messages`, numbered from 0.
    fn previewed(messages: &[(u64, MessageKind)], length: usize) -> Vec<f32> {
        let (queue, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::with_two_files(&queue, &reports);
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
        assert_eq!(bits(&out[..frames]), bits(&played(&samples(frames))));
        assert!(is_silent(&out[frames..]));
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
        assert_eq!(bits(&left[..600]), bits(&played(&lefts)));
        assert_eq!(bits(&right[..600]), bits(&played(&rights)));
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
    fn a_stop_reads_nothing_more_of_the_file() {
        for stop in [
            MessageKind::StopPreview,
            MessageKind::ForgetSample { file: FileId(0) },
            preview(1, FRAMES, false),
        ] {
            let messages = [(0, preview(0, FRAMES, false)), (64, stop)];
            let (queue, reports) = (Queue::new(), Queue::new());
            let mut rig = Rig::with_two_files(&queue, &reports);
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
        assert_eq!(bits(&out[..2 * 1_024]), bits(&played(&file)));
        assert_eq!(bits(&later), bits(&played(&other)));
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
}
