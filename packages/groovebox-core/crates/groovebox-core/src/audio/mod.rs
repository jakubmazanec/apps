use crate::message::{MESSAGE_QUEUE, Message, MessageKind, REPORT_QUEUE, Report, Target};
use crate::project::pool::SOUND_DEFAULTS;
use crate::queue::{Consumer, Producer};
use sounds::Sounds;

pub mod sounds;
pub mod synth;
pub mod voice;

pub const SAMPLE_RATE: u32 = 48_000;
/// The core renders on its own fixed schedule of this many samples, whatever the host's batch
/// size.
pub const CHUNK: usize = 32;
pub const MAX_BATCH: usize = 128;

pub struct Audio {
    position: u64,
    sounds: Sounds,
}

impl Audio {
    pub const fn new() -> Self {
        Self {
            position: 0,
            sounds: Sounds::new(),
        }
    }

    /// The sample at which the next `render` starts.
    pub fn position(&self) -> u64 {
        self.position
    }

    /// Renders `left.len()` samples, which must be a multiple of `CHUNK`. At each chunk start it
    /// applies every message that is due and reports the sample at which it applied it. A message
    /// that makes or changes a sound updates the audio part's copy of its values. No voice plays
    /// the notes yet, so every sample is silent.
    pub fn render(
        &mut self,
        left: &mut [f32],
        right: &mut [f32],
        messages: &mut Consumer<'_, Message, MESSAGE_QUEUE>,
        reports: &mut Producer<'_, Report, REPORT_QUEUE>,
    ) {
        assert_eq!(left.len(), right.len());
        assert_eq!(left.len() % CHUNK, 0);
        let (left, _) = left.as_chunks_mut::<CHUNK>();
        let (right, _) = right.as_chunks_mut::<CHUNK>();
        for (left, right) in left.iter_mut().zip(right) {
            while let Some(message) = messages
                .peek()
                .filter(|message| message.at <= self.position)
            {
                messages.pop();
                match message.kind {
                    MessageKind::NewSound { sound } => self.sounds.add(sound, SOUND_DEFAULTS),
                    MessageKind::CopySound { sound, of } => {
                        self.sounds.add(sound, *self.sounds.values(of));
                    }
                    MessageKind::SetParam {
                        target: Target::Sound(sound),
                        id,
                        value,
                    } => self.sounds.set(sound, id, value),
                    // No voice plays a note or uses a device value yet.
                    _ => {}
                }
                // A full queue drops the report: the audio part never waits.
                let _ = reports.push(Report::Applied {
                    number: message.number,
                    sample: self.position,
                });
            }
            left.fill(0.0);
            right.fill(0.0);
            self.position += CHUNK as u64;
        }
    }
}

impl Default for Audio {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(all(test, not(feature = "loom")))]
mod tests {
    use super::*;
    use crate::message::{
        MESSAGE_QUEUE, Message, MessageKind, NoteId, REPORT_QUEUE, Report, Target,
    };
    use crate::param::{CUTOFF, OUTPUT_VOLUME};
    use crate::project::pool::{SOUND_DEFAULTS, Sound, SoundNumber};
    use crate::queue::{Consumer, Producer, Queue};
    use std::vec::Vec;

