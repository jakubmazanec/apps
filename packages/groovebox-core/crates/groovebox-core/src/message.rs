pub const MESSAGE_QUEUE: usize = 256;
pub const REPORT_QUEUE: usize = 256;

/// A control message for the audio part. The audio part applies it at the first chunk start at or
/// after `at`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Message {
    pub number: u32,
    pub at: u64,
    pub kind: MessageKind,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MessageKind {
    ToneOn { pad: u8, velocity: u8 },
    ToneOff,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Report {
    Applied { number: u32, sample: u64 },
}
