use super::flush;

#[derive(Clone, Copy, PartialEq)]
enum Stage {
    Attack,
    Decay,
    Release,
}

/// An ADSR envelope. The attack rises in a line and the decay and the release fall exponentially:
/// the remaining distance to their target shrinks to 1/1,000 over their time.
pub struct Envelope {
    level: f32,
    stage: Stage,
    /// The sustain the last `next` was given: a decay towards 0 ends the note as a release does.
    sustain: f32,
    /// The time the cached `fall` is for: it takes a power, too dear to find per sample.
    fall_time: u32,
    /// How much of the distance to its target the level keeps each sample.
    fall: f32,
}

impl Envelope {
    pub const fn new() -> Self {
        Self {
            level: 0.0,
            stage: Stage::Release,
            sustain: 0.0,
            fall_time: 0,
            fall: 0.0,
        }
    }

    /// Starts the attack from the current level, so a restart never clicks.
    pub fn start(&mut self) {
        self.stage = Stage::Attack;
    }

    /// Starts the release from the current level.
    pub fn release(&mut self) {
        self.stage = Stage::Release;
    }

    /// Whether the level has fallen below 1/10,000 on its way to 0: in the release, or in the decay
    /// when the sustain it was last given is 0. A new envelope is done.
    pub fn is_done(&self) -> bool {
        self.level < 0.0001
            && match self.stage {
                Stage::Attack => false,
                Stage::Decay => self.sustain == 0.0,
                Stage::Release => true,
            }
    }

    /// The next level. The times are in samples; a time of 0 jumps at once.
    pub fn next(&mut self, attack: u32, decay: u32, sustain: f32, release: u32) -> f32 {
        self.sustain = sustain;
        match self.stage {
            Stage::Attack => {
                self.level += 1.0 / attack as f32;
                if self.level >= 1.0 {
                    self.level = 1.0;
                    self.stage = Stage::Decay;
                }
            }
            Stage::Decay => self.level = sustain + (self.level - sustain) * self.fall(decay),
            Stage::Release => self.level *= self.fall(release),
        }
        self.level = flush(self.level);
        self.level
    }

    fn fall(&mut self, time: u32) -> f32 {
        if time != self.fall_time {
            self.fall_time = time;
            self.fall = libm::powf(0.001, 1.0 / time as f32);
        }
        self.fall
    }
}

impl Default for Envelope {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn attack_rises_in_its_time_and_sustain_holds() {
        let mut envelope = Envelope::new();
        envelope.start();
        let mut next = || envelope.next(480, 4_800, 0.6, 4_800);

        assert!(libm::fabsf((0..480).map(|_| next()).last().unwrap() - 1.0) < 0.0001);
        assert!(libm::fabsf((0..4_800).map(|_| next()).last().unwrap() - 0.6) < 0.001);
        assert!((0..4_800).all(|_| libm::fabsf(next() - 0.6) < 0.001));
    }

    #[test]
    fn release_ends_the_note() {
        let mut envelope = Envelope::new();
        assert!(envelope.is_done());
        envelope.start();
        assert!(!envelope.is_done());
        envelope.next(1, 4_800, 1.0, 4_800);
        envelope.release();
        let done = (1..).find(|_| {
            envelope.next(1, 4_800, 1.0, 4_800);
            envelope.is_done()
        });

        // Exactly 1/10,000 is reached at sample 6,400, so the first sample below it is 6,401; the
        // floats may land on either side of it, or one sample later.
        assert!((6_400..=6_402).contains(&done.unwrap()), "{done:?}");
    }

    #[test]
    fn a_decay_to_zero_ends_the_note_without_a_release() {
        let mut envelope = Envelope::new();
        envelope.start();
        let mut done = || {
            envelope.next(480, 4_800, 0.0, 4_800);
            envelope.is_done()
        };

        assert!((0..480).all(|_| !done()));
        // The decay falls as a release does: 6,400 samples to 1/10,000 of its start.
        let ended = (1..=10_000).find(|_| done());
        assert!((6_400..=6_402).contains(&ended.unwrap()), "{ended:?}");
    }

    #[test]
    fn a_time_of_zero_jumps_at_once() {
        let mut envelope = Envelope::new();
        envelope.start();

        assert_eq!(envelope.next(0, 0, 0.6, 0), 1.0);
        assert_eq!(envelope.next(0, 0, 0.6, 0), 0.6);
        envelope.next(480, 4_800, 0.6, 4_800);
        assert_eq!(envelope.next(0, 0, 0.6, 0), 0.6);
        envelope.release();
        assert_eq!(envelope.next(0, 0, 0.6, 0), 0.0);
        assert!(envelope.is_done());
    }

    #[test]
    fn a_restart_starts_from_the_current_level() {
        let mut envelope = Envelope::new();
        envelope.start();
        (0..100).for_each(|_| _ = envelope.next(480, 4_800, 0.6, 4_800));
        envelope.release();
        let before = (0..1_000)
            .map(|_| envelope.next(480, 4_800, 0.6, 4_800))
            .last()
            .unwrap();
        envelope.start();
        let after = envelope.next(480, 4_800, 0.6, 4_800);

        assert!(before > 0.0 && after > before && after - before < 1.5 / 480.0);
    }
}
