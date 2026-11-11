use groovebox_core::budget::WORKING_MEMORY;

/// The 256 KiB worker stack, the 64 KiB audio stack and this crate's own statics.
const OTHER_MEMORY: usize = 524_288;
const PAGE: usize = 65_536;

fn main() {
    // The link fails when the statics and stacks do not fit in this memory.
    let memory = (WORKING_MEMORY + OTHER_MEMORY).next_multiple_of(PAGE);
    println!("cargo:rustc-link-arg-cdylib=--initial-memory={memory}");
    println!("cargo:rustc-link-arg-cdylib=--max-memory={memory}");
}
