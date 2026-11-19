use super::CHUNK;
use super::sounds::Sounds;
use super::voice::{State, Voice};
use crate::budget;
use crate::dsp::osc::seed;
use crate::input::PADS;
use crate::library::FileId;
use crate::message::{NoteEngine, NoteId};
use crate::param::{ALWAYS, CHOKE_GROUP, Entry, GLIDE, GLIDE_TIME, MONO, PLAY_MODE, POLY, ParamId};
use crate::project::pool::{Sound, SoundNumber};
use crate::sample_ram::Reader;

/// The most notes held at once: the control part holds one for each pad and each MIDI note.
const HELD: usize = PADS as usize + 128;

/// A note whose key is held, as its `NoteOn` brought it: a Mono return plays its engine.
#[derive(Clone, Copy)]
struct Key {
    note: NoteId,
    track: u8,
    sound: SoundNumber,
    pitch: u8,
    velocity: u8,
    engine: NoteEngine,
}

/// Every voice, and the notes whose keys are held. A Poly note takes a voice of its own; a Mono or
/// Legato sound plays one voice on each track.
pub struct Voices {
    voices: [Voice; budget::VOICES],
    /// The count at which each voice started its note: the further it lies behind `count`, the
    /// older the voice.
    starts: [u32; budget::VOICES],
    /// The notes started so far. A started note's seed is the count mixed by `seed`.
    count: u32,
    /// The held keys, the newest last; the first `length` count.
    held: [Key; HELD],
    length: usize,
}

impl Voices {
    pub const fn new() -> Self {
        Self {
            voices: [const { Voice::new() }; budget::VOICES],
            starts: [0; budget::VOICES],
            count: 0,
            held: [Key {
                note: NoteId(0),
                track: 0,
                sound: SoundNumber(0),
                pitch: 0,
                velocity: 0,
                engine: NoteEngine::Synth,
            }; HELD],
            length: 0,
        }
    }

