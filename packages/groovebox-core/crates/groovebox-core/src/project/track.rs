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
/// The selection rule: when `selected_pad` is `Some(p)`, `selected_sound` is `pads[p]`. `select`,
/// `select_sound` and `put` keep it, so a pad or the selection changes through them and never by
/// writing the fields. When `selected_pad` is `None` the sound was selected on no pad, as POOL does
/// through `select_sound`, and putting a sound on a pad leaves `selected_sound` alone.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Track {
    pub pads: [Option<SoundNumber>; 12],
    pub selected_pad: Option<u8>,
    pub selected_sound: Option<SoundNumber>,
    pub mode: PadMode,
    /// 0 to `MAX_OCTAVE`.
    pub octave: u8,
    /// The pitch of the last key played in KEYS mode, by a pad or by a MIDI note that KEYS mode
    /// plays, whether or not a sound played it. A step entered in KEYS mode gets it, or the C of
    /// the current octave while it is `None`, before any key has been played.
    pub last_key: Option<u8>,
}

impl Track {
    /// A track with empty pads, pad 1 selected, PADS mode and octave 4, on which no key has been
    /// played.
    pub const fn new() -> Self {
        Self {
            pads: [None; 12],
            selected_pad: Some(0),
            selected_sound: None,
            mode: PadMode::Pads,
            octave: 4,
            last_key: None,
        }
    }

    /// Selects pad `pad` (0 to 11) and its sound, which is none when the pad is empty.
    pub fn select(&mut self, pad: u8) {
        self.selected_pad = Some(pad);
        self.selected_sound = self.pads[usize::from(pad)];
    }

    /// Selects `sound` and the first pad that holds it, or no pad when none does.
    pub fn select_sound(&mut self, sound: SoundNumber) {
        self.selected_pad = (0..12).find(|&pad| self.pads[usize::from(pad)] == Some(sound));
        self.selected_sound = Some(sound);
    }

    /// Empties every pad that holds `sound`. A selection of `sound` on no pad goes back to pad 1.
    pub fn remove(&mut self, sound: SoundNumber) {
        for pad in 0..12 {
            if self.pads[usize::from(pad)] == Some(sound) {
                self.put(pad, None);
            }
        }
        if self.selected_pad.is_none() && self.selected_sound == Some(sound) {
            self.select(0);
        }
    }

    /// Puts `sound` on pad `pad` (0 to 11), or empties the pad. When the pad is the selected pad,
    /// the sound becomes the selected one too.
    pub fn put(&mut self, pad: u8, sound: Option<SoundNumber>) {
        self.pads[usize::from(pad)] = sound;
        if self.selected_pad == Some(pad) {
            self.selected_sound = sound;
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
        assert_eq!(track.last_key, None);
        assert_eq!(Track::default(), track);
    }

    #[test]
    fn selecting_a_pad_with_a_sound_selects_that_sound() {
        let mut track = Track::new();
        track.put(3, Some(SoundNumber(7)));

        track.select(3);

        assert_eq!(track.selected_pad, Some(3));
        assert_eq!(track.selected_sound, Some(SoundNumber(7)));
    }

    #[test]
    fn selecting_an_empty_pad_clears_the_selected_sound() {
        let mut track = Track::new();
        track.put(0, Some(SoundNumber(1)));
        assert_eq!(track.selected_sound, Some(SoundNumber(1)));

        track.select(5);

        assert_eq!(track.selected_pad, Some(5));
        assert_eq!(track.selected_sound, None);
        assert_eq!(track.pads[0], Some(SoundNumber(1)));
    }

    #[test]
    fn selecting_the_selected_pad_again_changes_nothing() {
        let mut track = Track::new();
        track.put(0, Some(SoundNumber(1)));
        let before = track;

        track.select(0);

        assert_eq!(track, before);
    }

    #[test]
    fn putting_a_sound_on_the_selected_pad_selects_it() {
        let mut track = Track::new();

        track.put(0, Some(SoundNumber(4)));

        assert_eq!(track.pads[0], Some(SoundNumber(4)));
        assert_eq!(track.selected_pad, Some(0));
        assert_eq!(track.selected_sound, Some(SoundNumber(4)));
    }

    #[test]
    fn putting_nothing_on_the_selected_pad_clears_the_selected_sound() {
        let mut track = Track::new();
        track.put(0, Some(SoundNumber(4)));

        track.put(0, None);

        assert_eq!(track.pads[0], None);
        assert_eq!(track.selected_sound, None);
    }

    #[test]
    fn putting_a_sound_on_another_pad_keeps_the_selection() {
        let mut track = Track::new();
        track.put(0, Some(SoundNumber(1)));

        track.put(7, Some(SoundNumber(2)));

        assert_eq!(track.pads[7], Some(SoundNumber(2)));
        assert_eq!(track.selected_pad, Some(0));
        assert_eq!(track.selected_sound, Some(SoundNumber(1)));
    }

    #[test]
    fn putting_a_sound_without_a_selected_pad_leaves_the_selected_sound_alone() {
        let mut track = Track::new();
        // A sound selected somewhere other than a pad, as POOL does.
        track.selected_pad = None;
        track.selected_sound = Some(SoundNumber(1));

        track.put(0, Some(SoundNumber(2)));

        assert_eq!(track.pads[0], Some(SoundNumber(2)));
        assert_eq!(track.selected_sound, Some(SoundNumber(1)));
    }

    #[test]
    fn selecting_a_sound_selects_the_first_pad_that_holds_it() {
        let mut track = Track::new();
        track.put(7, Some(SoundNumber(5)));
        track.put(3, Some(SoundNumber(5)));

        track.select_sound(SoundNumber(5));

        assert_eq!(track.selected_pad, Some(3));
        assert_eq!(track.selected_sound, Some(SoundNumber(5)));
    }

    #[test]
    fn selecting_a_sound_on_no_pad_leaves_no_pad_selected() {
        let mut track = Track::new();
        track.put(0, Some(SoundNumber(1)));

        track.select_sound(SoundNumber(9));

        assert_eq!(track.selected_pad, None);
        assert_eq!(track.selected_sound, Some(SoundNumber(9)));
    }

    #[test]
    fn removing_a_sound_empties_its_pads_and_keeps_the_selected_pad() {
        let mut track = Track::new();
        track.put(0, Some(SoundNumber(4)));
        track.put(2, Some(SoundNumber(4)));

        track.remove(SoundNumber(4));

        assert_eq!(track.pads, [None; 12]);
        assert_eq!(track.selected_pad, Some(0));
        assert_eq!(track.selected_sound, None);
    }

    #[test]
    fn removing_a_sound_selected_on_no_pad_selects_pad_1() {
        let mut track = Track::new();
        track.put(0, Some(SoundNumber(1)));
        track.select_sound(SoundNumber(2));

        track.remove(SoundNumber(2));

        assert_eq!(track.selected_pad, Some(0));
        assert_eq!(track.selected_sound, Some(SoundNumber(1)));
    }

    #[test]
    fn removing_another_sound_keeps_the_selection() {
        let mut track = Track::new();
        track.put(0, Some(SoundNumber(1)));
        track.put(4, Some(SoundNumber(3)));

        track.remove(SoundNumber(3));

        assert_eq!(track.pads[4], None);
        assert_eq!(track.selected_pad, Some(0));
        assert_eq!(track.selected_sound, Some(SoundNumber(1)));

        track.select_sound(SoundNumber(2));
        track.remove(SoundNumber(1));

        assert_eq!(track.selected_pad, None);
        assert_eq!(track.selected_sound, Some(SoundNumber(2)));
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
