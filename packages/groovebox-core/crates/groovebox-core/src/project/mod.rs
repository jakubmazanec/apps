use crate::param::{
    ATTACK, BP, CHOKE_GROUP, CUTOFF, DECAY, ENVELOPE_AMOUNT, Entry, FILTER_DECAY, FINE_TUNE, GLIDE,
    GLIDE_TIME, LEGATO, LEVEL, LP_12, MASTER_LEVEL, MODE, MONO, NOISE_LEVEL, ONE_SHOT,
    OSCILLATOR_2_FINE_TUNE, OSCILLATOR_2_INTERVAL, OSCILLATOR_2_LEVEL, OVERLAPPING, PITCH_AMOUNT,
    PITCH_DECAY, PLAY_MODE, PULSE, RELEASE, RESONANCE, SHAPE, SINE, SPREAD, SUB_LEVEL, SUPERSAW,
    SUSTAIN, TRANSPOSE, TRIANGLE, TRIGGER, WAVE,
};
use crate::store::Tree;
use pool::{Pool, SOUND_DEFAULTS, SOUND_VALUES, Sound, SoundNumber};
use track::Track;

pub mod name;
pub mod pool;
pub mod settings;
pub mod track;

/// A new project's tempo: 120.00 BPM (S16).
pub const NEW_TEMPO: u32 = 12_000;

/// A pattern: its length in bars and the notes of each track.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Pattern {
    pub bars: u16,
    pub tracks: [Tree; 4],
}

/// What a project holds in memory: the pool of sounds, the four tracks and the 16 patterns, which
/// track and which pattern are current, the tempo, the signature, the master level and whether
/// recording quantizes.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Project {
    pub pool: Pool,
    pub tracks: [Track; 4],
    /// The current track, 0 to 3.
    pub track: u8,
    pub patterns: [Pattern; 16],
    /// The current pattern, 0 to 15, shown "P1" to "P16".
    pub pattern: u8,
    /// In hundredths of a BPM.
    pub tempo: u32,
    pub signature: Signature,
    /// MASTER_LEVEL's value.
    pub master: i32,
    /// QUANTIZE's value.
    pub quantize: bool,
}

impl Project {
    /// A project with an empty pool, track 1 current and every track new, and patterns 1 to 16
    /// empty and 1 bar long, pattern 1 current, at 120 BPM in 4/4 (S16).
    pub const fn new() -> Self {
        Self {
            pool: Pool::new(),
            tracks: [Track::new(); 4],
            track: 0,
            patterns: [Pattern {
                bars: 1,
                tracks: [Tree(None); 4],
            }; 16],
            pattern: 0,
            tempo: NEW_TEMPO,
            signature: FOUR_FOUR,
            master: MASTER_LEVEL.default,
            quantize: true,
        }
    }

    /// A new project whose pool holds `FACTORY_SOUNDS`, numbered from 1 in the list's order, each
    /// on its pad. A `const fn`, as `Project::new` is.
    pub const fn factory() -> Self {
        let mut project = Self::new();
        let mut index = 0;
        while index < FACTORY_SOUNDS.len() {
            let sound = &FACTORY_SOUNDS[index];
            project.tracks[sound.track as usize].put(
                sound.pad,
                Some(project.pool.add_synth(sound.name, sound.values())),
            );
            index += 1;
        }
        project
    }

    /// `Track::put` on the current track.
    pub fn put(&mut self, pad: u8, sound: Option<SoundNumber>) {
        self.tracks[usize::from(self.track)].put(pad, sound);
    }

    /// How many pads hold `sound`, on every track.
    pub fn pads_using(&self, sound: SoundNumber) -> usize {
        self.tracks
            .iter()
            .flat_map(|track| &track.pads)
            .filter(|&&pad| pad == Some(sound))
            .count()
    }

    /// Whether a pad of any track holds `sound` or a pattern has a note of it (S21).
    pub fn is_used(&self, sound: SoundNumber) -> bool {
        self.pads_using(sound) > 0 || self.pool.get(sound).is_some_and(|sound| sound.notes > 0)
    }