    /// Plays a note of `engine`, which reads a sample's file through `reader`. A note of a choke
    /// group first fades the voices of the group's other sounds on its track into `fades`. A Mono
    /// or Legato note then moves its sound's voice on the track to it, if that voice is not idle:
    /// Mono restarts the envelopes and a sample, which then plays the note's file from Start while
    /// its old sound fades out in the voice's next chunk, Legato only when the voice's own key is
    /// not held any more. A voice of the other engine, or on a restart of a file of other
    /// channels, fades into `fades` instead and the note starts in it. Otherwise the note starts a
    /// voice: a finished one, or else the oldest released voice, the oldest voice of its sound or
    /// the oldest voice, which fades into `fades` first.
    ///
    /// # Panics
    ///
    /// When the audio part does not hold `sound`, or more keys are held than the control part ever
    /// holds.
    #[expect(
        clippy::too_many_arguments,
        reason = "a note brings six of these, reads its file and may fade voices of other sounds"
    )]
    pub fn note_on(
        &mut self,
        note: NoteId,
        track: u8,
        sound: SoundNumber,
        pitch: u8,
        velocity: u8,
        engine: NoteEngine,
        sounds: &Sounds,
        reader: &Reader<'_>,
        fades: &mut [[f32; CHUNK]; 2],
    ) {
        let values = sounds.values(sound);
        let read = |entry: &Entry| values[Sound::place(entry.id)];
        let group = read(&CHOKE_GROUP);
        // Group 0 is None.
        if group != 0 {
            for voice in &mut self.voices {
                if voice.state() != State::Idle
                    && voice.track() == track
                    && voice.sound() != sound
                    && sounds.values(voice.sound())[Sound::place(CHOKE_GROUP.id)] == group
                {
                    voice.fade(fades);
                }
            }
        }

        let mode = read(&PLAY_MODE);
        let mono = self.voices.iter().position(|voice| {
            mode != POLY
                && voice.state() != State::Idle
                && voice.sound() == sound
                && voice.track() == track
        });
        // The voice's own key, not the held list: after a change from Poly a key may be held
        // by another voice.
        let held = mono.is_some_and(|index| self.voices[index].state() == State::Held);
        let restart = mode == MONO || !held;
        if let Some(index) = mono
            && self.voices[index].can_change(engine, restart)
        {
            self.voices[index].change(
                note,
                pitch,
                velocity,
                restart,
                read(&GLIDE_TIME) > 0 && (read(&GLIDE) == ALWAYS || held),
                engine,
                reader,
            );
        } else {
            // After the sound's engine or file changed, its voice may play what the note cannot
            // move to: the note takes that voice as a steal does.
            let index = mono.unwrap_or_else(|| {
                (0..budget::VOICES)
                    .max_by_key(|&index| {
                        let voice = &self.voices[index];
                        let rank = match voice.state() {
                            State::Idle => 3,
                            State::Released => 2,
                            State::Held => u8::from(voice.sound() == sound),
                        };
                        (rank, self.count.wrapping_sub(self.starts[index]))
                    })
                    .expect("there are voices")
            });
            let voice = &mut self.voices[index];
            if voice.state() != State::Idle {
                voice.fade(fades);
            }
            voice.start(
                note,
                track,
                sound,
                pitch,
                velocity,
                seed(self.count),
                engine,
                values,
                reader,
            );
            self.starts[index] = self.count;
            self.count = self.count.wrapping_add(1);
        }

        self.held[self.length] = Key {
            note,
            track,
            sound,
            pitch,
            velocity,
            engine,
        };
        self.length += 1;
    }

    /// Lets go of a note's key. Only a voice that still plays the note changes: a Poly note
    /// releases, and a Mono or Legato voice goes back to the newest key of its sound still held on
    /// its track that no other voice plays, or releases when there is none or when that key's
    /// note is of the other engine, or on a Mono return of a file of other channels. A Mono return
    /// plays that key's engine, reading a sample's file through `reader`.
    pub fn note_off(&mut self, note: NoteId, sounds: &Sounds, reader: &Reader<'_>) {
        if let Some(place) = self.held[..self.length]
            .iter()
            .position(|key| key.note == note)
        {
            self.held.copy_within(place + 1..self.length, place);
            self.length -= 1;
        }
        let plays = |voice: &Voice, note| voice.state() != State::Idle && voice.note() == note;
        // An idle voice still names the note it last played.
        let Some(index) = self.voices.iter().position(|voice| plays(voice, note)) else {
            return;
        };
        let voice = &self.voices[index];
        let values = sounds.values(voice.sound());
        let read = |entry: &Entry| values[Sound::place(entry.id)];
        let mode = read(&PLAY_MODE);
        // After a change from Poly another voice may already play a held key.
        if mode != POLY
            && let Some(key) = self.held[..self.length].iter().rev().find(|key| {
                key.sound == voice.sound()
                    && key.track == voice.track()
                    && !self.voices.iter().any(|other| plays(other, key.note))
            })
            && voice.can_change(key.engine, mode == MONO)
        {
            // A return always overlaps, so it glides whenever Glide time is above 0.
            self.voices[index].change(
                key.note,
                key.pitch,
                key.velocity,
                mode == MONO,
                read(&GLIDE_TIME) > 0,
                key.engine,
                reader,
            );
        } else {
            self.voices[index].release();
        }
    }

    /// Lets go of `file`: every voice that reads it fades into `fades`, and a held key of it
    /// plays no file from now on, so a Mono return to it plays silence. Nothing reads the file
    /// after this.
    pub fn forget(&mut self, file: FileId, fades: &mut [[f32; CHUNK]; 2]) {
        for voice in self
            .voices
            .iter_mut()
            .filter(|voice| voice.reads() == Some(file))
        {
            voice.fade(fades);
        }
        for key in &mut self.held[..self.length] {
            if matches!(key.engine, NoteEngine::Sample(Some(sample)) if sample.file == file) {
                key.engine = NoteEngine::Sample(None);
            }
        }
    }

    /// Fades every voice of `sound` that is not idle into `fades`. Its held keys stay: their
    /// `NoteOff`s still come and clear them, and no voice of the sound is left to return to them.
    pub fn delete(&mut self, sound: SoundNumber, fades: &mut [[f32; CHUNK]; 2]) {
        for voice in self
            .voices
            .iter_mut()
            .filter(|voice| voice.state() != State::Idle && voice.sound() == sound)
        {
            voice.fade(fades);
        }
    }

    /// Changes the value of `id` in every voice of `sound`.
    pub fn set(&mut self, sound: SoundNumber, id: ParamId, value: i32) {
        for voice in self
            .voices
            .iter_mut()
            .filter(|voice| voice.sound() == sound)
        {
            voice.set(id, value);
        }
    }

    /// Adds one chunk of every voice that is not idle to `out`, reading the samples' files through
    /// `reader`.
    pub fn render(&mut self, reader: &Reader<'_>, out: &mut [[f32; CHUNK]; 2]) {
        for voice in self
            .voices
            .iter_mut()
            .filter(|voice| voice.state() != State::Idle)
        {
            voice.render(reader, out);
        }
    }

    /// How many voices are not idle.
    #[cfg(test)]
    pub fn sounding(&self) -> usize {
        self.voices
            .iter()
            .filter(|voice| voice.state() != State::Idle)
            .count()
    }
}

