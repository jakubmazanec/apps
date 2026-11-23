use crate::param::MASTER_LEVEL;
use crate::store::Tree;
use pool::{Pool, SoundNumber};
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
/// track and which pattern are current, the tempo, the signature and the master level.
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
        }
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
    use super::pool::SoundNumber;
    use super::track::PadMode;
    use super::*;
    use std::boxed::Box;

    /// A new project to copy into a `Box`: a debug build of a call of `Project::new` needs more
    /// stack than the test thread leaves room for.
    #[expect(
        clippy::large_const_arrays,
        reason = "a constant is copied straight to the heap, a call is built on the stack first"
    )]
    const NEW: Project = Project::new();

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
