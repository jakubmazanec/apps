#![no_std]
#![deny(unsafe_code)]

#[cfg(any(test, feature = "loom", feature = "harness"))]
extern crate std;

pub mod audio;
pub mod blake3;
pub mod budget {
    include!(concat!(env!("OUT_DIR"), "/budget.rs"));
}
pub mod control;
#[cfg(not(feature = "loom"))]
pub mod device;
pub mod dsp;
pub mod effect_ram;
pub mod fingerprint;
pub mod font;
pub mod input;
pub mod label;
pub mod library;
pub mod lights;
#[cfg(any(test, feature = "harness"))]
pub mod memory_storage;
pub mod message;
pub mod palette;
pub mod param;
pub mod project;
pub mod queue;
pub mod ring;
pub mod sample_ram;
pub mod screen;
pub mod sequencer;
pub mod storage;
pub mod store;
pub mod ui;