impl Default for Voices {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(all(test, not(feature = "loom")))]
mod tests {
    use super::*;
    use crate::audio::tests::empty_reader;
    use crate::param::{
        DECAY, LEGATO, LEVEL, ONE_SHOT, OVERLAPPING, SINE, SUPERSAW, SUSTAIN, TRIGGER, WAVE,
    };
    use crate::project::pool::SOUND_DEFAULTS;
    use std::vec::Vec;

    /// A decay of 10 ms.
    const SHORT: i32 = 6_554;
    /// The chunks in a tenth of a second.
    const TENTH: usize = 150;

    struct Rig {
        voices: Voices,
        sounds: Sounds,
    }

    impl Rig {
        /// Voices and the sounds 1, 2 and on, each a new sound with its changes.
        fn new(sounds: &[&[(&Entry, i32)]]) -> Self {
            let mut rig = Self {
                voices: Voices::new(),
                sounds: Sounds::new(),
            };
            for (number, changes) in (1..).zip(sounds) {
                let mut values = SOUND_DEFAULTS;
                for &(entry, value) in *changes {
                    values[Sound::place(entry.id)] = value;
                }
                rig.sounds.add(SoundNumber(number), values);
            }
            rig
        }

        /// Plays `note`, a synth note, at velocity 127 and gives the fades it made.
        fn on(&mut self, note: u32, track: u8, sound: u32, pitch: u8) -> [[f32; CHUNK]; 2] {
            let mut fades = [[0.0; CHUNK]; 2];
            self.voices.note_on(
                NoteId(note),
                track,
                SoundNumber(sound),
                pitch,
                127,
                NoteEngine::Synth,
                &self.sounds,
                &empty_reader(),
                &mut fades,
            );
            fades
        }

        fn off(&mut self, note: u32) {
            self.voices
                .note_off(NoteId(note), &self.sounds, &empty_reader());
        }

        /// Changes a value of `sound` as a `SetParam` does.
        fn set(&mut self, sound: u32, entry: &Entry, value: i32) {
            self.sounds.set(SoundNumber(sound), entry.id, value);
            self.voices.set(SoundNumber(sound), entry.id, value);
        }

        /// The left channel of the next `chunks` chunks of every voice.
        fn play(&mut self, chunks: usize) -> Vec<f32> {
            left(chunks, |out| self.voices.render(&empty_reader(), out))
        }

        /// The left channel of the next `chunks` chunks of the voice that plays `note`, alone.
        fn play_alone(&mut self, note: u32, chunks: usize) -> Vec<f32> {
            let voice = &mut self.voices.voices[self.voice(note).expect("a voice plays it")];
            left(chunks, |out| voice.render(&empty_reader(), out))
        }

