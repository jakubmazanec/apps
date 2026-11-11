use crate::input::{Input, PADS, Stamped};
use crate::message::{MESSAGE_QUEUE, Message, MessageKind};
use crate::palette::{ACCENT, BACKGROUND, LINE};
use crate::queue::Producer;
use crate::ring::Ring;
use crate::screen::{Canvas, HEIGHT, Rect, WIDTH};

pub const INPUT_QUEUE: usize = 64;
pub const REPLAY_QUEUE: usize = 64;

/// The held pads as (pad, velocity) in the order of their latest hits, the latest last. A pad
/// appears at most once.
#[derive(Clone, Copy, PartialEq, Eq)]
struct Held {
    /// The slots from `len` on stay zero, so that two equal states compare equal.
    hits: [(u8, u8); PADS as usize],
    len: usize,
}

impl Held {
    const fn new() -> Self {
        Self {
            hits: [(0, 0); PADS as usize],
            len: 0,
        }
    }

    fn hits(&self) -> &[(u8, u8)] {
        &self.hits[..self.len]
    }

    /// The pad that sounds: the one hit last.
    fn latest(&self) -> Option<(u8, u8)> {
        self.hits().last().copied()
    }

    fn hit(&mut self, pad: u8, velocity: u8) {
        self.release(pad);
        self.hits[self.len] = (pad, velocity);
        self.len += 1;
    }

    fn release(&mut self, pad: u8) {
        if let Some(index) = self.hits().iter().position(|&(held, _)| held == pad) {
            self.hits.copy_within(index + 1..self.len, index);
            self.len -= 1;
            self.hits[self.len] = (0, 0);
        }
    }
}

/// The control part: it turns stamped pad inputs into numbered messages for the audio part,
/// keeps the held pads and draws them.
///
/// Nothing checks the inputs. They carry a pad below `PADS` and a velocity from 1 to 127, and they
/// are queued in sample order, so for live play and for a complete replay log, the messages leave
/// in nondecreasing `at` order.
pub struct Control {
    inputs: Ring<Stamped, INPUT_QUEUE>,
    /// The (number, sample) records of a replay: the sample at which the audio part applied the
    /// message with that number in the recorded session.
    replay: Ring<(u32, u64), REPLAY_QUEUE>,
    next_number: u32,
    started: bool,
    held: Held,
}

impl Control {
    pub const fn new() -> Self {
        Self {
            inputs: Ring::new(),
            replay: Ring::new(),
            next_number: 0,
            started: false,
            held: Held::new(),
        }
    }

    /// Gives the input back when the queue is full.
    pub fn queue_input(&mut self, input: Stamped) -> Result<(), Stamped> {
        self.inputs.push(input)
    }

    /// Queues the sample at which a recorded session applied the message with this number. The
    /// message then carries that sample as its `at` instead of the sample of its input. Gives the
    /// record back when the queue is full.
    pub fn replay_applied(&mut self, number: u32, sample: u64) -> Result<(), (u32, u64)> {
        self.replay.push((number, sample))
    }

