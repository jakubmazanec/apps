use crate::runner::Runner;
use groovebox_core::audio::MAX_BATCH;
use groovebox_core::input::{Input, Stamped};
use groovebox_core::screen::{HEIGHT, WIDTH};
use std::path::Path;
use wasmtime::{
    Config, Engine, Instance, Module, SharedMemory, Store, Val, WasmParams, WasmResults,
};

/// A `.wasm` file of the browser crate, instantiated as the page does it: a control instance,
/// then an audio instance with its own stack, on one shared memory. Every call happens on this
/// thread, one at a time.
pub struct WasmRunner {
    store: Store<()>,
    memory: SharedMemory,
    control: Instance,
    audio: Instance,
}

impl WasmRunner {
    pub fn new(path: &Path) -> Self {
        let mut config = Config::new();
        config.wasm_threads(true).shared_memory(true);
        let engine = Engine::new(&config).expect("the engine takes shared memories");
        let module = Module::from_file(&engine, path)
            .unwrap_or_else(|error| panic!("{}: {error:?}", path.display()));
        let memory = SharedMemory::new(
            &engine,
            module
                .imports()
                .find_map(|import| import.ty().memory().cloned())
                .expect("the module imports its memory"),
        )
        .expect("the memory is shared");
        let mut store = Store::new(&engine, ());
        let mut instantiate = || {
            Instance::new(&mut store, &module, &[memory.clone().into()])
                .expect("the module instantiates")
        };
        let (control, audio) = (instantiate(), instantiate());
        let mut runner = Self {
            store,
            memory,
            control,
            audio,
        };
        let top: i32 = runner.call(control, "audio_stack_top", ());
        audio
            .get_global(&mut runner.store, "__stack_pointer")
            .expect("the module exports its stack pointer")
            .set(&mut runner.store, Val::I32(top))
            .expect("the stack pointer is a mutable i32");
        runner
    }

    /// The module's own fingerprint of everything it rendered.
    pub fn audio_fingerprint(&mut self) -> u64 {
        self.call(self.control, "audio_fingerprint", ())
    }

    fn call<Params: WasmParams, Results: WasmResults>(
        &mut self,
        instance: Instance,
        name: &str,
        params: Params,
    ) -> Results {
        instance
            .get_typed_func::<Params, Results>(&mut self.store, name)
            .and_then(|function| function.call(&mut self.store, params))
            .unwrap_or_else(|error| panic!("{name}: {error:?}"))
    }

    /// Copies `bytes.len()` bytes from the memory at `address`.
    fn read(&self, address: u32, bytes: &mut [u8]) {
        let cells = &self.memory.data()[address as usize..][..bytes.len()];
        for (byte, cell) in bytes.iter_mut().zip(cells) {
            // SAFETY: only the instances write the memory, and only during a call, which runs on
            // this thread and has returned.
            *byte = unsafe { *cell.get() };
        }
    }
}

impl Runner for WasmRunner {
    fn queue_input(&mut self, input: Stamped) -> bool {
        let (kind, a, b): (u32, u8, u32) = match input.input {
            Input::PadHit { pad, velocity } => (0, pad, velocity.into()),
            Input::PadRelease { pad } => (1, pad, 0),
            Input::PadPressure { pad, pressure } => (2, pad, pressure.into()),
            Input::ButtonPress { button } => (3, button.code(), 0),
            Input::ButtonRelease { button } => (4, button.code(), 0),
            Input::EncoderTurn { encoder, clicks } => (5, encoder, i32::from(clicks) as u32),
            Input::NoteOn { note, velocity } => (6, note, velocity.into()),
            Input::NoteOff { note } => (7, note, 0),
            Input::NotePressure { note, pressure } => (8, note, pressure.into()),
            Input::ChannelPressure { pressure } => (9, pressure, 0),
        };
        match self.call::<_, u32>(
            self.control,
            "control_queue_input",
            (input.sample, kind, u32::from(a), b),
        ) {
            1 => true,
            0 => false,
            dropped => panic!("the build dropped {input:?}: it returned {dropped}"),
        }
    }

