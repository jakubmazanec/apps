use crate::runner::Runner;
use crate::scene::SceneLine;
use groovebox_core::audio::{CHUNK, MAX_BATCH};
use groovebox_core::fingerprint::Fingerprint;
use groovebox_core::input::Stamped;
use groovebox_core::memory_storage::MemoryStorage;
use groovebox_core::storage::Reply;
use std::iter::Peekable;
use std::vec;

#[derive(Debug, PartialEq, Eq)]
pub struct Outcome {
    /// The fingerprint of all the audio.
    pub audio: u64,
    /// Each captured frame as (sample, fingerprint, pixels), in the order of the steps.
    pub frames: Vec<(u64, u64, Vec<u8>)>,
    /// The lights after the step of each captured frame as (sample, lights), in the same order.
    pub lights: Vec<(u64, u64)>,
    /// The (number, sample) of every report the steps took, in order.
    pub applied: Vec<(u32, u64)>,
    /// The fingerprint of every file of the storage at the end, in path order: the lengths of its
    /// path and of its bytes, each as 8 little-endian bytes, then its path and its bytes.
    pub storage: u64,
    /// False when a sample is not a number or infinite.
    pub finite: bool,
}

struct Player<'a> {
    runner: &'a mut dyn Runner,
    storage: MemoryStorage,
    /// The (sample, reply) of the `reply` lines. Without any, each of the storage's own replies is
    /// stamped with the end of the step after which its request went out.
    replies: Vec<(u64, Reply)>,
    /// The files dropped so far.
    dropped: u32,
    position: u64,
    audio: Fingerprint,
    finite: bool,
    /// The `applied` records not yet given to the runner, in number order.
    applied: Peekable<vec::IntoIter<(u32, u64)>>,
    /// The samples of the frames not yet captured.
    wanted: Vec<u64>,
    frames: Vec<(u64, u64, Vec<u8>)>,
    lights: Vec<(u64, u64)>,
    /// The reports the steps took so far.
    reports: Vec<(u32, u64)>,
}

impl Player<'_> {
    fn queue(&mut self, input: Stamped) {
        assert!(
            self.runner.queue_input(input),
            "the input queue refused {input:?}: the scene queues too many inputs before a step"
        );
    }

    /// Writes a dropped file into the next numbered folder of `tmp/`.
    fn drop_file(&mut self, path: &str, bytes: &[u8]) {
        self.dropped += 1;
        self.storage
            .put(&format!("tmp/{}/{path}", self.dropped), bytes.to_vec());
    }

    fn render_to(&mut self, sample: u64) {
        assert!(
            sample.is_multiple_of(CHUNK as u64),
            "{sample} is not on a multiple of {CHUNK}: every step and the end must be"
        );
        assert!(
            sample >= self.position,
            "{sample} is before the audio position {}: steps and the end must not go back",
            self.position
        );
        let (mut left, mut right) = ([0.0; MAX_BATCH], [0.0; MAX_BATCH]);
        while self.position < sample {
            let frames = (sample - self.position).min(MAX_BATCH as u64) as usize;
            let (left, right) = (&mut left[..frames], &mut right[..frames]);
            self.runner.render(left, right);
            for (left, right) in left.iter().zip(right.iter()) {
                self.finite &= left.is_finite() && right.is_finite();
                self.audio.f32(*left);
                self.audio.f32(*right);
            }
            self.position += frames as u64;
        }
    }

    fn step(&mut self, until: u64) {
        self.render_to(until);
        while self
            .applied
            .next_if(|&(number, sample)| self.runner.replay_applied(number, sample))
            .is_some()
        {}
        self.runner.step(until);
        self.reports.extend(self.runner.take_applied());
        if let Some((number, request)) = self.runner.take_request() {
            let reply = Reply {
                number,
                ..self.runner.carry_out(&mut self.storage, &request)
            };
            let stamped = if self.replies.is_empty() {
                Some((until, reply))
            } else {
                self.replies
                    .iter()
                    .copied()
                    .find(|(_, recorded)| recorded.number == number)
            };
            if let Some((sample, reply)) = stamped {
                assert!(
                    self.runner.queue_reply(sample, reply),
                    "the reply queue refused {reply:?}"
                );
            }
        }
        if let Some(index) = self.wanted.iter().position(|&sample| sample == until) {
            self.wanted.swap_remove(index);
            let pixels = self.runner.front_screen();
            let mut fingerprint = Fingerprint::new();
            fingerprint.bytes(&pixels);
            self.frames.push((until, fingerprint.value(), pixels));
            self.lights.push((until, self.runner.lights()));
        }
    }
}