    /// Handles the queued inputs stamped before `until`, in order, and returns whether the screen
    /// must be redrawn. That is the case on the first step and whenever the held pads change.
    ///
    /// An input is handled in full or not at all. When it needs to send a message and the queue is
    /// full, the step stops before it, leaves it and every later input queued and leaves the held
    /// pads as they were, so that a later step goes on exactly where this one stopped.
    ///
    /// A hit sends `ToneOn` for its pad. A pad that is already held counts as a new hit: it
    /// becomes the most recent one with the new velocity. Releasing the sounding pad, which is the
    /// most recently hit one, sends `ToneOn` for the most recently hit pad that is still held, with
    /// that hit's velocity, or `ToneOff` when none is held. Releasing another pad sends nothing,
    /// but the input is still handled.
    pub fn step(
        &mut self,
        until: u64,
        messages: &mut Producer<'_, Message, MESSAGE_QUEUE>,
    ) -> bool {
        let mut redraw = !core::mem::replace(&mut self.started, true);
        while let Some(stamped) = self.inputs.peek().filter(|stamped| stamped.sample < until) {
            let mut held = self.held;
            let kind = match stamped.input {
                Input::PadHit { pad, velocity } => {
                    held.hit(pad, velocity);
                    Some(MessageKind::ToneOn { pad, velocity })
                }
                Input::PadRelease { pad } => {
                    let was_sounding = held.latest().is_some_and(|(latest, _)| latest == pad);
                    held.release(pad);
                    was_sounding.then(|| match held.latest() {
                        Some((next, velocity)) => MessageKind::ToneOn {
                            pad: next,
                            velocity,
                        },
                        None => MessageKind::ToneOff,
                    })
                }
            };
            if let Some(kind) = kind {
                let number = self.next_number;
                while self.replay.peek().is_some_and(|(head, _)| head < number) {
                    self.replay.pop();
                }
                let record = self.replay.peek().filter(|&(head, _)| head == number);
                let message = Message {
                    number,
                    at: record.map_or(stamped.sample, |(_, sample)| sample),
                    kind,
                };
                if messages.push(message).is_err() {
                    break;
                }
                if record.is_some() {
                    self.replay.pop();
                }
                self.next_number += 1;
            }
            redraw |= held != self.held;
            self.held = held;
            self.inputs.pop();
        }
        redraw
    }

    /// Draws the whole picture from the state of the control part alone, whatever the canvas held
    /// before.
    pub fn draw(&self, canvas: &mut impl Canvas) {
        let screen = || Rect {
            x: 0,
            y: 0,
            width: WIDTH as u32,
            height: HEIGHT as u32,
        };
        canvas.fill_rect(screen(), BACKGROUND);
        canvas.outline_rect(screen(), LINE);
        for &(pad, _) in self.held.hits() {
            let rect = Rect {
                x: 20 + 37 * i32::from(pad),
                y: 116,
                width: 32,
                height: 40,
            };
            canvas.fill_rect(rect, ACCENT);
        }
    }
}

impl Default for Control {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(all(test, not(feature = "loom")))]
mod tests {
    use super::*;
    use crate::message::MessageKind;
    use crate::palette::{ACCENT, BACKGROUND, LINE};
    use crate::queue::{Consumer, Queue};
    use crate::screen::{Canvas, Color, HEIGHT, Rect, Screen, WIDTH};
    use std::vec::Vec;