        /// The voice that plays `note`.
        fn voice(&self, note: u32) -> Option<usize> {
            self.voices
                .voices
                .iter()
                .position(|voice| voice.state() != State::Idle && voice.note() == NoteId(note))
        }

        /// How many voices are not idle.
        fn sounding(&self) -> usize {
            self.voices.sounding()
        }

        fn states(&self) -> Vec<(State, NoteId)> {
            self.voices
                .voices
                .iter()
                .map(|voice| (voice.state(), voice.note()))
                .collect()
        }
    }

    /// The left channel of `chunks` chunks of `render`.
    fn left(chunks: usize, mut render: impl FnMut(&mut [[f32; CHUNK]; 2])) -> Vec<f32> {
        let mut left = Vec::new();
        for _ in 0..chunks {
            let mut out = [[0.0; CHUNK]; 2];
            render(&mut out);
            left.extend(out[0]);
        }
        left
    }

    fn is_silent(chunk: &[[f32; CHUNK]; 2]) -> bool {
        chunk.as_flattened().iter().all(|&x| x == 0.0)
    }

    fn peak(samples: &[f32]) -> f32 {
        samples
            .iter()
            .fold(0.0, |peak, &x| libm::fmaxf(peak, libm::fabsf(x)))
    }

    fn upward_crossings(samples: &[f32]) -> usize {
        samples
            .windows(2)
            .filter(|pair| pair[0] < 0.0 && pair[1] >= 0.0)
            .count()
    }

    #[test]
    fn the_33rd_note_takes_the_oldest_voice_with_a_fade() {
        let mut rig = Rig::new(&[&[]]);
        for note in 0..32 {
            assert!(is_silent(&rig.on(note, 0, 1, 60)));
            rig.play(1);
        }
        let oldest = rig.voice(0);

        let fades = rig.on(32, 0, 1, 60);

        assert!(!is_silent(&fades));
        assert_eq!(fades.map(|channel| channel[CHUNK - 1]), [0.0; 2]);
        assert_eq!(rig.voice(32), oldest);
        assert!(
            rig.voices
                .voices
                .iter()
                .all(|voice| voice.state() == State::Held)
        );
    }

    #[test]
    fn stealing_prefers_released_then_same_sound_then_oldest() {
        let mut rig = Rig::new(&[&[], &[], &[]]);
        rig.on(0, 0, 1, 60);
        rig.on(1, 0, 2, 60);
        for note in 2..32 {
            rig.on(note, 0, 1, 60);
        }
        let [finished, older_released, newer_released, of_sound_2, oldest] =
            [3, 5, 7, 1, 0].map(|note| rig.voice(note).expect("all 32 notes sound"));
        rig.off(3);
        rig.play(300);
        assert_eq!(rig.voices.voices[finished].state(), State::Idle);
        rig.off(7);
        rig.off(5);

        assert!(is_silent(&rig.on(32, 0, 1, 60)));
        assert_eq!(rig.voice(32), Some(finished));
        assert!(!is_silent(&rig.on(33, 0, 1, 60)));
        assert_eq!(rig.voice(33), Some(older_released));
        rig.on(34, 0, 1, 60);
        assert_eq!(rig.voice(34), Some(newer_released));
        rig.on(35, 0, 2, 60);
        assert_eq!(rig.voice(35), Some(of_sound_2));
        rig.on(36, 0, 3, 60);
        assert_eq!(rig.voice(36), Some(oldest));
    }

