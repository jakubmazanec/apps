#![allow(unsafe_code)]

use crate::budget;
use core::cell::UnsafeCell;

/// 2 seconds of stereo 16-bit samples at 48 kHz: the delay, the largest effect (S9).
pub const PIECE: usize = 192_000;
pub const PIECES: usize = 24;
pub type Piece = [i16; PIECE];

const _: () = assert!(
    size_of::<EffectRam>() <= budget::EFFECT_RAM,
    "the effect memory outgrew effect_ram in budget.toml"
);

/// The effect memory: a host keeps it beside the device, outside the working memory, and gives it
/// to the audio side alone. Slot `s` of track `t` starts on piece `6t + s`.
pub struct EffectRam {
    pieces: UnsafeCell<[Piece; PIECES]>,
}

// SAFETY: `pieces` is the only way to the pieces, and its callers promise that only the one audio
// side touches them.
unsafe impl Sync for EffectRam {}

impl EffectRam {
    #[expect(
        clippy::new_without_default,
        reason = "an effect memory is too big to build anywhere but in a static or on the heap"
    )]
    pub const fn new() -> Self {
        Self {
            pieces: UnsafeCell::new([[0; PIECE]; PIECES]),
        }
    }

    /// An effect memory zeroed straight on the heap: one built on the stack would overflow it.
    #[cfg(any(test, feature = "harness"))]
    pub fn boxed() -> std::boxed::Box<Self> {
        // SAFETY: zeroed bytes are an effect memory.
        unsafe { std::boxed::Box::new_zeroed().assume_init() }
    }

    /// # Safety
    ///
    /// Only the one audio side calls it, and holds the pieces while it lives.
    #[expect(
        clippy::mut_from_ref,
        reason = "the effect memory is the audio side's alone"
    )]
    pub unsafe fn pieces(&self) -> &mut [Piece; PIECES] {
        // SAFETY: the caller promises that nothing else holds the pieces meanwhile.
        unsafe { &mut *self.pieces.get() }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_effect_memory_is_the_budgets() {
        assert_eq!(size_of::<EffectRam>(), budget::EFFECT_RAM);
    }
}