/// Plays a parsed scene on a fresh runner, with a storage that holds the scene's files. A scene
/// with `step` lines replays its lines in order; one without steps steps after every batch of
/// `MAX_BATCH` samples and writes each dropped file and queues each input just before the first
/// step after it. After every step it carries out the request that went out.
///
/// Panics when the scene cannot be played as written: a step or the end off the 32-sample schedule
/// or before the audio position; more inputs before a step than the input queue holds.
pub fn play(scene: &[SceneLine], runner: &mut dyn Runner) -> Outcome {
    let mut applied: Vec<(u32, u64)> = scene
        .iter()
        .filter_map(|line| match *line {
            SceneLine::Applied { number, sample } => Some((number, sample)),
            _ => None,
        })
        .collect();
    applied.sort_unstable();
    let mut storage = MemoryStorage::new(
        scene
            .iter()
            .find_map(|line| match *line {
                SceneLine::Storage(bytes) => Some(bytes),
                _ => None,
            })
            .unwrap_or(1_000_000_000),
    );
    for line in scene {
        if let SceneLine::File { path, bytes } = line {
            storage.put(path, bytes.clone());
        }
    }
    let mut player = Player {
        runner,
        storage,
        replies: scene
            .iter()
            .filter_map(|line| match *line {
                SceneLine::Reply { sample, reply } => Some((sample, reply)),
                _ => None,
            })
            .collect(),
        dropped: 0,
        position: 0,
        audio: Fingerprint::new(),
        finite: true,
        applied: applied.into_iter().peekable(),
        wanted: scene
            .iter()
            .filter_map(|line| match *line {
                SceneLine::Frame(sample) => Some(sample),
                _ => None,
            })
            .collect(),
        frames: Vec::new(),
        lights: Vec::new(),
        reports: Vec::new(),
    };
    if scene.iter().any(|line| matches!(line, SceneLine::Step(_))) {
        for line in scene {
            match *line {
                SceneLine::Input(input) => player.queue(input),
                SceneLine::Drop {
                    ref path,
                    ref bytes,
                    ..
                } => player.drop_file(path, bytes),
                SceneLine::Step(until) => player.step(until),
                SceneLine::End(end) => player.render_to(end),
                _ => {}
            }
        }
    } else {
        let end = scene
            .iter()
            .find_map(|line| match *line {
                SceneLine::End(end) => Some(end),
                _ => None,
            })
            .expect("a scene has an end");
        let mut inputs: Vec<Stamped> = scene
            .iter()
            .filter_map(|line| match *line {
                SceneLine::Input(input) => Some(input),
                _ => None,
            })
            .collect();
        inputs.sort_by_key(|input| input.sample);
        let mut inputs = inputs.into_iter().peekable();
        let mut drops: Vec<(u64, &str, &[u8])> = scene
            .iter()
            .filter_map(|line| match *line {
                SceneLine::Drop {
                    sample,
                    ref path,
                    ref bytes,
                } => Some((sample, path.as_str(), bytes.as_slice())),
                _ => None,
            })
            .collect();
        drops.sort_by_key(|&(sample, ..)| sample);
        let mut drops = drops.into_iter().peekable();
        while player.position < end {
            let until = (player.position + MAX_BATCH as u64).min(end);
            while let Some((_, path, bytes)) = drops.next_if(|&(sample, ..)| sample < until) {
                player.drop_file(path, bytes);
            }
            while let Some(input) = inputs.next_if(|input| input.sample < until) {
                player.queue(input);
            }
            player.step(until);
        }
    }
    let mut storage = Fingerprint::new();
    for (path, bytes) in player.storage.files() {
        storage.bytes(&(path.len() as u64).to_le_bytes());
        storage.bytes(&(bytes.len() as u64).to_le_bytes());
        storage.bytes(path.as_bytes());
        storage.bytes(bytes);
    }
    Outcome {
        audio: player.audio.value(),
        frames: player.frames,
        lights: player.lights,
        applied: player.reports,
        storage: storage.value(),
        finite: player.finite,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::native::NativeRunner;
    use crate::scene::parse;
    use crate::wasm::fresh;
    use groovebox_core::lights::Lights;
    use groovebox_core::storage::{Path, Request};
    use std::collections::HashSet;
    use std::mem::discriminant;

    fn play_text(text: &str) -> Outcome {
        play(&parse(text).unwrap(), &mut NativeRunner::default())
    }

    /// A runner that keeps every request it gives, in order.
    struct Recording<R> {
        runner: R,
        requests: Vec<(u32, Request)>,
    }

    impl<R> Recording<R> {
        fn new(runner: R) -> Self {
            Self {
                runner,
                requests: Vec::new(),
            }
        }

        /// The files of the requests that `file` picks, each run of the same file once.
        fn files(&self, file: impl Fn(&Request) -> Option<Path>) -> Vec<String> {
            let mut files: Vec<String> = self
                .requests
                .iter()
                .filter_map(|(_, request)| Some(file(request)?.as_str().to_string()))
                .collect();
            files.dedup();
            files
        }
    }

    impl<R: Runner> Runner for Recording<R> {
        fn queue_input(&mut self, input: Stamped) -> bool {
            self.runner.queue_input(input)
        }

        fn replay_applied(&mut self, number: u32, sample: u64) -> bool {
            self.runner.replay_applied(number, sample)
        }

        fn step(&mut self, until: u64) {
            self.runner.step(until);
        }

        fn take_applied(&mut self) -> Vec<(u32, u64)> {
            self.runner.take_applied()
        }

        fn take_request(&mut self) -> Option<(u32, Request)> {
            let request = self.runner.take_request();
            self.requests.extend(request);
            request
        }

        fn queue_reply(&mut self, sample: u64, reply: Reply) -> bool {
            self.runner.queue_reply(sample, reply)
        }

        fn carry_out(&mut self, storage: &mut MemoryStorage, request: &Request) -> Reply {
            self.runner.carry_out(storage, request)
        }

        fn lights(&mut self) -> u64 {
            self.runner.lights()
        }

        fn render(&mut self, left: &mut [f32], right: &mut [f32]) {
            self.runner.render(left, right);
        }

        fn front_screen(&mut self) -> Vec<u8> {
            self.runner.front_screen()
        }
    }

    fn loaded(request: &Request) -> Option<Path> {
        match *request {
            Request::Load { file, .. } => Some(file),
            _ => None,
        }
    }

    fn read(request: &Request) -> Option<Path> {
        match *request {
            Request::Read { file, .. } => Some(file),
            _ => None,
        }
    }

    /// The start of a scene that makes Syn 1 on pad 1 through the panel once the start-up on an
    /// empty storage has opened the project: MENU + step 3, then OK, down twice and OK in the sound
    /// picker.
    const SYN_1: &str = "groovebox-scene 1\ninput 1024 press menu\ninput 1032 press step-3\n\
        input 1040 release step-3\ninput 1048 release menu\ninput 1056 press ok\n\
        input 1064 release ok\ninput 1072 press down\ninput 1080 release down\n\
        input 1082 press down\ninput 1084 release down\ninput 1088 press ok\n\
        input 1096 release ok\n";

    /// The steps of the start-up on an empty storage: it empties `tmp/` and lists `samples/`.
    const START_UP: &str = "step 128\nstep 256\n";

    #[test]
    fn applied_records_steer_late_messages() {
        let a = play_text(&format!(
            "{SYN_1}input 1124 pad-hit 0 127\n{START_UP}step 1152\nstep 2048\nstep 3072\n\
            end 3072"
        ));
        let b = play_text(&format!(
            "{SYN_1}input 1124 pad-hit 0 127\n{START_UP}step 1152\nstep 2048\napplied 1 2048\n\
            step 3072\nend 3072"
        ));
        let c = play_text(&format!(
            "{SYN_1}{START_UP}step 1152\ninput 1124 pad-hit 0 127\nstep 2048\nstep 3072\n\
            end 3072"
        ));

        // Message 0 is New synth's, message 1 the hit's.
        assert_eq!(a.applied, [(0, 1152), (1, 1152)]);
        assert_eq!(b.applied, [(0, 1152), (1, 2048)]);
        assert_eq!(c.applied, b.applied);
    }

    #[test]
    fn an_input_logged_after_a_step_waits_for_the_next() {
        let outcome = play_text(&format!(
            "groovebox-scene 1\n{START_UP}step 1152\nframe 1152\ninput 1124 pad-hit 5 127\n\
            step 1664\nframe 1664\nend 2048"
        ));

        let track = 1 << Lights::TRACK;
        assert_eq!(
            outcome.lights,
            [
                (1152, 1 << Lights::PAD | track),
                (1664, 1 << (Lights::PAD + 5) | track)
            ]
        );
    }

    #[test]
    fn the_lights_are_taken_after_the_step_of_each_frame() {
        let outcome = play_text(
            "groovebox-scene 1\ninput 1124 press t2\nframe 1152\ninput 1224 press t3\n\
            frame 1408\nend 1536",
        );

        let pad = 1 << Lights::PAD;
        assert_eq!(
            outcome.lights,
            [
                (1152, pad | 1 << (Lights::TRACK + 1)),
                (1408, pad | 1 << (Lights::TRACK + 2))
            ]
        );
    }

    #[test]
    fn a_scene_with_files_loads_them_at_start_up() {
        // A step for each request: emptying `tmp/`, the listing, then each file's head and audio.
        let steps = "step 128\nframe 128\nstep 256\nstep 384\nstep 512\nstep 640\nstep 768\n\
            frame 768\nstep 896\nframe 896\nend 896";
        let mut runner = Recording::new(NativeRunner::default());

        let files = play(
            &parse(&format!(
                "groovebox-scene 1\nfile samples/b.wav ours 440 0.1 2\n\
                file samples/a/c.wav ours 220 0.2 1\n{steps}"
            ))
            .unwrap(),
            &mut runner,
        );
        let empty = play_text(&format!("groovebox-scene 1\n{steps}"));

        // In SAMPLES' order, folders first.
        assert_eq!(runner.files(loaded), ["samples/a/c.wav", "samples/b.wav"]);
        // "Loading library" until the last load's reply, then the project as without files.
        assert_eq!(files.frames[1].1, files.frames[0].1);
        assert_ne!(files.frames[2].1, files.frames[1].1);
        assert_eq!(files.frames[2].1, empty.frames[2].1);
    }

    #[test]
    fn start_up_loads_an_ours_file_and_not_a_plain_sine() {
        let mut runner = Recording::new(NativeRunner::default());

        play(
            &parse(
                "groovebox-scene 1\nfile samples/ours.wav ours 440 0.1 1\n\
                file samples/plain.wav sine 440 0.1 48000 16 1\nend 2048",
            )
            .unwrap(),
            &mut runner,
        );

        assert_eq!(
            runner.files(read),
            ["samples/ours.wav", "samples/plain.wav"]
        );
        assert_eq!(runner.files(loaded), ["samples/ours.wav"]);
    }

    #[test]
    fn a_file_whose_path_holds_a_space_loads() {
        let mut runner = Recording::new(NativeRunner::default());

        play(
            &parse("groovebox-scene 1\nfile samples/snare%20drum.wav ours 440 0.1 1\nend 2048")
                .unwrap(),
            &mut runner,
        );

        assert_eq!(runner.files(loaded), ["samples/snare drum.wav"]);
    }

    #[test]
    fn the_storage_fingerprint_tells_paths_from_bytes() {
        // "ab" holding "c" and "a" holding "bc" spell the same bytes one after another.
        let ab = play_text("groovebox-scene 1\nfile ab base64 Yw==\nend 128");
        let a = play_text("groovebox-scene 1\nfile a base64 YmM=\nend 128");

        assert_ne!(ab.storage, a.storage);
    }

    #[test]
    fn drop_lines_put_files_in_tmp_and_the_input_imports_them() {
        let mut runner = Recording::new(NativeRunner::default());

        let dropped = play(
            &parse(
                "groovebox-scene 1\ndrop 1100 kick.wav sine 440 0.1 48000 16 1\n\
                drop 1100 drums/snare.wav sine 220 0.1 48000 16 2\ninput 1100 dropped 2\n\
                end 19200",
            )
            .unwrap(),
            &mut runner,
        );
        let stored = play_text(
            "groovebox-scene 1\nfile samples/kick.wav ours 440 0.1 1\n\
            file samples/drums/snare.wav ours 220 0.1 2\nend 19200",
        );

        assert_eq!(
            runner.files(read),
            ["tmp/1/kick.wav", "tmp/2/drums/snare.wav"]
        );
        // The import wrote both files and emptied `tmp/`.
        assert_eq!(dropped.storage, stored.storage);
        assert_ne!(
            dropped.storage,
            play_text("groovebox-scene 1\nend 128").storage
        );
    }

    #[test]
    fn recorded_replies_replay_at_their_samples() {
        let steps = "step 128\nframe 128\nstep 256\nstep 1152\nframe 1152\nstep 2432\n\
            frame 2432\nend 2432";
        // The listing's reply 2,048 samples after its step.
        let scene = parse(&format!(
            "groovebox-scene 1\nreply 0 128 missing\nreply 1 2304 missing\n{steps}"
        ))
        .unwrap();

        let late = play(&scene, &mut NativeRunner::default());
        let served = play_text(&format!("groovebox-scene 1\n{steps}"));

        // Still "Loading library" at 1152, where the storage's own replies opened the project.
        assert_eq!(late.frames[1].1, late.frames[0].1);
        assert_ne!(served.frames[1].1, served.frames[0].1);
        assert_eq!(late.frames[2].1, served.frames[1].1);
        assert_eq!(play(&scene, &mut fresh()), late);
    }

    #[test]
    fn an_import_does_not_depend_on_the_batch_size() {
        let scene = parse(include_str!("../../../scenes/library-import.scene")).unwrap();
        // The scene's last frame, SAMPLES inside kit/ once both drops are imported, and its end.
        let (settled, end) = (30_464, 32_000);
        // The scene's drops and inputs with a step every `spacing` samples and one at `settled`,
        // so that every reply comes at another sample than in the scene's batches of 128.
        let stepped = |spacing: u64| {
            let mut steps: Vec<u64> = (1..)
                .map(|n| n * spacing)
                .take_while(|&step| step < end)
                .chain([settled])
                .collect();
            steps.sort_unstable();
            steps.dedup();
            let mut events = scene
                .iter()
                .filter_map(|line| match *line {
                    SceneLine::Input(input) => Some((input.sample, line)),
                    SceneLine::Drop { sample, .. } => Some((sample, line)),
                    _ => None,
                })
                .peekable();
            let mut lines = Vec::new();
            for until in steps {
                while let Some((_, line)) = events.next_if(|&(sample, _)| sample < until) {
                    lines.push(line.clone());
                }
                lines.push(SceneLine::Step(until));
            }
            lines.extend([SceneLine::Frame(settled), SceneLine::End(end)]);
            lines
        };
        let last_frame = |outcome: &Outcome| {
            outcome
                .frames
                .last()
                .map(|&(sample, fingerprint, _)| (sample, fingerprint))
        };

        let batches = play(&scene, &mut NativeRunner::default());

        assert_ne!(
            batches.storage,
            play_text("groovebox-scene 1\nend 128").storage
        );
        // With a step every 352 samples the second drop joins the first import, which still runs.
        for (schedule, outcome) in [
            (
                "native, a step every 96",
                play(&stepped(96), &mut NativeRunner::default()),
            ),
            (
                "native, a step every 352",
                play(&stepped(352), &mut NativeRunner::default()),
            ),
            ("wasm, a step every 352", play(&stepped(352), &mut fresh())),
        ] {
            assert_eq!(outcome.storage, batches.storage, "{schedule}");
            assert_eq!(last_frame(&outcome), last_frame(&batches), "{schedule}");
        }
    }

    #[test]
    fn the_wasm_build_gives_the_same_requests() {
        // A start-up that loads a file, then an import that reads, converts and writes one.
        let scene = parse(
            "groovebox-scene 1\nfile samples/a.wav ours 440 0.1 2\n\
            drop 1100 b.wav sine 440 0.1 44100 24 2\ninput 1100 dropped 1\nend 19200",
        )
        .unwrap();
        let mut native = Recording::new(NativeRunner::default());
        let mut wasm = Recording::new(fresh());

        assert_eq!(play(&scene, &mut wasm), play(&scene, &mut native));
        assert_eq!(wasm.requests, native.requests);
        let kinds: HashSet<_> = native
            .requests
            .iter()
            .map(|(_, request)| discriminant(request))
            .collect();
        assert_eq!(kinds.len(), 8, "{:?}", native.requests);
    }
}
