use crate::project::pool::SoundNumber;
use crate::screen::Color;

pub const BACKGROUND: Color = Color(0);
pub const TEXT: Color = Color(1);
pub const DIM: Color = Color(2);
pub const FAINT: Color = Color(3);
pub const LINE: Color = Color(4);
pub const SHOWN_BAR: Color = Color(5);
pub const ACCENT: Color = Color(6);
pub const RECORD: Color = Color(7);
pub const NOTE_SOFT: Color = Color(8);
pub const NOTE_MID: Color = Color(9);
pub const NOTE_LOUD: Color = Color(10);

/// The index of the first sound colour: each hue has four, from `SOUND_COLORS + 4 × hue`.
const SOUND_COLORS: u8 = 11;
/// The twelve hues of the sounds' notes on ROLL (Look, "Colour").
const HUES: [[u8; 3]; 12] = [
    [0xe0, 0x60, 0x7a],
    [0xd9, 0xa4, 0x41],
    [0xb6, 0xc9, 0x4a],
    [0x5e, 0xc3, 0x6b],
    [0x3f, 0xc9, 0xb0],
    [0x4f, 0xb8, 0xe6],
    [0x6f, 0x8c, 0xf2],
    [0xa2, 0x7e, 0xf0],
    [0xd1, 0x73, 0xd6],
    [0xe8, 0xe0, 0xc8],
    [0x9a, 0xb0, 0xc0],
    [0xc9, 0xa0, 0x7e],
];
/// A hue's four brightnesses in hundredths, mixed with black: the selected sound's notes at
/// velocity 100 and up, 60 to 99 and below 60, then every other sound's (S8).
const SHADES: [u32; 4] = [100, 72, 48, 32];

/// The colour of a note of `sound` at `velocity` on ROLL (S8): its hue is its number less 1,
/// cycling through the twelve, at its brightness by velocity while the sound is `selected` and
/// dim otherwise.
pub const fn sound_color(sound: SoundNumber, velocity: u8, selected: bool) -> Color {
    let shade = match (selected, velocity) {
        (false, _) => 3,
        (true, 100..) => 0,
        (true, 60..) => 1,
        (true, _) => 2,
    };
    Color(SOUND_COLORS + 4 * ((sound.0 - 1) % 12) as u8 + shade)
}

/// The colour of each index as red, green and blue: the named entries, then the sound colours,
/// each channel rounded half up (S8). Every other index is black.
pub const PALETTE: [[u8; 3]; 256] = {
    let mut palette = [[0; 3]; 256];
    palette[BACKGROUND.0 as usize] = [0x00, 0x00, 0x00];
    palette[TEXT.0 as usize] = [0xe8, 0xe8, 0xe8];
    palette[DIM.0 as usize] = [0x6e, 0x6e, 0x6e];
    palette[FAINT.0 as usize] = [0x1e, 0x1e, 0x1e];
    palette[LINE.0 as usize] = [0x3c, 0x3c, 0x3c];
    palette[SHOWN_BAR.0 as usize] = [0x0e, 0x0e, 0x0e];
    palette[ACCENT.0 as usize] = [0xff, 0x7a, 0x2f];
    palette[RECORD.0 as usize] = [0xff, 0x4a, 0x4a];
    palette[NOTE_SOFT.0 as usize] = [0x5c, 0x5c, 0x5c];
    palette[NOTE_MID.0 as usize] = [0xa0, 0xa0, 0xa0];
    palette[NOTE_LOUD.0 as usize] = [0xf2, 0xf2, 0xf2];
    let mut entry = 0;
    while entry < 4 * HUES.len() {
        let (hue, shade) = (HUES[entry / 4], SHADES[entry % 4]);
        let mut channel = 0;
        while channel < 3 {
            palette[SOUND_COLORS as usize + entry][channel] =
                ((hue[channel] as u32 * shade + 50) / 100) as u8;
            channel += 1;
        }
        entry += 1;
    }
    palette
};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn palette_entries() {
        assert_eq!(PALETTE[6], [0xff, 0x7a, 0x2f]);
        assert_eq!(PALETTE[4], [0x3c, 0x3c, 0x3c]);
    }

    #[test]
    fn the_sound_colours_are_four_shades_of_twelve_hues() {
        assert_eq!(PALETTE[11], [0xe0, 0x60, 0x7a]);
        // #6f8cf2 × 0.72 and #c9a07e × 0.32, each channel rounded half up.
        assert_eq!(PALETTE[11 + 4 * 6 + 1], [80, 101, 174]);
        assert_eq!(PALETTE[11 + 4 * 11 + 3], [64, 51, 40]);
        assert!(PALETTE[59..].iter().all(|&entry| entry == [0, 0, 0]));

        let seven = SoundNumber(7);
        assert_eq!(sound_color(seven, 100, true), Color(35));
        assert_eq!(sound_color(seven, 99, true), Color(36));
        assert_eq!(sound_color(seven, 59, true), Color(37));
        assert_eq!(sound_color(seven, 127, false), Color(38));
        assert_eq!(sound_color(seven, 1, false), Color(38));
        // The twelve hues cycle.
        for (velocity, selected) in [(127, true), (80, true), (1, true), (127, false)] {
            assert_eq!(
                sound_color(SoundNumber(13), velocity, selected),
                sound_color(SoundNumber(1), velocity, selected)
            );
        }
    }
}
