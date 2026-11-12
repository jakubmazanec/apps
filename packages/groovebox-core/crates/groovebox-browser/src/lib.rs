//! The core for the browser: the statics of the device and plain exported functions, in one
//! module that the page instantiates twice on one shared memory. The worker calls every export
//! except `audio_render`; the AudioWorklet sets `__stack_pointer` to `audio_stack_top()` and calls
//! only `audio_render` and `wake_pointer`, which just returns the address of a static.
// The wasm builds are `no_std`. Host builds, which only `clippy` makes, use `std` and its panic
// handler.
#![cfg_attr(target_arch = "wasm32", no_std)]

use core::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use groovebox_core::audio::MAX_BATCH;
use groovebox_core::device::{ControlSide, Device};
use groovebox_core::fingerprint::Fingerprint;
use groovebox_core::input::{Input, Stamped};
use groovebox_core::message::{REPORT_QUEUE, Report};
use groovebox_core::palette;

#[cfg(target_arch = "wasm32")]
#[panic_handler]
fn panic(_: &core::panic::PanicInfo) -> ! {
    core::arch::wasm32::unreachable()
}

const AUDIO_STACK_SIZE: usize = 65_536;

#[repr(align(16))]
struct Stack {
    _bytes: [u8; AUDIO_STACK_SIZE],
}

static DEVICE: Device = Device::new();
/// The sample at which the next `audio_render` starts. Only the audio side stores it.
static POSITION: AtomicU64 = AtomicU64::new(0);
/// Counts the batches rendered. Only the page uses it: the AudioWorklet adds to it and wakes the
/// worker, which waits on it.
static WAKE: AtomicU32 = AtomicU32::new(0);
/// The fingerprint of everything rendered so far. Only the audio side stores it.
static FINGERPRINT: AtomicU64 = AtomicU64::new(Fingerprint::new().0);
static PALETTE: [[u8; 3]; 256] = palette::PALETTE;

// The statics below are each touched by one side only. They are `static mut` so that nothing
// shares a reference to them; the SAFETY comments at every use say why that holds.

/// The left channel, then the right one. Only the audio side touches it.
static mut OUTPUT: [[f32; MAX_BATCH]; 2] = [[0.0; MAX_BATCH]; 2];
/// The (number, sample) of the reports that the latest `control_step` took. Only the control side
/// touches it.
static mut APPLIED: [(u32, u64); REPORT_QUEUE] = [(0, 0); REPORT_QUEUE];
/// The stack of the audio instance. Only that instance's code uses it, through its stack pointer.
static mut AUDIO_STACK: Stack = Stack {
    _bytes: [0; AUDIO_STACK_SIZE],
};

fn control_side() -> ControlSide<'static> {
    // SAFETY: only the worker calls the exports that use this, one at a time, and each of them
    // drops its side before it returns, so at most one control side exists.
    unsafe { DEVICE.control_side() }
}

/// Queues an input stamped with `sample`. `kind` is 0 for a hit and 1 for a release, `pad` is
/// below `PADS` and `velocity` is 1 to 127 for a hit. Like the core, this checks none of them; the
/// page only sends valid ones. Returns 1 when queued and 0 when the queue is full.
#[unsafe(no_mangle)]
pub extern "C" fn control_queue_input(sample: u64, kind: u32, pad: u32, velocity: u32) -> u32 {
    let (pad, velocity) = (pad as u8, velocity as u8);
    let input = match kind {
        0 => Input::PadHit { pad, velocity },
        _ => Input::PadRelease { pad },
    };
    u32::from(
        control_side()
            .queue_input(Stamped { sample, input })
            .is_ok(),
    )
}

/// Returns 1 when queued and 0 when the queue is full.
#[unsafe(no_mangle)]
pub extern "C" fn control_replay_applied(number: u32, sample: u64) -> u32 {
    u32::from(control_side().replay_applied(number, sample).is_ok())
}

