//! The building blocks of sound: pure, sample-by-sample maths that knows nothing of parameters.

pub mod clip;
pub mod envelope;
pub mod filter;
pub mod line;
pub mod osc;

/// Sets a value below 1e-20 in magnitude to exactly 0. Every write to a feedback path goes
/// through it, so a fading state ends at 0 instead of lingering in the slow range of tiny floats.
pub fn flush(x: f32) -> f32 {
    if libm::fabsf(x) < 1e-20 { 0.0 } else { x }
}
