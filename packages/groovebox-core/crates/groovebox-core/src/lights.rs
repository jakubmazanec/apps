/// The lights of the panel, one bit each, on when lit. The control side stores them after every
/// step, and the shell lights the panel from them: the "Lights" table under "Shared formats" in
/// the screens and pads plan.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Lights(pub u64);

impl Lights {
    /// Pad 1; pads 2 to 12 follow.
    pub const PAD: u32 = 0;
    /// Step 1; steps 2 to 16 follow.
    pub const STEP: u32 = 12;
    /// T1; T2 to T4 follow.
    pub const TRACK: u32 = 28;
    pub const PADS_KEYS: u32 = 32;
    pub const ROLL: u32 = 33;
    pub const REC: u32 = 34;
    pub const PLAY: u32 = 35;
    pub const TEMPO: u32 = 36;

    /// Turns the light at `bit` on.
    pub fn light(&mut self, bit: u32) {
        self.0 |= 1 << bit;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::input::{PADS, STEPS};

    #[test]
    fn every_light_has_its_own_bit_in_the_order_of_the_table() {
        let mut bits = std::vec::Vec::new();
        bits.extend((0..u32::from(PADS)).map(|pad| Lights::PAD + pad));
        bits.extend((0..u32::from(STEPS)).map(|step| Lights::STEP + step));
        bits.extend((0..4).map(|track| Lights::TRACK + track));
        bits.extend([
            Lights::PADS_KEYS,
            Lights::ROLL,
            Lights::REC,
            Lights::PLAY,
            Lights::TEMPO,
        ]);

        assert_eq!(bits, (0..37).collect::<std::vec::Vec<_>>());
    }

    #[test]
    fn a_light_turns_on_its_own_bit_only() {
        let mut lights = Lights(1 << Lights::PAD);

        lights.light(Lights::TEMPO);
        lights.light(Lights::TEMPO);

        assert_eq!(lights, Lights(1 | 1 << 36));
    }
}
