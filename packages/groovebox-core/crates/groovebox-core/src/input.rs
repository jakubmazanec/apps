use core::ops::{RangeBounds, RangeInclusive};

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

const DATA: RangeInclusive<u8> = 0..=127;
const VELOCITY: RangeInclusive<u8> = 1..=127;

/// `value` as a byte, when it lies in `range`.
fn within(value: u32, range: impl RangeBounds<u8>) -> Option<u8> {
    u8::try_from(value).ok().filter(|byte| range.contains(byte))
}

/// An input. The core takes its values as they are; the browser export and the scene parser keep
/// them in range: pads below `PADS`, encoders below `ENCODERS`, `clicks` from -127 to 127 and not
/// 0, notes and pressures from 0 to 127, velocities from 1 to 127 and dropped files from 1.
/// `Dropped` says that the platform copied a drop's `files` .wav files into `tmp/`, each into the
/// next numbered folder. `OutputDelay` says how many samples the platform's output takes to sound
/// what the audio part renders.
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
    Dropped { files: u16 },
    OutputDelay { samples: u16 },
}

impl Input {
    /// The input that a kind and its two parameters stand for, or `None` for an unknown kind or a
    /// value out of its range. This is the wire format of the browser export and the shell: the
    /// "Inputs" table under "Shared formats" in the screens and pads plan lists the kinds and what
    /// `a` and `b` hold. A kind ignores the parameter it does not name.
    pub fn from_wire(kind: u32, a: u32, b: u32) -> Option<Self> {
        Some(match kind {
            0 => Self::PadHit {
                pad: within(a, 0..PADS)?,
                velocity: within(b, VELOCITY)?,
            },
            1 => Self::PadRelease {
                pad: within(a, 0..PADS)?,
            },
            2 => Self::PadPressure {
                pad: within(a, 0..PADS)?,
                pressure: within(b, DATA)?,
            },
            3 => Self::ButtonPress {
                button: Button::from_code(u8::try_from(a).ok()?)?,
            },
            4 => Self::ButtonRelease {
                button: Button::from_code(u8::try_from(a).ok()?)?,
            },
            5 => Self::EncoderTurn {
                encoder: within(a, 0..ENCODERS)?,
                // The clicks arrive as the bits of an `i32`, from -127 to 127 and not 0.
                clicks: i8::try_from(b as i32)
                    .ok()
                    .filter(|&clicks| clicks != 0 && clicks != i8::MIN)?,
            },
            6 => Self::NoteOn {
                note: within(a, DATA)?,
                velocity: within(b, VELOCITY)?,
            },
            7 => Self::NoteOff {
                note: within(a, DATA)?,
            },
            8 => Self::NotePressure {
                note: within(a, DATA)?,
                pressure: within(b, DATA)?,
            },
            9 => Self::ChannelPressure {
                pressure: within(a, DATA)?,
            },
            10 => Self::Dropped {
                files: u16::try_from(a).ok().filter(|&files| files > 0)?,
            },
            11 => Self::OutputDelay {
                samples: u16::try_from(a).ok()?,
            },
            _ => return None,
        })
    }

    /// The kind, `a` and `b` of this input on the wire: the inverse of `from_wire`, with 0 for the
    /// parameter a kind does not name.
    pub fn to_wire(self) -> (u32, u32, u32) {
        match self {
            Self::PadHit { pad, velocity } => (0, pad.into(), velocity.into()),
            Self::PadRelease { pad } => (1, pad.into(), 0),
            Self::PadPressure { pad, pressure } => (2, pad.into(), pressure.into()),
            Self::ButtonPress { button } => (3, button.code().into(), 0),
            Self::ButtonRelease { button } => (4, button.code().into(), 0),
            Self::EncoderTurn { encoder, clicks } => (5, encoder.into(), i32::from(clicks) as u32),
            Self::NoteOn { note, velocity } => (6, note.into(), velocity.into()),
            Self::NoteOff { note } => (7, note.into(), 0),
            Self::NotePressure { note, pressure } => (8, note.into(), pressure.into()),
            Self::ChannelPressure { pressure } => (9, pressure.into(), 0),
            Self::Dropped { files } => (10, files.into(), 0),
            Self::OutputDelay { samples } => (11, samples.into(), 0),
        }
    }
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

    #[test]
    fn every_kind_round_trips_through_the_wire() {
        use Button::*;
        let inputs = [
            Input::PadHit {
                pad: 11,
                velocity: 127,
            },
            Input::PadRelease { pad: 3 },
            Input::PadPressure {
                pad: 2,
                pressure: 64,
            },
            Input::ButtonPress { button: Menu },
            Input::ButtonRelease { button: Step(15) },
            Input::EncoderTurn {
                encoder: VOLUME,
                clicks: -127,
            },
            Input::NoteOn {
                note: 60,
                velocity: 1,
            },
            Input::NoteOff { note: 127 },
            Input::NotePressure {
                note: 61,
                pressure: 99,
            },
            Input::ChannelPressure { pressure: 0 },
            Input::Dropped { files: 65_535 },
            Input::OutputDelay { samples: 65_535 },
        ];

        for (kind, input) in (0..).zip(inputs) {
            let (wire_kind, a, b) = input.to_wire();

            assert_eq!(wire_kind, kind, "{input:?}");
            assert_eq!(Input::from_wire(wire_kind, a, b), Some(input), "{input:?}");
        }
    }

