use groovebox_core::input::Stamped;

/// One build of the core, driven as the browser drives it: both sides on one thread, one call at a
/// time.
pub trait Runner {
    /// Returns false when the input queue is full.
    fn queue_input(&mut self, input: Stamped) -> bool;

    /// Returns false when the replay queue is full.
    fn replay_applied(&mut self, number: u32, sample: u64) -> bool;

    fn step(&mut self, until: u64);

    /// Renders `left.len()` samples, a multiple of 32 and at most 128.
    fn render(&mut self, left: &mut [f32], right: &mut [f32]);

    /// The pixels of the front screen in row order.
    fn front_screen(&mut self) -> Vec<u8>;
}
