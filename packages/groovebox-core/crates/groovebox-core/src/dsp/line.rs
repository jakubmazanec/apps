/// A delay line in a slice of 16-bit samples, which stores `value × scale` rounded toward zero and
/// held within `i16`, as Rings's `Compress` does, and reads it back divided by `scale` (S10, S11).
#[derive(Clone, Copy)]
pub struct Line {
    scale: f32,
    /// The next write's place.
    at: u32,
    /// The writes since the clear, held at `u32::MAX`.
    written: u32,
    /// The writes since the last that stored a sample that is not 0, held at `u32::MAX`, which it
    /// starts at.
    quiet: u32,
}

impl Line {
    pub const fn new(scale: f32) -> Self {
        Self {
            scale,
            at: 0,
            written: 0,
            quiet: u32::MAX,
        }
    }

    /// Every sample written so far reads 0 from now on. Writes nothing.
    pub fn clear(&mut self) {
        self.written = 0;
        self.quiet = u32::MAX;
    }

    pub fn write(&mut self, memory: &mut [i16], value: f32) {
        // Rounding toward zero stores 0 for anything below 1 / scale, so a line needs no flush.
        let stored = ((value * self.scale) as i32).clamp(i16::MIN.into(), i16::MAX.into()) as i16;
        memory[self.at as usize] = stored;
        self.at += 1;
        if self.at as usize == memory.len() {
            self.at = 0;
        }
        self.written = self.written.saturating_add(1);
        self.quiet = if stored == 0 {
            self.quiet.saturating_add(1)
        } else {
            0
        };
    }

    /// The sample written `back` writes ago, 1 the latest, at most `memory.len()`; 0 when it was
    /// written before the clear.
    pub fn read(&self, memory: &[i16], back: u32) -> f32 {
        if back > self.written {
            return 0.0;
        }
        let place = if back <= self.at {
            self.at - back
        } else {
            self.at + memory.len() as u32 - back
        };
        f32::from(memory[place as usize]) / self.scale
    }

    /// Whether one of the last `memory.len()` samples written was not 0.
    pub fn ringing(&self, memory: &[i16]) -> bool {
        self.quiet < memory.len() as u32
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_line_reads_what_it_wrote_and_zero_from_before_its_clear() {
        let mut memory = [0; 4];
        let mut line = Line::new(8_192.0);

        line.write(&mut memory, 0.5);
        line.write(&mut memory, 0.25);

        assert_eq!(line.read(&memory, 1), 0.25);
        assert_eq!(line.read(&memory, 2), 0.5);
        assert_eq!(line.read(&memory, 3), 0.0);
        line.clear();
        line.write(&mut memory, 0.125);
        assert_eq!(line.read(&memory, 1), 0.125);
        assert_eq!(line.read(&memory, 2), 0.0);
    }

    #[test]
    fn a_line_stores_16_bits_toward_zero_within_i16() {
        let stored = |value| {
            let mut memory = [0; 4];
            let mut line = Line::new(8_192.0);
            line.write(&mut memory, value);
            line.read(&memory, 1)
        };

        assert_eq!(stored(1.0 / 8_192.0 * 1.5), 1.0 / 8_192.0);
        assert_eq!(stored(-1.0 / 8_192.0 * 1.5), -1.0 / 8_192.0);
        assert_eq!(stored(10.0), 32_767.0 / 8_192.0);
        assert_eq!(stored(-10.0), -32_768.0 / 8_192.0);
    }

    #[test]
    fn a_line_stops_ringing_after_a_whole_line_of_zeros() {
        let mut memory = [0; 4];
        let mut line = Line::new(8_192.0);
        assert!(!line.ringing(&memory));

        line.write(&mut memory, 0.5);
        // A value that stores 0 counts as a zero.
        for value in [0.0, 0.0, 0.5 / 8_192.0] {
            line.write(&mut memory, value);
            assert!(line.ringing(&memory));
        }
        line.write(&mut memory, 0.0);

        assert!(!line.ringing(&memory));
        line.write(&mut memory, 0.5);
        assert!(line.ringing(&memory));
        line.clear();
        assert!(!line.ringing(&memory));
    }
}