    #[test]
    fn the_wire_carries_the_parameters_in_the_order_of_the_table() {
        let wire = |input: Input| input.to_wire();

        assert_eq!(
            wire(Input::PadHit {
                pad: 5,
                velocity: 90
            }),
            (0, 5, 90)
        );
        assert_eq!(
            wire(Input::PadPressure {
                pad: 6,
                pressure: 70
            }),
            (2, 6, 70)
        );
        assert_eq!(
            wire(Input::ButtonPress {
                button: Button::Cancel
            }),
            (3, 19, 0)
        );
        assert_eq!(
            wire(Input::ButtonRelease {
                button: Button::Push(3)
            }),
            (4, 51, 0)
        );
        assert_eq!(
            wire(Input::EncoderTurn {
                encoder: 1,
                clicks: -3
            }),
            (5, 1, -3_i32 as u32)
        );
        assert_eq!(
            wire(Input::NoteOn {
                note: 60,
                velocity: 90
            }),
            (6, 60, 90)
        );
        assert_eq!(wire(Input::NoteOff { note: 60 }), (7, 60, 0));
        assert_eq!(
            wire(Input::NotePressure {
                note: 61,
                pressure: 99
            }),
            (8, 61, 99)
        );
        assert_eq!(wire(Input::ChannelPressure { pressure: 40 }), (9, 40, 0));
        assert_eq!(wire(Input::Dropped { files: 3 }), (10, 3, 0));
        assert_eq!(wire(Input::OutputDelay { samples: 2_816 }), (11, 2_816, 0));
    }

    #[test]
    fn the_output_delay_round_trips_on_the_wire() {
        let delay = Input::OutputDelay { samples: 1_200 };

        assert_eq!(Input::from_wire(11, 1_200, 0), Some(delay));
        assert_eq!(delay.to_wire(), (11, 1_200, 0));
        // `b` is ignored.
        assert_eq!(Input::from_wire(11, 1_200, 7), Some(delay));
        assert_eq!(Input::from_wire(11, 65_536, 0), None);
    }

    #[test]
    fn the_wire_takes_the_edges_of_every_range() {
        for (kind, a, b) in [
            (0, 0, 1),
            (0, 11, 127),
            (1, 11, 0),
            (2, 0, 0),
            (2, 11, 127),
            (3, 0, 0),
            (3, 21, 0),
            (3, 51, 0),
            (4, 32, 0),
            (4, 47, 0),
            (5, 0, 1),
            (5, 4, 127),
            (5, 4, -127_i32 as u32),
            (6, 0, 1),
            (6, 127, 127),
            (7, 127, 0),
            (8, 0, 0),
            (8, 127, 127),
            (9, 0, 0),
            (9, 127, 0),
            (10, 1, 0),
            (10, 65_535, 0),
            (11, 0, 0),
            (11, 65_535, 0),
        ] {
            assert!(Input::from_wire(kind, a, b).is_some(), "{kind} {a} {b}");
        }
    }

    #[test]
    fn the_wire_refuses_what_is_out_of_range() {
        for (kind, a, b) in [
            (10, 0, 0),
            (10, 65_536, 0),
            (11, 65_536, 0),
            (12, 0, 0),
            (u32::MAX, 0, 0),
            (0, 12, 100),
            (0, 256, 100),
            (0, 0, 0),
            (0, 0, 128),
            (0, 0, 256),
            (1, 12, 0),
            (1, 256, 0),
            (2, 12, 0),
            (2, 256, 0),
            (2, 0, 128),
            (3, 22, 0),
            (3, 31, 0),
            (3, 52, 0),
            (3, 256, 0),
            (4, 22, 0),
            (4, 31, 0),
            (4, 52, 0),
            (4, 256, 0),
            (5, 5, 1),
            (5, 256, 1),
            (5, 0, 0),
            (5, 0, 128),
            (5, 0, -128_i32 as u32),
            (5, 0, 1 << 31),
            (6, 128, 1),
            (6, 0, 0),
            (6, 0, 128),
            (6, 0, 256),
            (7, 128, 0),
            (7, 256, 0),
            (8, 128, 0),
            (8, 0, 128),
            (8, 0, 256),
            (9, 128, 0),
            (9, 256, 0),
        ] {
            assert_eq!(Input::from_wire(kind, a, b), None, "{kind} {a} {b}");
        }
    }
}
