//! STEP's lanes: a pad's, or a sound's that has notes on none of the track's pads, and the notes
//! each sound has on each track (Workflow B).

use super::Control;
use crate::project::pool::SoundNumber;

/// A lane of STEP (S1).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[cfg_attr(
    not(test),
    expect(dead_code, reason = "STEP's view uses the lanes and is built next")
)]
pub enum Lane {
    Pad(u8),
    Extra(SoundNumber),
}

#[cfg_attr(
    not(test),
    expect(dead_code, reason = "STEP's view uses the lanes and is built next")
)]
impl Control {
    /// The current track's lanes: its 12 pads, then its extra lanes in pool order (S1). An extra
    /// lane is a sound that sits on none of the track's pads and has notes on the track, or is the
    /// track's selected sound while no pad is (answer 1).
    pub(super) fn lanes(&self) -> impl Iterator<Item = Lane> + '_ {
        let track = self.track();
        (0..12).map(Lane::Pad).chain(
            self.project
                .pool
                .sounds()
                .iter()
                .filter(move |sound| {
                    !track.pads.contains(&Some(sound.number))
                        && (sound.on_tracks[usize::from(self.project.track)] > 0
                            || track.selected_pad.is_none()
                                && track.selected_sound == Some(sound.number))
                })
                .map(|sound| Lane::Extra(sound.number)),
        )
    }

    /// The cursor's lane, counted from 0: the selected pad's, or the extra lane of the sound
    /// selected on no pad (S2).
    pub(super) fn cursor_lane(&self) -> usize {
        let track = self.track();
        self.lanes()
            .position(|lane| match lane {
                Lane::Pad(pad) => track.selected_pad == Some(pad),
                Lane::Extra(sound) => {
                    track.selected_pad.is_none() && track.selected_sound == Some(sound)
                }
            })
            .expect("the selection has a lane")
    }

    /// The sound whose notes a lane shows and enters: a pad's sound or the extra lane's.
    pub(super) fn lane_sound(&self, lane: Lane) -> Option<SoundNumber> {
        match lane {
            Lane::Pad(pad) => self.track().pads[usize::from(pad)],
            Lane::Extra(sound) => Some(sound),
        }
    }

    /// The earlier pad holding the same sound, for a copy lane (S3).
    pub(super) fn copy_of(&self, pad: u8) -> Option<u8> {
        let pads = &self.track().pads;
        let sound = pads[usize::from(pad)]?;
        (0..pad).find(|&earlier| pads[usize::from(earlier)] == Some(sound))
    }

    /// `change` notes of `sound` were added, or removed below 0, on track `track` of pattern
    /// `pattern`: every note added or removed goes through here (S1). The sound's notes change
    /// always and its notes on the track when the pattern is the current one.
    pub(super) fn counted(&mut self, pattern: u8, track: u8, sound: SoundNumber, change: i32) {
        let current = pattern == self.project.pattern;
        let sound = self
            .project
            .pool
            .get_mut(sound)
            .expect("a note's sound is in the pool");
        sound.notes = sound
            .notes
            .checked_add_signed(change)
            .expect("a sound has the notes that are counted off it");
        if current {
            let on_track = &mut sound.on_tracks[usize::from(track)];
            *on_track = on_track
                .checked_add_signed(change)
                .expect("a sound has the notes that are counted off its track");
        }
    }
}
