use pool::{Pool, SoundNumber};
use track::Track;

pub mod name;
pub mod pool;
pub mod settings;
pub mod track;

/// What a project holds in memory: the pool of sounds and the four tracks, and which track is
/// current.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Project {
    pub pool: Pool,
    pub tracks: [Track; 4],
    /// The current track, 0 to 3.
    pub track: u8,
}

impl Project {
    /// A project with an empty pool, track 1 current and every track new.
    pub const fn new() -> Self {
        Self {
            pool: Pool::new(),
            tracks: [Track::new(); 4],
            track: 0,
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
}

impl Default for Project {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::pool::SoundNumber;
    use super::track::PadMode;
    use super::*;

    #[test]
    fn a_new_project_has_pad_1_selected_on_every_track_in_pads_mode_at_c4() {
        let project = Project::new();

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
    fn a_project_is_built_at_compile_time() {
        const TRACKS: usize = Project::new().tracks.len();

        assert_eq!(TRACKS, 4);
        assert_eq!(Project::new(), Project::default());
    }

    #[test]
    fn copy_counts_pads_on_every_track() {
        let mut project = Project::new();
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
    fn putting_a_sound_on_the_selected_pad_selects_it() {
        let mut project = Project::new();
        let sound = project.pool.new_synth().unwrap();

        project.put(0, Some(sound));

        let track = &project.tracks[0];
        assert_eq!(track.pads[0], Some(sound));
        assert_eq!(track.selected_pad, Some(0));
        assert_eq!(track.selected_sound, Some(sound));
    }

    #[test]
    fn put_acts_on_the_current_track_only() {
        let mut project = Project::new();
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
