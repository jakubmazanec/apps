pub const PADS: u8 = 12;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Input {
    PadHit { pad: u8, velocity: u8 },
    PadRelease { pad: u8 },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Stamped {
    pub sample: u64,
    pub input: Input,
}
