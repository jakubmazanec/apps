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
pub mod font;
pub mod input;
pub mod label;
pub mod message;
pub mod palette;
pub mod param;
pub mod project;
pub mod queue;
pub mod ring;
pub mod screen;
pub mod tone;
pub mod ui;
