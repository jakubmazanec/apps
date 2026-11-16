/// Leaves a signal within ±0.5 as it is and bends a louder one towards ±1 along a tanh, so it
/// reaches exactly 1 for a very loud signal and never goes above it, and the slope stays
/// continuous at ±0.5.
pub fn soft_clip(x: f32) -> f32 {
    let size = libm::fabsf(x);
    if size <= 0.5 {
        x
    } else {
        libm::copysignf(0.5 + 0.5 * libm::tanhf((size - 0.5) / 0.5), x)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quiet_signals_pass_and_loud_ones_stay_below_one() {
        assert_eq!(soft_clip(0.3), 0.3);
        assert_eq!(soft_clip(-0.5), -0.5);
        assert!(soft_clip(3.0) < 1.0);
        // Past about 4.7 the sum rounds to 1.0 in an f32; it never goes above.
        assert!(soft_clip(100.0) <= 1.0);
        let steps = (-300..=300).map(|step| step as f32 / 100.0);
        assert!(steps.clone().all(|x| soft_clip(-x) == -soft_clip(x)));
        assert!(
            steps
                .clone()
                .zip(steps.skip(1))
                .all(|(a, b)| soft_clip(a) < soft_clip(b))
        );
    }
}