    struct Rig<'a> {
        audio: Audio,
        to_audio: Producer<'a, Message, MESSAGE_QUEUE>,
        inbox: Consumer<'a, Message, MESSAGE_QUEUE>,
        outbox: Producer<'a, Report, REPORT_QUEUE>,
        from_audio: Consumer<'a, Report, REPORT_QUEUE>,
    }

    impl<'a> Rig<'a> {
        #[allow(unsafe_code)]
        fn new(
            messages: &'a Queue<Message, MESSAGE_QUEUE>,
            reports: &'a Queue<Report, REPORT_QUEUE>,
        ) -> Self {
            // SAFETY: each rig takes one producer and one consumer from its own queues.
            unsafe {
                Self {
                    audio: Audio::new(),
                    to_audio: messages.producer(),
                    inbox: messages.consumer(),
                    outbox: reports.producer(),
                    from_audio: reports.consumer(),
                }
            }
        }

        fn send(&mut self, number: u32, at: u64, kind: MessageKind) {
            assert_eq!(self.to_audio.push(Message { number, at, kind }), Ok(()));
        }

        /// Renders `length` samples and checks that both channels are the same.
        fn render(&mut self, length: usize) -> Vec<f32> {
            let mut left = std::vec![f32::NAN; length];
            let mut right = std::vec![f32::NAN; length];
            self.audio
                .render(&mut left, &mut right, &mut self.inbox, &mut self.outbox);
            let bits = |samples: &[f32]| samples.iter().map(|s| s.to_bits()).collect::<Vec<_>>();
            assert_eq!(bits(&left), bits(&right));
            left
        }

        fn report(&mut self) -> Option<Report> {
            self.from_audio.pop()
        }
    }

    fn applied(number: u32, sample: u64) -> Option<Report> {
        Some(Report::Applied { number, sample })
    }

    fn note_on(note: u32) -> MessageKind {
        MessageKind::NoteOn {
            note: NoteId(note),
            track: 0,
            sound: SoundNumber(1),
            pitch: 60,
            velocity: 127,
        }
    }

    fn note_off(note: u32) -> MessageKind {
        MessageKind::NoteOff { note: NoteId(note) }
    }

    fn is_silent(samples: &[f32]) -> bool {
        samples.iter().all(|sample| sample.to_bits() == 0)
    }

    #[test]
    fn silence_without_messages() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);

        assert!(is_silent(&rig.render(128)));
        assert_eq!(rig.audio.position(), 128);
    }

    #[test]
    fn the_audio_part_is_silent_and_reports_note_messages() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.send(0, 0, note_on(0));
        rig.send(1, 40, note_on(1));
        rig.send(2, 100, note_off(0));

        let samples = rig.render(256);

        assert!(is_silent(&samples));
        assert_eq!(rig.report(), applied(0, 0));
        assert_eq!(rig.report(), applied(1, 64));
        assert_eq!(rig.report(), applied(2, 128));
        assert_eq!(rig.report(), None);
        assert_eq!(rig.inbox.peek(), None);
    }

    #[test]
    fn message_applies_at_the_first_chunk_boundary_at_or_after_its_sample() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.send(0, 40, note_on(0));

        rig.render(128);

        assert_eq!(rig.report(), applied(0, 64));
        assert_eq!(rig.report(), None);
    }

    #[test]
    fn late_message_applies_at_the_next_chunk() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.render(128);

        rig.send(7, 10, note_on(0));
        rig.render(128);

        assert_eq!(rig.report(), applied(7, 128));
    }

    #[test]
    fn messages_for_the_same_chunk_apply_in_order() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.send(0, 33, note_on(0));
        rig.send(1, 40, note_off(0));
        rig.send(2, 96, note_on(1));

        rig.render(96);
        assert_eq!(rig.report(), applied(0, 64));
        assert_eq!(rig.report(), applied(1, 64));
        assert_eq!(rig.report(), None);

        rig.render(32);
        assert_eq!(rig.report(), applied(2, 96));
    }

    #[test]
    fn a_full_report_queue_drops_the_report_without_waiting() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        for number in 0..REPORT_QUEUE as u32 {
            assert_eq!(
                rig.outbox.push(Report::Applied { number, sample: 0 }),
                Ok(())
            );
        }
        rig.send(999, 0, note_on(0));

        rig.render(32);

        assert_eq!(rig.inbox.peek(), None);
        for number in 0..REPORT_QUEUE as u32 {
            assert_eq!(rig.report(), applied(number, 0));
        }
        assert_eq!(rig.report(), None);
    }

    #[test]
    #[should_panic]
    fn render_refuses_a_batch_that_is_not_a_multiple_of_the_chunk() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);

        rig.render(100);
    }

    #[test]
    #[should_panic]
    fn render_refuses_channels_of_different_lengths() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);

        rig.audio.render(
            &mut [0.0; 64],
            &mut [0.0; 32],
            &mut rig.inbox,
            &mut rig.outbox,
        );
    }

    fn cutoff(rig: &Rig<'_>, sound: u32) -> i32 {
        rig.audio.sounds.values(SoundNumber(sound))[Sound::place(CUTOFF.id)]
    }

    fn set_cutoff(sound: u32, value: i32) -> MessageKind {
        MessageKind::SetParam {
            target: Target::Sound(SoundNumber(sound)),
            id: CUTOFF.id,
            value,
        }
    }

    fn new_sound(sound: u32) -> MessageKind {
        MessageKind::NewSound {
            sound: SoundNumber(sound),
        }
    }

    #[test]
    fn the_audio_part_keeps_its_own_copy_of_every_sound() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.send(0, 0, new_sound(1));
        rig.send(1, 0, set_cutoff(1, 100));
        rig.send(2, 0, new_sound(2));

        let samples = rig.render(32);

        assert!(is_silent(&samples));
        assert_eq!(cutoff(&rig, 1), 100);
        assert_eq!(*rig.audio.sounds.values(SoundNumber(2)), SOUND_DEFAULTS);
    }

    #[test]
    fn a_copy_takes_the_values_the_audio_part_holds() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.send(0, 0, new_sound(1));
        rig.send(1, 0, set_cutoff(1, 9_000));
        rig.send(
            2,
            0,
            MessageKind::CopySound {
                sound: SoundNumber(2),
                of: SoundNumber(1),
            },
        );
        rig.send(3, 0, set_cutoff(1, 5));

        rig.render(32);

        assert_eq!(cutoff(&rig, 2), 9_000);
        assert_eq!(cutoff(&rig, 1), 5);
    }

    #[test]
    fn a_device_value_changes_no_sound() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.send(0, 0, new_sound(1));
        rig.send(
            1,
            0,
            MessageKind::SetParam {
                target: Target::Device,
                id: OUTPUT_VOLUME.id,
                value: 3,
            },
        );

        rig.render(32);

        assert_eq!(*rig.audio.sounds.values(SoundNumber(1)), SOUND_DEFAULTS);
        assert_eq!(rig.report(), applied(0, 0));
        assert_eq!(rig.report(), applied(1, 0));
    }
}
