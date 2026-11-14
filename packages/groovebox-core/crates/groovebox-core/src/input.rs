pub const PADS: u8 = 12;
pub const STEPS: u8 = 16;
/// The four encoders with push switches, then the volume.
pub const ENCODERS: u8 = 5;
/// The index of the volume encoder.
pub const VOLUME: u8 = 4;

/// A button of the device. `Step` holds a step 0 to 15 and `Push` the push switch of encoder 0 to
/// 3; other numbers have no code.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Button {
    T1,
    T2,
    T3,
    T4,
    PadsKeys,
    Roll,
    Menu,
    Page,
    Copy,
    Shift,
    Rec,
    Play,
    Stop,
    Tempo,
    Up,
    Down,
    Left,
    Right,
    Ok,
    Cancel,
    Minus,
    Plus,
    Step(u8),
    Push(u8),
}

impl Button {
    const FIRST_STEP: u8 = 32;
    const LAST_STEP: u8 = Self::FIRST_STEP + STEPS - 1;
    const FIRST_PUSH: u8 = 48;
    /// The encoders below `VOLUME` have a push switch.
    const LAST_PUSH: u8 = Self::FIRST_PUSH + VOLUME - 1;

    /// The code that the browser export and the shell use for this button.
    pub const fn code(self) -> u8 {
        match self {
            Self::T1 => 0,
            Self::T2 => 1,
            Self::T3 => 2,
            Self::T4 => 3,
            Self::PadsKeys => 4,
            Self::Roll => 5,
            Self::Menu => 6,
            Self::Page => 7,
            Self::Copy => 8,
            Self::Shift => 9,
            Self::Rec => 10,
            Self::Play => 11,
            Self::Stop => 12,
            Self::Tempo => 13,
            Self::Up => 14,
            Self::Down => 15,
            Self::Left => 16,
            Self::Right => 17,
            Self::Ok => 18,
            Self::Cancel => 19,
            Self::Minus => 20,
            Self::Plus => 21,
            Self::Step(step) => Self::FIRST_STEP + step,
            Self::Push(push) => Self::FIRST_PUSH + push,
        }
    }

    /// The button with this code, if there is one.
    pub const fn from_code(code: u8) -> Option<Self> {
        Some(match code {
            0 => Self::T1,
            1 => Self::T2,
            2 => Self::T3,
            3 => Self::T4,
            4 => Self::PadsKeys,
            5 => Self::Roll,
            6 => Self::Menu,
            7 => Self::Page,
            8 => Self::Copy,
            9 => Self::Shift,
            10 => Self::Rec,
            11 => Self::Play,
            12 => Self::Stop,
            13 => Self::Tempo,
            14 => Self::Up,
            15 => Self::Down,
            16 => Self::Left,
            17 => Self::Right,
            18 => Self::Ok,
            19 => Self::Cancel,
            20 => Self::Minus,
            21 => Self::Plus,
            Self::FIRST_STEP..=Self::LAST_STEP => Self::Step(code - Self::FIRST_STEP),
            Self::FIRST_PUSH..=Self::LAST_PUSH => Self::Push(code - Self::FIRST_PUSH),
            _ => return None,
        })
    }
}

/// An input. The core takes its values as they are; the browser export and the scene parser keep
/// them in range: pads below `PADS`, encoders below `ENCODERS`, `clicks` from -127 to 127 and not
/// 0, notes and pressures from 0 to 127 and velocities from 1 to 127.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Input {
    PadHit { pad: u8, velocity: u8 },
    PadRelease { pad: u8 },
    PadPressure { pad: u8, pressure: u8 },
    ButtonPress { button: Button },
    ButtonRelease { button: Button },
    EncoderTurn { encoder: u8, clicks: i8 },
    NoteOn { note: u8, velocity: u8 },
    NoteOff { note: u8 },
    NotePressure { note: u8, pressure: u8 },
    ChannelPressure { pressure: u8 },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Stamped {
    pub sample: u64,
    pub input: Input,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_button_code_round_trips() {
        let mut known = 0;
        for code in 0..=u8::MAX {
            if let Some(button) = Button::from_code(code) {
                assert_eq!(button.code(), code);
                known += 1;
            }
        }

        // 22 function buttons, 16 steps and 4 pushes.
        assert_eq!(known, 22 + 16 + 4);
    }

    #[test]
    fn the_codes_of_the_table() {
        use Button::*;
        let functions = [
            T1, T2, T3, T4, PadsKeys, Roll, Menu, Page, Copy, Shift, Rec, Play, Stop, Tempo, Up,
            Down, Left, Right, Ok, Cancel, Minus, Plus,
        ];
        for (code, button) in (0..).zip(functions) {
            assert_eq!(button.code(), code);
        }
        assert_eq!(Step(0).code(), 32);
        assert_eq!(Step(15).code(), 47);
        assert_eq!(Push(0).code(), 48);
        assert_eq!(Push(3).code(), 51);
        for code in [22, 31, 52, 255] {
            assert_eq!(Button::from_code(code), None);
        }
    }
}