    /// The sounds nothing uses, in number order.
    pub fn unused(&self) -> impl DoubleEndedIterator<Item = SoundNumber> + '_ {
        self.pool
            .sounds()
            .iter()
            .map(|sound| sound.number)
            .filter(|&number| !self.is_used(number))
    }

    /// Empties the pads that hold `sound` on every track, then takes it out of the pool.
    ///
    /// # Panics
    ///
    /// When `sound` is not in the pool.
    pub fn delete_sound(&mut self, sound: SoundNumber) {
        for track in &mut self.tracks {
            track.remove(sound);
        }
        self.pool.delete(sound);
    }
}

impl Default for Project {
    fn default() -> Self {
        Self::new()
    }
}

/// A synth of the factory project: its track (0 to 3), its pad (0 to 11), its name and the values
/// in which it differs from a new synth.
pub struct FactorySound {
    pub track: u8,
    pub pad: u8,
    pub name: &'static str,
    pub changes: &'static [(&'static Entry, i32)],
}

impl FactorySound {
    /// A new synth's values with the sound's changes.
    pub const fn values(&self) -> [i32; SOUND_VALUES] {
        let mut values = SOUND_DEFAULTS;
        let mut index = 0;
        while index < self.changes.len() {
            let (entry, value) = self.changes[index];
            values[Sound::place(entry.id)] = value;
            index += 1;
        }
        values
    }
}

