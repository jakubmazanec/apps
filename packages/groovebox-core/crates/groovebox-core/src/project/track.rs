use super::pool::SoundNumber;

/// The highest octave: C8, whose pad 1 plays MIDI note 108. The lowest is 0 (C0, note 12).
pub const MAX_OCTAVE: u8 = 8;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PadMode {
    /// A pad plays its own sound at C4.
    Pads,
    /// The pads are a keyboard that plays the selected sound.
    Keys,
}

/// What a track keeps: its 12 pads, what is selected, the pad mode and the octave.
///
/// The selection rule: when `selected_pad` is `Some(p)`, `selected_sound` is `pads[p]`. Anything
/// that changes a pad or the selected pad keeps it, as `Project::put` does. When `selected_pad` is
/// `None` the sound was selected some other way, as POOL will, and putting a sound on a pad leaves
/// `selected_sound` alone.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Track {
    pub pads: [Option<SoundNumber>; 12],
    pub selected_pad: Option<u8>,
    pub selected_sound: Option<SoundNumber>,
    pub mode: PadMode,
    /// 0 to `MAX_OCTAVE`.
    pub octave: u8,
}

impl Track {
    /// A track with empty pads, pad 1 selected, PADS mode and octave 4.
    pub const fn new() -> Self {
        Self {
            pads: [None; 12],
            selected_pad: Some(0),
            selected_sound: None,
            mode: PadMode::Pads,
            octave: 4,
        }
    }

    /// The MIDI note pad `pad` (0 to 11) plays in KEYS mode: C0 is 12, C4 60 and B8 119.
    pub fn key_pitch(&self, pad: u8) -> u8 {
        12 * (self.octave + 1) + pad
    }
}

impl Default for Track {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_new_track_selects_pad_1_in_pads_mode_at_c4() {
        let track = Track::new();

        assert_eq!(track.pads, [None; 12]);
        assert_eq!(track.selected_pad, Some(0));
        assert_eq!(track.selected_sound, None);
        assert_eq!(track.mode, PadMode::Pads);
        assert_eq!(track.octave, 4);
        assert_eq!(Track::default(), track);
    }

    #[test]
    fn key_pitches_run_from_c0_to_b8() {
        let mut track = Track::new();

        assert_eq!(track.key_pitch(0), 60);
        track.octave = 0;
        assert_eq!(track.key_pitch(0), 12);
        track.octave = MAX_OCTAVE;
        assert_eq!(track.key_pitch(11), 119);
    }

    #[test]
    fn each_pad_is_a_semitone_above_the_last() {
        let track = Track::new();

        for pad in 0..11 {
            assert_eq!(track.key_pitch(pad + 1), track.key_pitch(pad) + 1);
        }
    }
}
