use groovebox_core::input::Stamped;
use groovebox_core::memory_storage::MemoryStorage;
use groovebox_core::storage::{Reply, Request};

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

    /// The (number, request) of the storage request that the steps sent, once.
    fn take_request(&mut self) -> Option<(u32, Request)>;

    /// Returns false when the reply queue is full.
    fn queue_reply(&mut self, sample: u64, reply: Reply) -> bool;

    /// Carries out `request` on `storage` between steps, with the runner's I/O buffer and sample
    /// RAM. The reply's number is 0, for the caller to set.
    fn carry_out(&mut self, storage: &mut MemoryStorage, request: &Request) -> Reply;

    /// The lights as the last step stored them, read through `lights_pointer`: the low word, then
    /// the high word.
    fn lights(&mut self) -> u64;

    /// Renders `left.len()` samples, a multiple of 32 and at most 128.
    fn render(&mut self, left: &mut [f32], right: &mut [f32]);

    /// The pixels of the front screen in row order.
    fn front_screen(&mut self) -> Vec<u8>;
}