/// The factory project's sounds, tuned by ear (owner's choice): drums on T1, basses on T2 and
/// melodic sounds on T3, each from pad 1. T4 stays empty for the user's own sounds.
pub const FACTORY_SOUNDS: [FactorySound; 13] = [
    FactorySound {
        track: 0,
        pad: 0,
        name: "Kick",
        changes: &[
            (&WAVE, SINE),
            (&NOISE_LEVEL, 9_830),
            (&CUTOFF, 28_421),
            (&ENVELOPE_AMOUNT, 52_428),
            (&FILTER_DECAY, 8_257),
            (&DECAY, 23_310),
            (&LEVEL, 65_535),
            (&TRIGGER, ONE_SHOT),
            (&TRANSPOSE, -29),
            (&PITCH_AMOUNT, 24),
            (&PITCH_DECAY, 14_119),
        ],
    },
    FactorySound {
        track: 0,
        pad: 1,
        name: "Snare",
        changes: &[
            (&WAVE, TRIANGLE),
            (&NOISE_LEVEL, 65_535),
            (&OSCILLATOR_2_LEVEL, 32_768),
            (&OSCILLATOR_2_INTERVAL, 7),
            (&MODE, LP_12),
            (&CUTOFF, 55_575),
            (&DECAY, 17_789),
            (&LEVEL, 62_258),
            (&TRIGGER, ONE_SHOT),
            (&TRANSPOSE, -5),
        ],
    },
    FactorySound {
        track: 0,
        pad: 2,
        name: "Hat",
        changes: &[
            (&WAVE, SINE),
            (&NOISE_LEVEL, 65_535),
            (&MODE, BP),
            (&CUTOFF, 58_959),
            (&RESONANCE, 13_107),
            (&DECAY, 13_107),
            (&LEVEL, 58_982),
            (&TRIGGER, ONE_SHOT),
            (&CHOKE_GROUP, 1),
            (&TRANSPOSE, -48),
        ],
    },
    FactorySound {
        track: 0,
        pad: 3,
        name: "Open hat",
        changes: &[
            (&WAVE, SINE),
            (&NOISE_LEVEL, 65_535),
            (&MODE, BP),
            (&CUTOFF, 57_959),
            (&RESONANCE, 13_107),
            (&DECAY, 24_143),
            (&LEVEL, 42_598),
            (&TRIGGER, ONE_SHOT),
            (&CHOKE_GROUP, 1),
            (&TRANSPOSE, -48),
        ],
    },
    FactorySound {
        track: 0,
        pad: 4,
        name: "Tom",
        changes: &[
            (&WAVE, SINE),
            (&NOISE_LEVEL, 6_554),
            (&CUTOFF, 32_268),
            (&ENVELOPE_AMOUNT, 49_152),
            (&FILTER_DECAY, 8_257),
            (&DECAY, 22_413),
            (&TRIGGER, ONE_SHOT),
            (&TRANSPOSE, -14),
            (&PITCH_AMOUNT, 12),
            (&PITCH_DECAY, 16_162),
        ],
    },
    FactorySound {
        track: 0,
        pad: 5,
        name: "Cowbell",
        changes: &[
            (&WAVE, PULSE),
            (&OSCILLATOR_2_LEVEL, 65_535),
            (&OSCILLATOR_2_INTERVAL, 7),
            (&OSCILLATOR_2_FINE_TUNE, -20),
            (&MODE, BP),
            (&CUTOFF, 40_961),
            (&RESONANCE, 19_661),
            (&LEVEL, 36_044),
            (&TRIGGER, ONE_SHOT),
            (&TRANSPOSE, 13),
            (&FINE_TUNE, -45),
        ],
    },
    FactorySound {
        track: 1,
        pad: 0,
        name: "Bass",
        changes: &[
            (&SUB_LEVEL, 32_768),
            (&CUTOFF, 23_962),
            (&RESONANCE, 16_384),
            (&ENVELOPE_AMOUNT, 47_513),
            (&FILTER_DECAY, 19_163),
            (&RELEASE, 13_107),
            (&LEVEL, 49_151),
            (&PLAY_MODE, MONO),
            (&TRANSPOSE, -24),
        ],
    },
    FactorySound {
        track: 1,
        pad: 1,
        name: "Sub",
        changes: &[
            (&WAVE, SINE),
            (&RELEASE, 11_908),
            (&LEVEL, 45_875),
            (&PLAY_MODE, MONO),
            (&TRANSPOSE, -24),
        ],
    },
    FactorySound {
        track: 1,
        pad: 2,
        name: "Acid",
        changes: &[
            (&CUTOFF, 25_692),
            (&RESONANCE, 45_875),
            (&ENVELOPE_AMOUNT, 52_428),
            (&FILTER_DECAY, 17_175),
            (&RELEASE, 10_403),
            (&LEVEL, 29_491),
            (&PLAY_MODE, LEGATO),
            (&GLIDE_TIME, 22_413),
            (&GLIDE, OVERLAPPING),
            (&TRANSPOSE, -12),
        ],
    },
    FactorySound {
        track: 2,
        pad: 0,
        name: "Lead",
        changes: &[
            (&SPREAD, 26_214),
            (&OSCILLATOR_2_LEVEL, 65_535),
            (&OSCILLATOR_2_FINE_TUNE, 8),
            (&CUTOFF, 47_537),
            (&RESONANCE, 13_107),
            (&ENVELOPE_AMOUNT, 42_598),
            (&FILTER_DECAY, 22_413),
            (&RELEASE, 16_162),
            (&LEVEL, 32_768),
            (&PLAY_MODE, MONO),
            (&GLIDE_TIME, 20_363),
            (&GLIDE, OVERLAPPING),
        ],
    },
    FactorySound {
        track: 2,
        pad: 1,
        name: "Pluck",
        changes: &[
            (&CUTOFF, 28_421),
            (&ENVELOPE_AMOUNT, 50_790),
            (&DECAY, 27_009),
            (&SUSTAIN, 0),
            (&RELEASE, 20_363),
        ],
    },
    FactorySound {
        track: 2,
        pad: 2,
        name: "Strings",
        changes: &[
            (&WAVE, SUPERSAW),
            (&SHAPE, 19_661),
            (&SPREAD, 52_428),
            (&CUTOFF, 44_594),
            (&RESONANCE, 6_554),
            (&ATTACK, 24_143),
            (&DECAY, 30_419),
            (&SUSTAIN, 52_428),
            (&RELEASE, 34_821),
            (&LEVEL, 32_768),
        ],
    },
    FactorySound {
        track: 2,
        pad: 3,
        name: "Stab",
        changes: &[
            (&OSCILLATOR_2_LEVEL, 65_535),
            (&OSCILLATOR_2_INTERVAL, 7),
            (&CUTOFF, 38_844),
            (&ENVELOPE_AMOUNT, 45_875),
            (&FILTER_DECAY, 17_789),
            (&DECAY, 22_413),
            (&SUSTAIN, 0),
            (&RELEASE, 17_789),
            (&LEVEL, 45_875),
        ],
    },
];