    #[test]
    fn a_choke_group_fades_other_sounds_of_the_group_on_its_track_only() {
        let group_1: &[(&Entry, i32)] = &[(&CHOKE_GROUP, 1)];
        let mut rig = Rig::new(&[group_1, group_1, group_1, &[], &[]]);
        for (note, track, sound) in [(0, 0, 1), (1, 1, 3), (2, 0, 4)] {
            assert!(is_silent(&rig.on(note, track, sound, 60)));
        }

        let fades = rig.on(3, 0, 2, 60);

        assert!(!is_silent(&fades));
        assert_eq!(rig.voice(0), None);
        // A second note of the sound keeps the first.
        assert!(is_silent(&rig.on(4, 0, 2, 60)));
        assert!([1, 2, 3, 4].iter().all(|&note| rig.voice(note).is_some()));
        // Sounds of no group choke nothing.
        assert!(is_silent(&rig.on(5, 0, 5, 60)));
        assert_eq!(rig.sounding(), 5);
    }

    #[test]
    fn mono_plays_the_newest_held_key_and_returns_to_the_held_one() {
        let mut rig = Rig::new(&[&[(&PLAY_MODE, MONO)]]);
        for (note, pitch) in [(0, 60), (1, 62), (2, 64), (3, 67)] {
            rig.on(note, 0, 1, pitch);
        }
        assert_eq!(rig.sounding(), 1);
        let voice = rig.voice(3).expect("the newest key sounds");
        let playing = |rig: &Rig| {
            let voice = &rig.voices.voices[voice];
            (voice.state(), voice.note())
        };

        rig.off(1);
        assert_eq!(playing(&rig), (State::Held, NoteId(3)));
        rig.off(3);
        assert_eq!(playing(&rig), (State::Held, NoteId(2)));
        rig.off(2);
        assert_eq!(playing(&rig), (State::Held, NoteId(0)));
        rig.off(0);
        assert_eq!(playing(&rig), (State::Released, NoteId(0)));
        assert_eq!(rig.sounding(), 1);
    }

    #[test]
    fn mono_restarts_the_envelopes_and_legato_keeps_them() {
        // Sustain 0: a held key falls silent and keeps its voice.
        for (mode, restarts) in [(MONO, true), (LEGATO, false)] {
            let mut rig = Rig::new(&[&[(&PLAY_MODE, mode), (&SUSTAIN, 0), (&DECAY, SHORT)]]);
            rig.on(0, 0, 1, 60);
            assert!(peak(&rig.play(40)[39 * CHUNK..]) < 0.000_01);

            rig.on(1, 0, 1, 64);

            assert_eq!(peak(&rig.play(5)) > 0.01, restarts, "play mode {mode}");

            // Letting go of the second key returns to the first, which is held: the same again.
            assert!(peak(&rig.play(40)[39 * CHUNK..]) < 0.000_01);
            rig.off(1);
            assert_eq!(
                peak(&rig.play(5)) > 0.01,
                restarts,
                "play mode {mode} on a return"
            );
        }

        // With no key held, Legato restarts them too.
        let mut rig = Rig::new(&[&[(&PLAY_MODE, LEGATO)]]);
        rig.on(0, 0, 1, 60);
        rig.play(10);
        rig.off(0);
        let releasing = peak(&rig.play(100)[99 * CHUNK..]);
        rig.on(1, 0, 1, 64);
        let restarted = peak(&rig.play(5));
        assert!(
            releasing < 0.01 && restarted > 0.1,
            "{releasing} then {restarted}"
        );
    }

    #[test]
    fn overlapping_glide_needs_a_held_key_and_poly_never_glides() {
        let rig = |mode, glide| {
            Rig::new(&[&[
                (&WAVE, SINE),
                (&PLAY_MODE, mode),
                (&GLIDE_TIME, 65_535),
                (&GLIDE, glide),
            ]])
        };
        // A sine rises 26 times in a tenth of a second at pitch 60 and 52 times at 72; a glide
        // of 2 s barely leaves 60 in that time.
        let glides = |mode, glide, held: bool| {
            let mut rig = rig(mode, glide);
            rig.on(0, 0, 1, 60);
            if !held {
                rig.off(0);
            }
            rig.on(1, 0, 1, 72);
            upward_crossings(&rig.play_alone(1, TENTH)) < 40
        };

        assert_eq!(
            [
                glides(MONO, OVERLAPPING, true),
                glides(MONO, OVERLAPPING, false),
                glides(LEGATO, ALWAYS, false),
                glides(POLY, ALWAYS, true),
            ],
            [true, false, true, false]
        );

        // A return always overlaps.
        let mut rig = rig(MONO, OVERLAPPING);
        rig.on(0, 0, 1, 60);
        rig.on(1, 0, 1, 72);
        rig.play(3_000);
        rig.off(1);
        assert!(upward_crossings(&rig.play(TENTH)) > 40);
    }

