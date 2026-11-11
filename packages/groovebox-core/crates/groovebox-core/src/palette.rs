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

/// The colour of each index as red, green and blue. Every index without a name is black. The
/// sound colours come with ROLL.
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
    palette
};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn palette_entries() {
        assert_eq!(PALETTE[6], [0xff, 0x7a, 0x2f]);
        assert_eq!(PALETTE[4], [0x3c, 0x3c, 0x3c]);
        assert!(PALETTE[11..].iter().all(|&entry| entry == [0, 0, 0]));
    }
}