/// A time signature: `beats` notes of a `unit`th a bar.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Signature {
    pub beats: u8,
    pub unit: u8,
}

pub const FOUR_FOUR: Signature = Signature { beats: 4, unit: 4 };

impl Signature {
    /// A bar's ticks: a whole note is 7,680.
    pub fn bar_ticks(&self) -> u32 {
        u32::from(self.beats) * 7_680 / u32::from(self.unit)
    }

    /// A bar's sixteenths, 480 ticks each.
    pub fn sixteenths(&self) -> u32 {
        self.bar_ticks() / 480
    }
}

#[cfg(test)]
mod tests {
    use super::pool::{Engine, SoundNumber};
    use super::track::PadMode;
    use super::*;
    use crate::param::{ENTRIES, Entry, Scope};
    use std::boxed::Box;
    use std::vec::Vec;

    /// A new project to copy into a `Box`: a debug build of a call of `Project::new` needs more
    /// stack than the test thread leaves room for.
    #[expect(
        clippy::large_const_arrays,
        reason = "a constant is copied straight to the heap, a call is built on the stack first"
    )]
    const NEW: Project = Project::new();

    /// The factory project, built when the tests are compiled.
    static FACTORY: Project = Project::factory();

    #[test]
    fn the_factory_project_holds_13_synths_numbered_1_to_13_and_the_next_sound_is_14() {
        let sounds = FACTORY.pool.sounds();

        assert!(sounds.iter().map(|sound| sound.name.as_str()).eq([
            "Kick", "Snare", "Hat", "Open hat", "Tom", "Cowbell", "Bass", "Sub", "Acid", "Lead",
            "Pluck", "Strings", "Stab",
        ]));
        assert!(sounds.iter().map(|sound| sound.number.0).eq(1..=13));
        assert!(sounds.iter().all(|sound| sound.engine == Engine::Synth
            && sound.notes == 0
            && sound.on_tracks == [0; 4]));
        assert_eq!(FACTORY.pool.vacancy(), Ok(SoundNumber(14)));
    }

    #[test]
    fn the_factory_project_puts_drums_on_t1_basses_on_t2_and_melodic_sounds_on_t3() {
        assert_eq!(
            FACTORY
                .tracks
                .map(|track| track.pads.map(|pad| pad.map_or(0, |sound| sound.0))),
            [
                [1, 2, 3, 4, 5, 6, 0, 0, 0, 0, 0, 0],
                [7, 8, 9, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                [10, 11, 12, 13, 0, 0, 0, 0, 0, 0, 0, 0],
                [0; 12],
            ]
        );
    }

    #[test]
    fn the_factory_project_has_pad_1_selected_on_every_track_in_pads_mode_at_c4() {
        assert_eq!(FACTORY.track, 0);
        for track in &FACTORY.tracks {
            assert_eq!(track.selected_pad, Some(0));
            assert_eq!(track.selected_sound, track.pads[0]);
            assert_eq!(track.mode, PadMode::Pads);
            assert_eq!(track.octave, 4);
        }
    }

    #[test]
    fn every_factory_value_lies_within_its_entry_range() {
        let entries: Vec<&Entry> = ENTRIES
            .iter()
            .filter(|entry| entry.scope == Scope::Sound)
            .collect();

        for sound in FACTORY.pool.sounds() {
            for (entry, value) in entries.iter().zip(sound.values) {
                assert!(
                    (entry.low..=entry.high).contains(&value),
                    "{}: {} {value}",
                    sound.name.as_str(),
                    entry.name
                );
            }
        }
    }

    #[test]
    fn a_new_project_has_pad_1_selected_on_every_track_in_pads_mode_at_c4() {
        let project = Box::new(NEW);

        assert_eq!(project.track, 0);
        assert!(project.pool.sounds().is_empty());
        for track in &project.tracks {
            assert_eq!(track.selected_pad, Some(0));
            assert_eq!(track.selected_sound, None);
            assert_eq!(track.mode, PadMode::Pads);
            assert_eq!(track.octave, 4);
            assert!(track.pads.iter().all(Option::is_none));
        }
    }

    #[test]
    fn a_new_project_is_at_full_master_level() {
        assert_eq!(Box::new(NEW).master, 65_535);
    }

    #[test]
    fn a_project_is_built_at_compile_time() {
        const TRACKS: usize = Project::new().tracks.len();
        static BUILT: Project = Project::new();

        assert_eq!(TRACKS, 4);
        assert_eq!(BUILT, Project::default());
    }

    #[test]
    fn copy_counts_pads_on_every_track() {
        let mut project = Box::new(NEW);
        let sound = project.pool.new_synth().unwrap();
        let other = project.pool.new_synth().unwrap();
        project.put(1, Some(sound));
        project.put(3, Some(sound));
        project.put(4, Some(other));
        project.track = 1;
        project.put(5, Some(sound));

        assert_eq!(project.pads_using(sound), 3);
        assert_eq!(project.pads_using(other), 1);
        assert_eq!(project.pads_using(SoundNumber(99)), 0);
    }

    #[test]
    fn a_sound_is_used_while_a_pad_of_any_track_holds_it() {
        let mut project = Box::new(NEW);
        let sound = project.pool.new_synth().unwrap();
        assert!(!project.is_used(sound));
        project.track = 2;
        project.put(3, Some(sound));

        assert!(project.is_used(sound));

        project.put(3, None);
        assert!(!project.is_used(sound));
    }

    #[test]
    fn a_sound_with_notes_is_used() {
        let mut project = Box::new(NEW);
        let sound = project.pool.new_synth().unwrap();
        project.pool.get_mut(sound).unwrap().notes = 1;

        assert!(project.is_used(sound));
        assert!(project.unused().next().is_none());
    }

    #[test]
    fn unused_lists_the_sounds_on_no_pad_in_number_order() {
        let mut project = Box::new(NEW);
        for _ in 0..4 {
            project.pool.new_synth().unwrap();
        }
        project.put(0, Some(SoundNumber(1)));
        project.track = 2;
        project.put(11, Some(SoundNumber(3)));

        assert!(project.unused().map(|sound| sound.0).eq([2, 4]));
    }

    #[test]
    fn deleting_a_sound_empties_its_pads_on_every_track_and_leaves_the_pool() {
        let mut project = Box::new(NEW);
        let sound = project.pool.new_synth().unwrap();
        project.put(0, Some(sound));
        project.track = 1;
        project.put(4, Some(sound));
        project.tracks[1].select(4);
        project.tracks[3].select_sound(sound);

        project.delete_sound(sound);

        assert!(
            project
                .tracks
                .iter()
                .all(|track| !track.pads.contains(&Some(sound)))
        );
        assert_eq!(project.tracks[1].selected_pad, Some(4));
        assert_eq!(project.tracks[1].selected_sound, None);
        assert_eq!(project.tracks[3].selected_pad, Some(0));
        assert_eq!(project.tracks[3].selected_sound, None);
        assert!(project.pool.get(sound).is_none());
    }

    #[test]
    fn putting_a_sound_on_the_selected_pad_selects_it() {
        let mut project = Box::new(NEW);
        let sound = project.pool.new_synth().unwrap();

        project.put(0, Some(sound));

        let track = &project.tracks[0];
        assert_eq!(track.pads[0], Some(sound));
        assert_eq!(track.selected_pad, Some(0));
        assert_eq!(track.selected_sound, Some(sound));
    }

    #[test]
    fn put_acts_on_the_current_track_only() {
        let mut project = Box::new(NEW);
        let sound = project.pool.new_synth().unwrap();
        project.track = 2;

        project.put(0, Some(sound));

        assert_eq!(project.tracks[2].pads[0], Some(sound));
        assert_eq!(project.tracks[2].selected_sound, Some(sound));
        for track in [0, 1, 3] {
            assert_eq!(project.tracks[track], Track::new());
        }
    }
}
