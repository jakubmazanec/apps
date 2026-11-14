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

    /// Puts `sound` on pad `pad` (0 to 11) of the current track, or empties the pad, and keeps the
    /// selection rule of `Track`: the pad's sound becomes the selected one when the pad is the
    /// selected pad.
    pub fn put(&mut self, pad: u8, sound: Option<SoundNumber>) {
        let track = &mut self.tracks[usize::from(self.track)];
        track.pads[usize::from(pad)] = sound;
        if track.selected_pad == Some(pad) {
            track.selected_sound = sound;
        }
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
    fn putting_nothing_on_the_selected_pad_clears_the_selected_sound() {
        let mut project = Project::new();
        let sound = project.pool.new_synth().unwrap();
        project.put(0, Some(sound));

        project.put(0, None);

        assert_eq!(project.tracks[0].pads[0], None);
        assert_eq!(project.tracks[0].selected_sound, None);
    }

    #[test]
    fn putting_a_sound_on_another_pad_keeps_the_selection() {
        let mut project = Project::new();
        let first = project.pool.new_synth().unwrap();
        let second = project.pool.new_synth().unwrap();
        project.put(0, Some(first));

        project.put(7, Some(second));

        let track = &project.tracks[0];
        assert_eq!(track.pads[7], Some(second));
        assert_eq!(track.selected_pad, Some(0));
        assert_eq!(track.selected_sound, Some(first));
    }

    #[test]
    fn putting_a_sound_without_a_selected_pad_leaves_the_selected_sound_alone() {
        let mut project = Project::new();
        let chosen = project.pool.new_synth().unwrap();
        let put = project.pool.new_synth().unwrap();
        // A sound selected somewhere other than a pad, as POOL will do.
        project.tracks[0].selected_pad = None;
        project.tracks[0].selected_sound = Some(chosen);

        project.put(0, Some(put));

        assert_eq!(project.tracks[0].pads[0], Some(put));
        assert_eq!(project.tracks[0].selected_sound, Some(chosen));
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
