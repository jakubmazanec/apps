use crate::runner::Runner;
use crate::scene::SceneLine;
use groovebox_core::audio::{CHUNK, MAX_BATCH};
use groovebox_core::fingerprint::Fingerprint;
use groovebox_core::input::Stamped;
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
    /// False when a sample is not a number or infinite.
    pub finite: bool,
}

struct Player<'a> {
    runner: &'a mut dyn Runner,
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

/// Plays a parsed scene on a fresh runner. A scene with `step` lines replays its lines in order;
/// one without steps steps after every batch of `MAX_BATCH` samples and queues each input just
/// before the first step after it.
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
    let mut player = Player {
        runner,
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
        while player.position < end {
            let until = (player.position + MAX_BATCH as u64).min(end);
            while let Some(input) = inputs.next_if(|input| input.sample < until) {
                player.queue(input);
            }
            player.step(until);
        }
    }
    Outcome {
        audio: player.audio.value(),
        frames: player.frames,
        lights: player.lights,
        applied: player.reports,
        finite: player.finite,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::native::NativeRunner;
    use crate::scene::parse;
    use groovebox_core::lights::Lights;

    fn play_text(text: &str) -> Outcome {
        play(&parse(text).unwrap(), &mut NativeRunner::default())
    }

    #[test]
    fn an_input_logged_after_a_step_waits_for_the_next() {
        let outcome = play_text(
            "groovebox-scene 1\nstep 128\nframe 128\ninput 100 pad-hit 5 127\nstep 640\n\
            frame 640\nend 1024",
        );

        let track = 1 << Lights::TRACK;
        assert_eq!(
            outcome.lights,
            [
                (128, 1 << Lights::PAD | track),
                (640, 1 << (Lights::PAD + 5) | track)
            ]
        );
    }

    #[test]
    fn the_lights_are_taken_after_the_step_of_each_frame() {
        let outcome = play_text(
            "groovebox-scene 1\ninput 100 press t2\nframe 128\ninput 200 press t3\nframe 384\n\
            end 512",
        );

        let pad = 1 << Lights::PAD;
        assert_eq!(
            outcome.lights,
            [
                (128, pad | 1 << (Lights::TRACK + 1)),
                (384, pad | 1 << (Lights::TRACK + 2))
            ]
        );
    }
}