    fn replay_applied(&mut self, number: u32, sample: u64) -> bool {
        self.call::<_, u32>(self.control, "control_replay_applied", (number, sample)) == 1
    }

    fn step(&mut self, until: u64) {
        // The step stashes the applied reports for the page's session log; a replay ignores them.
        self.call::<_, u32>(self.control, "control_step", until);
    }

    fn render(&mut self, left: &mut [f32], right: &mut [f32]) {
        let address: u32 = self.call(self.audio, "audio_render", left.len() as u32);
        for (channel, address) in [(left, address), (right, address + (MAX_BATCH * 4) as u32)] {
            let mut bytes = vec![0; channel.len() * 4];
            self.read(address, &mut bytes);
            for (sample, chunk) in channel.iter_mut().zip(bytes.as_chunks::<4>().0) {
                *sample = f32::from_le_bytes(*chunk);
            }
        }
    }

    fn front_screen(&mut self) -> Vec<u8> {
        let front_pointer: u32 = self.call(self.control, "front_pointer", ());
        let mut front = [0; 4];
        self.read(front_pointer, &mut front);
        let screen: u32 = self.call(self.control, "screen_pointer", u32::from_le_bytes(front));
        let mut pixels = vec![0; WIDTH * HEIGHT];
        self.read(screen, &mut pixels);
        pixels
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fresh() -> WasmRunner {
        let package = Path::new(env!("CARGO_MANIFEST_DIR"))
            .ancestors()
            .nth(2)
            .expect("the crate lies two folders below the package");
        WasmRunner::new(&package.join("build/groovebox-core.wasm"))
    }

    fn queue(runner: &mut WasmRunner, kind: u32, a: u32, b: u32) -> u32 {
        runner.call(runner.control, "control_queue_input", (0_u64, kind, a, b))
    }

    /// Queues pad releases until the queue is full and returns how many it took.
    fn fill(runner: &mut WasmRunner) -> usize {
        (0..).take_while(|_| queue(runner, 1, 0, 0) == 1).count()
    }

    #[test]
    fn the_export_takes_the_edges_of_every_range() {
        let mut runner = fresh();

        for (kind, a, b) in [
            (0, 0, 1),
            (0, 11, 127),
            (1, 11, 0),
            (2, 0, 0),
            (2, 11, 127),
            (3, 0, 0),
            (3, 21, 0),
            (3, 51, 0),
            (4, 32, 0),
            (4, 47, 0),
            (5, 0, 1),
            (5, 4, 127),
            (5, 4, -127_i32 as u32),
            (6, 0, 1),
            (6, 127, 127),
            (7, 127, 0),
            (8, 0, 0),
            (8, 127, 127),
            (9, 0, 0),
            (9, 127, 0),
        ] {
            assert_eq!(queue(&mut runner, kind, a, b), 1, "{kind} {a} {b}");
        }
    }

    #[test]
    fn the_export_returns_2_and_queues_nothing_for_what_it_does_not_know() {
        let mut runner = fresh();

        for (kind, a, b) in [
            (10, 0, 0),
            (u32::MAX, 0, 0),
            (0, 12, 100),
            (0, 256, 100),
            (0, 0, 0),
            (0, 0, 128),
            (1, 12, 0),
            (1, 256, 0),
            (2, 12, 0),
            (2, 0, 128),
            (3, 22, 0),
            (3, 31, 0),
            (3, 52, 0),
            (3, 256, 0),
            (4, 52, 0),
            (5, 5, 1),
            (5, 0, 0),
            (5, 0, 128),
            (5, 0, -128_i32 as u32),
            (5, 0, 1 << 31),
            (6, 128, 1),
            (6, 0, 0),
            (6, 0, 128),
            (6, 0, 256),
            (7, 128, 0),
            (8, 128, 0),
            (8, 0, 128),
            (9, 128, 0),
        ] {
            assert_eq!(queue(&mut runner, kind, a, b), 2, "{kind} {a} {b}");
        }

        assert_eq!(fill(&mut runner), fill(&mut fresh()));
    }
}