    struct Rig<'a> {
        control: Control,
        producer: Producer<'a, Message, MESSAGE_QUEUE>,
        consumer: Consumer<'a, Message, MESSAGE_QUEUE>,
    }

    impl<'a> Rig<'a> {
        #[allow(unsafe_code)]
        fn new(messages: &'a Queue<Message, MESSAGE_QUEUE>) -> Self {
            // SAFETY: each rig takes one producer and one consumer from its own queue.
            unsafe {
                Self {
                    control: Control::new(),
                    producer: messages.producer(),
                    consumer: messages.consumer(),
                }
            }
        }

        fn hit(&mut self, sample: u64, pad: u8, velocity: u8) {
            let input = Input::PadHit { pad, velocity };
            assert_eq!(self.control.queue_input(Stamped { sample, input }), Ok(()));
        }

        fn release(&mut self, sample: u64, pad: u8) {
            let input = Input::PadRelease { pad };
            assert_eq!(self.control.queue_input(Stamped { sample, input }), Ok(()));
        }

        fn step(&mut self, until: u64) -> bool {
            self.control.step(until, &mut self.producer)
        }

        /// Takes every message that was sent.
        fn sent(&mut self) -> Vec<Message> {
            core::iter::from_fn(|| self.consumer.pop()).collect()
        }

        /// Sends `MESSAGE_QUEUE` messages by hitting pad 1 and leaves them in the queue.
        fn fill_the_message_queue(&mut self) {
            for round in 0..MESSAGE_QUEUE / INPUT_QUEUE {
                for index in 0..INPUT_QUEUE {
                    self.hit((round * INPUT_QUEUE + index) as u64, 1, 100);
                }
                self.step(u64::MAX);
            }
        }
    }

    fn tone_on(number: u32, at: u64, pad: u8, velocity: u8) -> Message {
        let kind = MessageKind::ToneOn { pad, velocity };
        Message { number, at, kind }
    }

    fn tone_off(number: u32, at: u64) -> Message {
        let kind = MessageKind::ToneOff;
        Message { number, at, kind }
    }

    fn picture(control: &Control) -> Screen {
        let mut screen = Screen::new();
        control.draw(&mut screen);
        screen
    }

    fn is_drawn(control: &Control, pad: u8) -> bool {
        picture(control).pixel(36 + 37 * usize::from(pad), 136) == ACCENT
    }

    #[test]
    fn pad_hit_sends_tone_on_at_the_hit() {
        let queue = Queue::new();
        let mut rig = Rig::new(&queue);
        rig.hit(100, 0, 127);

        rig.step(128);

        assert_eq!(rig.sent(), [tone_on(0, 100, 0, 127)]);
    }

    #[test]
    fn step_handles_only_inputs_stamped_before_until() {
        let queue = Queue::new();
        let mut rig = Rig::new(&queue);
        rig.hit(200, 0, 127);

        rig.step(128);
        assert_eq!(rig.sent(), []);
        rig.step(200);
        assert_eq!(rig.sent(), []);
        rig.step(256);

        assert_eq!(rig.sent(), [tone_on(0, 200, 0, 127)]);
    }

    #[test]
    fn release_of_an_earlier_pad_keeps_the_later_tone() {
        let queue = Queue::new();
        let mut rig = Rig::new(&queue);
        rig.hit(0, 0, 100);
        rig.hit(1, 7, 60);
        rig.release(2, 0);

        rig.step(128);
        assert_eq!(rig.sent(), [tone_on(0, 0, 0, 100), tone_on(1, 1, 7, 60)]);

        rig.release(130, 7);
        rig.step(256);
        assert_eq!(rig.sent(), [tone_off(2, 130)]);

        let queue = Queue::new();
        let mut rig = Rig::new(&queue);
        rig.hit(0, 0, 100);
        rig.hit(1, 7, 60);
        rig.release(2, 7);

        rig.step(128);
        assert_eq!(
            rig.sent(),
            [
                tone_on(0, 0, 0, 100),
                tone_on(1, 1, 7, 60),
                tone_on(2, 2, 0, 100),
            ]
        );
    }

    #[test]
    fn releasing_pads_keeps_the_order_of_the_others() {
        let queue = Queue::new();
        let mut rig = Rig::new(&queue);
        rig.hit(0, 1, 10);
        rig.hit(1, 2, 20);
        rig.hit(2, 3, 30);
        rig.release(3, 2);
        rig.release(4, 3);
        rig.release(5, 1);

        rig.step(128);

        assert_eq!(
            rig.sent(),
            [
                tone_on(0, 0, 1, 10),
                tone_on(1, 1, 2, 20),
                tone_on(2, 2, 3, 30),
                tone_on(3, 4, 1, 10),
                tone_off(4, 5),
            ]
        );
    }

    #[test]
    fn hitting_a_held_pad_makes_it_the_latest_hit_with_the_new_velocity() {
        let queue = Queue::new();
        let mut rig = Rig::new(&queue);
        rig.hit(0, 0, 100);
        rig.hit(1, 7, 60);
        rig.hit(2, 0, 50);
        rig.release(3, 0);
        rig.release(4, 7);

        rig.step(128);

        assert_eq!(
            rig.sent(),
            [
                tone_on(0, 0, 0, 100),
                tone_on(1, 1, 7, 60),
                tone_on(2, 2, 0, 50),
                tone_on(3, 3, 7, 60),
                tone_off(4, 4),
            ]
        );
    }

    #[test]
    fn releasing_a_pad_that_is_not_held_sends_nothing() {
        let queue = Queue::new();
        let mut rig = Rig::new(&queue);
        rig.release(0, 4);

        rig.step(128);

        assert_eq!(rig.sent(), []);
    }

    #[test]
    fn replay_record_sets_the_message_sample() {
        let queue = Queue::new();
        let mut rig = Rig::new(&queue);
        assert_eq!(rig.control.replay_applied(0, 512), Ok(()));
        rig.hit(100, 0, 127);

        rig.step(128);

        assert_eq!(rig.sent(), [tone_on(0, 512, 0, 127)]);
    }

    #[test]
    fn replay_record_applies_only_to_its_own_message() {
        let queue = Queue::new();
        let mut rig = Rig::new(&queue);
        assert_eq!(rig.control.replay_applied(1, 700), Ok(()));
        rig.hit(100, 0, 127);
        rig.hit(200, 1, 127);
        rig.hit(300, 2, 127);

        rig.step(512);

        assert_eq!(
            rig.sent(),
            [
                tone_on(0, 100, 0, 127),
                tone_on(1, 700, 1, 127),
                tone_on(2, 300, 2, 127),
            ]
        );
    }

    #[test]
    fn replay_record_of_a_message_already_sent_is_dropped() {
        let queue = Queue::new();
        let mut rig = Rig::new(&queue);
        rig.hit(10, 0, 127);
        rig.step(128);
        assert_eq!(rig.control.replay_applied(0, 999), Ok(()));
        assert_eq!(rig.control.replay_applied(1, 700), Ok(()));
        rig.hit(20, 1, 127);

        rig.step(128);

        assert_eq!(
            rig.sent(),
            [tone_on(0, 10, 0, 127), tone_on(1, 700, 1, 127)]
        );
    }

    #[test]
    fn replay_queue_refuses_when_full() {
        let queue = Queue::new();
        let mut rig = Rig::new(&queue);
        for number in 0..REPLAY_QUEUE as u32 {
            assert_eq!(rig.control.replay_applied(number, 0), Ok(()));
        }

        assert_eq!(
            rig.control.replay_applied(REPLAY_QUEUE as u32, 5),
            Err((REPLAY_QUEUE as u32, 5))
        );
    }

    #[test]
    fn input_queue_refuses_when_full_and_accepts_after_a_step() {
        let queue = Queue::new();
        let mut rig = Rig::new(&queue);
        for sample in 0..INPUT_QUEUE as u64 {
            rig.hit(sample, (sample % 12) as u8, 100);
        }
        let refused = Stamped {
            sample: 64,
            input: Input::PadRelease { pad: 0 },
        };
        assert_eq!(rig.control.queue_input(refused), Err(refused));

        rig.step(u64::MAX);

        let sent = rig.sent();
        assert_eq!(sent.len(), INPUT_QUEUE);
        for (index, message) in sent.iter().enumerate() {
            let pad = (index % 12) as u8;
            assert_eq!(*message, tone_on(index as u32, index as u64, pad, 100));
        }
        assert_eq!(rig.control.queue_input(refused), Ok(()));
    }

    #[test]
    fn stops_taking_inputs_while_the_message_queue_is_full() {
        let queue = Queue::new();
        let mut rig = Rig::new(&queue);
        rig.fill_the_message_queue();
        for index in 0..INPUT_QUEUE as u64 {
            rig.hit(256 + index, 2, 90);
        }

        rig.step(u64::MAX);

        let refused = Stamped {
            sample: 320,
            input: Input::PadRelease { pad: 2 },
        };
        assert_eq!(rig.control.queue_input(refused), Err(refused));
        let sent = rig.sent();
        assert_eq!(sent.len(), MESSAGE_QUEUE);
        assert_eq!(sent.last(), Some(&tone_on(255, 255, 1, 100)));

        rig.step(u64::MAX);

        let sent = rig.sent();
        assert_eq!(sent.len(), INPUT_QUEUE);
        for (index, message) in sent.iter().enumerate() {
            let expected = tone_on(256 + index as u32, 256 + index as u64, 2, 90);
            assert_eq!(*message, expected);
        }
    }

    #[test]
    fn a_stalled_step_leaves_the_held_pads_as_they_were() {
        let queue = Queue::new();
        let mut rig = Rig::new(&queue);
        rig.fill_the_message_queue();
        rig.hit(300, 5, 80);
        rig.release(301, 5);

        assert!(!rig.step(u64::MAX));
        assert!(is_drawn(&rig.control, 1));
        assert!(!is_drawn(&rig.control, 5));

        rig.consumer.pop();
        assert!(rig.step(u64::MAX));
        assert!(is_drawn(&rig.control, 1));
        assert!(is_drawn(&rig.control, 5));

        rig.consumer.pop();
        assert!(rig.step(u64::MAX));
        assert!(is_drawn(&rig.control, 1));
        assert!(!is_drawn(&rig.control, 5));

        let sent = rig.sent();
        assert_eq!(sent.len(), MESSAGE_QUEUE);
        assert_eq!(sent[MESSAGE_QUEUE - 2], tone_on(256, 300, 5, 80));
        assert_eq!(sent[MESSAGE_QUEUE - 1], tone_on(257, 301, 1, 100));
    }

    #[test]
    fn a_stalled_step_keeps_the_replay_record_of_the_message_it_waits_to_send() {
        let queue = Queue::new();
        let mut rig = Rig::new(&queue);
        rig.fill_the_message_queue();
        assert_eq!(rig.control.replay_applied(256, 9000), Ok(()));
        rig.hit(300, 2, 90);

        rig.step(u64::MAX);
        rig.sent();
        rig.step(u64::MAX);

        assert_eq!(rig.sent(), [tone_on(256, 9000, 2, 90)]);
    }

    #[test]
    fn test_picture() {
        let queue = Queue::new();
        let mut rig = Rig::new(&queue);
        rig.hit(0, 0, 100);
        rig.step(1);

        let screen = picture(&rig.control);

        assert_eq!(screen.pixel(0, 0), LINE);
        assert_eq!(screen.pixel(WIDTH - 1, HEIGHT - 1), LINE);
        assert_eq!(screen.pixel(1, 1), BACKGROUND);
        assert_eq!(screen.pixel(36, 136), ACCENT);
        assert_eq!(screen.pixel(36 + 37, 136), BACKGROUND);
        for (x, y) in [(20, 116), (51, 116), (20, 155), (51, 155)] {
            assert_eq!(screen.pixel(x, y), ACCENT);
        }
        for (x, y) in [(19, 136), (52, 136), (36, 115), (36, 156)] {
            assert_eq!(screen.pixel(x, y), BACKGROUND);
        }
    }

    #[test]
    fn every_held_pad_is_drawn_at_its_own_place() {
        let queue = Queue::new();
        let mut rig = Rig::new(&queue);
        for pad in [3, 11, 0] {
            rig.hit(0, pad, 100);
        }
        rig.release(1, 3);
        rig.step(128);

        assert!(is_drawn(&rig.control, 0));
        assert!(!is_drawn(&rig.control, 3));
        assert!(is_drawn(&rig.control, 11));
        assert!(!is_drawn(&rig.control, 10));
    }

    #[test]
    fn a_frame_does_not_depend_on_what_the_canvas_held_before() {
        let queue = Queue::new();
        let mut rig = Rig::new(&queue);
        rig.hit(0, 4, 100);
        rig.step(1);
        let mut used = Screen::new();
        let (width, height) = (WIDTH as u32, HEIGHT as u32);
        used.fill_rect(
            Rect {
                x: 0,
                y: 0,
                width,
                height,
            },
            Color(99),
        );

        rig.control.draw(&mut used);

        assert_eq!(used.pixels(), picture(&rig.control).pixels());
    }

    #[test]
    fn redraw_only_when_held_pads_change() {
        let queue = Queue::new();
        let mut rig = Rig::new(&queue);

        assert!(rig.step(128));
        assert!(!rig.step(128));

        rig.hit(10, 0, 100);
        assert!(rig.step(128));
        assert!(!rig.step(128));

        rig.release(20, 3);
        assert!(!rig.step(128));

        rig.release(30, 0);
        assert!(rig.step(128));
        assert!(!rig.step(128));
    }
}