    #[test]
    fn a_mono_sound_on_two_tracks_plays_one_voice_per_track() {
        let mut rig = Rig::new(&[&[(&PLAY_MODE, MONO)]]);
        rig.on(0, 0, 1, 60);
        rig.on(1, 1, 1, 64);
        rig.on(2, 0, 1, 67);
        assert_eq!(rig.sounding(), 2);
        let (first, second) = (rig.voice(2), rig.voice(1));
        assert!(first.is_some() && second.is_some());

        rig.off(2);

        // Back to the key held on its own track, not to the newer one on the other.
        assert_eq!(rig.voice(0), first);
        assert_eq!(rig.voice(1), second);
    }

    #[test]
    fn a_release_never_touches_a_voice_its_note_no_longer_has() {
        let mut rig = Rig::new(&[&[]]);
        for note in 0..33 {
            rig.on(note, 0, 1, 60);
        }
        let before = rig.states();

        rig.off(0);

        assert_eq!(rig.states(), before);

        // A one-shot note ends while its key is held; letting go leaves its voice idle.
        let mut rig = Rig::new(&[&[(&TRIGGER, ONE_SHOT), (&DECAY, SHORT)]]);
        rig.on(0, 0, 1, 60);
        rig.play(40);
        assert_eq!(rig.sounding(), 0);

        rig.off(0);

        assert_eq!(rig.sounding(), 0);
    }

    #[test]
    fn set_reaches_only_the_sounds_voices() {
        let mut rig = Rig::new(&[&[], &[]]);
        rig.on(0, 0, 1, 60);
        rig.on(1, 0, 2, 60);
        rig.on(2, 1, 1, 60);

        rig.voices.set(SoundNumber(1), LEVEL.id, 0);

        // Level glides over 4 chunks.
        for (note, silenced) in [(0, true), (1, false), (2, true)] {
            let samples = rig.play_alone(note, 8);
            assert_eq!(peak(&samples[4 * CHUNK..]) == 0.0, silenced, "note {note}");
        }
    }

    #[test]
    fn turning_to_mono_under_held_poly_notes_leaves_no_voice_stuck() {
        let mut rig = Rig::new(&[&[]]);
        rig.on(0, 0, 1, 60);
        rig.on(1, 0, 1, 64);
        rig.set(1, &PLAY_MODE, MONO);

        rig.off(1);
        rig.off(0);
        rig.play(300);

        assert_eq!(rig.sounding(), 0);
    }

    #[test]
    fn a_legato_key_after_a_mode_change_sounds() {
        let mut rig = Rig::new(&[&[]]);
        rig.on(0, 0, 1, 60);
        rig.on(1, 0, 1, 64);
        rig.play(10);
        rig.off(1);
        rig.play(100);
        rig.set(1, &PLAY_MODE, LEGATO);

        rig.on(2, 0, 1, 67);

        let peak = peak(&rig.play_alone(2, 5));
        assert!(peak > 0.1, "peak {peak}");
    }

    #[test]
    fn every_start_gets_the_next_seed() {
        let hits = || {
            let mut rig = Rig::new(&[&[(&WAVE, SUPERSAW)]]);
            [0, 1].map(|note| {
                rig.on(note, 0, 1, 60);
                rig.play_alone(note, 4)
                    .iter()
                    .map(|x| x.to_bits())
                    .collect::<Vec<_>>()
            })
        };

        let [first, second] = hits();

        assert_ne!(first, second);
        assert_eq!(hits(), [first, second]);
    }
}
