use super::{Block, NOTE_BLOCKS};
use crate::project::pool::SoundNumber;

/// The curve field of a note with no pressure curve.
const NO_CURVE: u16 = 0x3FFF;

const _: () = assert!(
    NOTE_BLOCKS <= NO_CURVE as usize,
    "a note's 14 bits of curve no longer name every block"
);

/// A note of a track: 16 bytes in a leaf, little-endian.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Note {
    /// From 0.
    pub bar: u16,
    /// Ticks from the bar's start, below 32,768.
    pub place: u16,
    /// In ticks, below 2^31.
    pub length: u32,
    pub sound: SoundNumber,
    /// 0 to 127.
    pub pitch: u8,
    /// 1 to 127.
    pub velocity: u8,
    /// The block of its pressure curve.
    pub curve: Option<Block>,
}

/// Ordered by bar, then place, then sound, then pitch (Project model).
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct Key {
    pub bar: u16,
    pub place: u16,
    pub sound: SoundNumber,
    pub pitch: u8,
}

impl Key {
    /// The first key at a place: sound 0 and pitch 0, before every note's.
    pub const fn at(bar: u16, place: u16) -> Self {
        Self {
            bar,
            place,
            sound: SoundNumber(0),
            pitch: 0,
        }
    }

    /// After every note's key.
    pub const MAX: Self = Self {
        bar: u16::MAX,
        place: u16::MAX,
        sound: SoundNumber(u32::MAX),
        pitch: u8::MAX,
    };
}

impl Note {
    pub fn key(&self) -> Key {
        Key {
            bar: self.bar,
            place: self.place,
            sound: self.sound,
            pitch: self.pitch,
        }
    }

    pub(super) fn from_bytes(bytes: &[u8; 16]) -> Self {
        let curve = u16::from_le_bytes([bytes[14], bytes[15]]);
        Self {
            bar: u16::from_le_bytes([bytes[0], bytes[1]]),
            place: u16::from_le_bytes([bytes[2], bytes[3]]),
            length: u32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]),
            sound: SoundNumber(u32::from_le_bytes([
                bytes[8], bytes[9], bytes[10], bytes[11],
            ])),
            pitch: bytes[12],
            velocity: bytes[13],
            curve: (curve != NO_CURVE).then_some(curve),
        }
    }

    pub(super) fn to_bytes(self) -> [u8; 16] {
        let mut bytes = [0; 16];
        bytes[..2].copy_from_slice(&self.bar.to_le_bytes());
        bytes[2..4].copy_from_slice(&self.place.to_le_bytes());
        bytes[4..8].copy_from_slice(&self.length.to_le_bytes());
        bytes[8..12].copy_from_slice(&self.sound.0.to_le_bytes());
        bytes[12] = self.pitch;
        bytes[13] = self.velocity;
        bytes[14..].copy_from_slice(&self.curve.unwrap_or(NO_CURVE).to_le_bytes());
        bytes
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_note_reads_back_from_its_16_bytes() {
        let most = Note {
            bar: u16::MAX,
            place: 0x7FFF,
            length: 0x7FFF_FFFF,
            sound: SoundNumber(u32::MAX),
            pitch: 127,
            velocity: 127,
            curve: Some(NOTE_BLOCKS as Block - 1),
        };
        let least = Note {
            bar: 0,
            place: 0,
            length: 0,
            sound: SoundNumber(1),
            pitch: 0,
            velocity: 1,
            curve: None,
        };
        let mixed = Note {
            bar: 0x1234,
            place: 0x0567,
            length: 0x0123_4567,
            sound: SoundNumber(0x89AB_CDEF),
            pitch: 60,
            velocity: 100,
            curve: Some(0x0ABC),
        };

        // The spare bits are 0: the place's bit 15, the length's bit 31 and the curve's 14 and 15.
        assert_eq!(
            most.to_bytes(),
            [
                0xFF, 0xFF, 0xFF, 0x7F, 0xFF, 0xFF, 0xFF, 0x7F, 0xFF, 0xFF, 0xFF, 0xFF, 127, 127,
                0x17, 0x3C
            ]
        );
        assert_eq!(
            least.to_bytes(),
            [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0xFF, 0x3F]
        );
        assert_eq!(
            mixed.to_bytes(),
            [
                0x34, 0x12, 0x67, 0x05, 0x67, 0x45, 0x23, 0x01, 0xEF, 0xCD, 0xAB, 0x89, 60, 100,
                0xBC, 0x0A
            ]
        );
        for note in [most, least, mixed] {
            assert_eq!(Note::from_bytes(&note.to_bytes()), note);
        }
    }

    #[test]
    fn keys_order_by_bar_place_sound_then_pitch() {
        let key = |bar, place, sound, pitch| Key {
            bar,
            place,
            sound: SoundNumber(sound),
            pitch,
        };

        // Each key comes after the one before by an earlier field, however big the later ones.
        let keys = [
            Key::at(0, 0),
            key(0, 0, 1, 0),
            key(0, 0, 1, 127),
            key(0, 0, 2, 0),
            key(0, 0, u32::MAX, 127),
            key(0, 1, 0, 0),
            key(0, 0x7FFF, u32::MAX, 127),
            key(1, 0, 0, 0),
            key(u16::MAX, 0x7FFF, u32::MAX, 127),
            Key::MAX,
        ];

        assert!(keys.is_sorted_by(|a, b| a < b));
        assert_eq!(Key::at(3, 480), key(3, 480, 0, 0));
        let note = Note {
            bar: 3,
            place: 480,
            length: 960,
            sound: SoundNumber(2),
            pitch: 60,
            velocity: 127,
            curve: None,
        };
        assert_eq!(note.key(), key(3, 480, 2, 60));
    }
}
