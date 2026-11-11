//! The drift harness: it plays scenes on the core natively and in the built `.wasm` files, so
//! that the tests can prove every build gives the same audio and frames.

pub mod image;
pub mod native;
pub mod play;
pub mod runner;
pub mod scene;
pub mod wasm;
