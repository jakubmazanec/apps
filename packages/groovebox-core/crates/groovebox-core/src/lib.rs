#![no_std]
#![deny(unsafe_code)]

#[cfg(any(test, feature = "loom"))]
extern crate std;

pub mod audio;
pub mod budget {
    include!(concat!(env!("OUT_DIR"), "/budget.rs"));
}
pub mod control;
#[cfg(not(feature = "loom"))]
pub mod device;
pub mod fingerprint;
pub mod input;
pub mod message;
pub mod palette;
pub mod queue;
pub mod ring;
pub mod screen;
pub mod tone;