/// Steps the control part, then moves the reports into the stash that `control_applied_number` and
/// `control_applied_sample` read, replacing the previous ones. Returns how many it moved, at most
/// `REPORT_QUEUE`; a report that does not fit stays queued for the next step.
#[unsafe(no_mangle)]
pub extern "C" fn control_step(until: u64) -> u32 {
    let mut control = control_side();
    control.step(until);
    let mut count = 0;
    while count < REPORT_QUEUE
        && let Some(Report::Applied { number, sample }) = control.take_report()
    {
        // SAFETY: only the worker touches the stash, and it does so one call at a time.
        unsafe { APPLIED[count] = (number, sample) };
        count += 1;
    }
    count as u32
}

/// The number of the report at `index` in the stash, which must be below `REPORT_QUEUE`.
#[unsafe(no_mangle)]
pub extern "C" fn control_applied_number(index: u32) -> u32 {
    // SAFETY: only the worker touches the stash, and it does so one call at a time.
    unsafe { APPLIED[index as usize].0 }
}

/// The sample of the report at `index` in the stash, which must be below `REPORT_QUEUE`.
#[unsafe(no_mangle)]
pub extern "C" fn control_applied_sample(index: u32) -> u64 {
    // SAFETY: only the worker touches the stash, and it does so one call at a time.
    unsafe { APPLIED[index as usize].1 }
}

/// The first pixel of screen `index`, 0 or 1.
#[unsafe(no_mangle)]
pub extern "C" fn screen_pointer(index: u32) -> u32 {
    DEVICE.screen_pointer(index as usize) as u32
}

/// The address of the `u32` that holds the index of the screen to show.
#[unsafe(no_mangle)]
pub extern "C" fn front_pointer() -> u32 {
    DEVICE.front_pointer() as u32
}

/// The address of the 256 colours as red, green and blue bytes.
#[unsafe(no_mangle)]
pub extern "C" fn palette_pointer() -> u32 {
    (&raw const PALETTE) as u32
}

/// The address of the `u64` that holds the sample at which the next `audio_render` starts.
#[unsafe(no_mangle)]
pub extern "C" fn position_pointer() -> u32 {
    (&raw const POSITION) as u32
}

/// The address of the `u32` that counts the batches rendered.
#[unsafe(no_mangle)]
pub extern "C" fn wake_pointer() -> u32 {
    (&raw const WAKE) as u32
}

/// One past the last byte of the audio stack, where the audio instance's stack starts.
#[unsafe(no_mangle)]
pub extern "C" fn audio_stack_top() -> u32 {
    (&raw const AUDIO_STACK).wrapping_add(1) as u32
}

#[unsafe(no_mangle)]
pub extern "C" fn audio_position() -> u64 {
    POSITION.load(Ordering::Acquire)
}

#[unsafe(no_mangle)]
pub extern "C" fn audio_fingerprint() -> u64 {
    FINGERPRINT.load(Ordering::Relaxed)
}

/// Renders `frames` samples, which must be a multiple of 32 and at most `MAX_BATCH`, and adds them
/// to the fingerprint. Returns the address of the left channel; the right one follows at
/// `MAX_BATCH * 4` bytes after it.
#[unsafe(no_mangle)]
pub extern "C" fn audio_render(frames: u32) -> u32 {
    // SAFETY: only the AudioWorklet calls this, one call at a time, so at most one audio side
    // exists; and only this call touches the output, which the worklet reads after it returns.
    let (mut audio, [left, right]) =
        unsafe { (DEVICE.audio_side(), (&raw mut OUTPUT).as_mut_unchecked()) };
    let (left, right) = (&mut left[..frames as usize], &mut right[..frames as usize]);
    audio.render(left, right);
    // Only this side stores the fingerprint, so a relaxed load sees its last store.
    let mut fingerprint = Fingerprint(FINGERPRINT.load(Ordering::Relaxed));
    for (left, right) in left.iter().zip(right.iter()) {
        fingerprint.f32(*left);
        fingerprint.f32(*right);
    }
    FINGERPRINT.store(fingerprint.value(), Ordering::Relaxed);
    // The release publishes the fingerprint with the position to a reader that loads the position.
    POSITION.store(audio.position(), Ordering::Release);
    left.as_ptr() as u32
}
