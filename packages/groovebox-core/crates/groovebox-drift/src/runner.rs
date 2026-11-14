use groovebox_core::input::Stamped;

/// One build of the core, driven as the browser drives it: both sides on one thread, one call at a
/// time.
pub trait Runner {
    /// Returns false when the input queue is full.
    fn queue_input(&mut self, input: Stamped) -> bool;

    /// Returns false when the replay queue is full.
    fn replay_applied(&mut self, number: u32, sample: u64) -> bool;

    fn step(&mut self, until: u64);

    /// The (number, sample) of the reports that the last step took from the audio part, in order.
    /// It gives them once: a second call before the next step gives none.
    fn take_applied(&mut self) -> Vec<(u32, u64)>;

    /// The lights word as the last step stored it, read through `lights_pointer`.
    fn lights(&mut self) -> u64;

    /// Renders `left.len()` samples, a multiple of 32 and at most 128.
    fn render(&mut self, left: &mut [f32], right: &mut [f32]);

    /// The pixels of the front screen in row order.
    fn front_screen(&mut self) -> Vec<u8>;
}
