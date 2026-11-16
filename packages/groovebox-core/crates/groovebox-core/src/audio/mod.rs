use crate::dsp::clip::soft_clip;
use crate::message::{MESSAGE_QUEUE, Message, MessageKind, REPORT_QUEUE, Report, Target};
use crate::param::{self, OUTPUT_VOLUME};
use crate::project::pool::SOUND_DEFAULTS;
use crate::queue::{Consumer, Producer};
use sounds::Sounds;
use voices::Voices;

pub mod sounds;
pub mod synth;
pub mod voice;
pub mod voices;

pub const SAMPLE_RATE: u32 = 48_000;
/// The core renders on its own fixed schedule of this many samples, whatever the host's batch
/// size.
pub const CHUNK: usize = 32;
pub const MAX_BATCH: usize = 128;

pub struct Audio {
    position: u64,
    sounds: Sounds,
    voices: Voices,
    /// The output volume's value, where it glides to, and the chunks it takes to get there.
    volume: i32,
    volume_target: i32,
    volume_chunks: u32,
}

impl Audio {
    pub const fn new() -> Self {
        Self {
            position: 0,
            sounds: Sounds::new(),
            voices: Voices::new(),
            volume: OUTPUT_VOLUME.default,
            volume_target: OUTPUT_VOLUME.default,
            volume_chunks: 0,
        }
    }

    /// The sample at which the next `render` starts.
    pub fn position(&self) -> u64 {
        self.position
    }

    /// Renders `left.len()` samples, which must be a multiple of `CHUNK`. At each chunk start it
    /// applies every message that is due and reports the sample at which it applied it. It then
    /// adds up the voices and the last chunk of each voice a new note took or choked, soft-clips
    /// the sum and multiplies it by the output volume, which moves in a line across the chunk.
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
            let mut fades = [[0.0; CHUNK]; 2];
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
                    } => {
                        self.sounds.set(sound, id, value);
                        self.voices.set(sound, id, value);
                    }
                    MessageKind::SetParam {
                        target: Target::Device,
                        id,
                        value,
                    } if id == OUTPUT_VOLUME.id => {
                        self.volume_target = value;
                        self.volume_chunks = OUTPUT_VOLUME.glide.div_ceil(CHUNK as u32);
                    }
                    MessageKind::NoteOn {
                        note,
                        track,
                        sound,
                        pitch,
                        velocity,
                    } => self.voices.note_on(
                        note,
                        track,
                        sound,
                        pitch,
                        velocity,
                        &self.sounds,
                        &mut fades,
                    ),
                    MessageKind::NoteOff { note } => self.voices.note_off(note, &self.sounds),
                    // Another device value is not the audio part's.
                    MessageKind::SetParam { .. } => {}
                }
                // A full queue drops the report: the audio part never waits.
                let _ = reports.push(Report::Applied {
                    number: message.number,
                    sample: self.position,
                });
            }

            let mut mix = [[0.0; CHUNK]; 2];
            self.voices.render(&mut mix);
            let before = param::real(&OUTPUT_VOLUME, self.volume);
            if self.volume_chunks > 0 {
                self.volume += (self.volume_target - self.volume) / self.volume_chunks as i32;
                self.volume_chunks -= 1;
            }
            let after = param::real(&OUTPUT_VOLUME, self.volume);
            for n in 0..CHUNK {
                let gain = before + (after - before) * (n + 1) as f32 / CHUNK as f32;
                left[n] = soft_clip(mix[0][n] + fades[0][n]) * gain;
                right[n] = soft_clip(mix[1][n] + fades[1][n]) * gain;
            }
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
    use crate::param::{
        CHOKE_GROUP, CUTOFF, Entry, LEVEL, OUTPUT_VOLUME, RESONANCE, SPREAD, SUPERSAW, WAVE,
    };
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

        /// Makes the audio part hold sound 1, as a `NewSound` does, without a message or a report.
        fn add_sound(&mut self) {
            self.audio.sounds.add(SoundNumber(1), SOUND_DEFAULTS);
        }

        fn render_stereo(&mut self, length: usize) -> [Vec<f32>; 2] {
            let mut left = std::vec![f32::NAN; length];
            let mut right = std::vec![f32::NAN; length];
            self.audio
                .render(&mut left, &mut right, &mut self.inbox, &mut self.outbox);
            [left, right]
        }

        /// Renders `length` samples of a mono sound and checks that both channels are the same.
        fn render(&mut self, length: usize) -> Vec<f32> {
            let [left, right] = self.render_stereo(length);
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

    fn bits(samples: &[f32]) -> Vec<u32> {
        samples.iter().map(|sample| sample.to_bits()).collect()
    }

    fn peak(samples: &[f32]) -> f32 {
        samples
            .iter()
            .fold(0.0, |peak, &x| libm::fmaxf(peak, libm::fabsf(x)))
    }

    #[test]
    fn silence_without_messages() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);

        assert!(is_silent(&rig.render(128)));
        assert_eq!(rig.audio.position(), 128);
    }

    #[test]
    fn note_messages_are_reported_at_the_chunk_they_apply() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.add_sound();
        rig.send(0, 0, note_on(0));
        rig.send(1, 40, note_on(1));
        rig.send(2, 100, note_off(0));

        rig.render(256);

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
        rig.add_sound();
        rig.send(0, 40, note_on(0));

        rig.render(128);

        assert_eq!(rig.report(), applied(0, 64));
        assert_eq!(rig.report(), None);
    }

    #[test]
    fn late_message_applies_at_the_next_chunk() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.add_sound();
        rig.render(128);

        rig.send(7, 10, note_on(0));
        rig.render(128);

        assert_eq!(rig.report(), applied(7, 128));
    }

    #[test]
    fn messages_for_the_same_chunk_apply_in_order() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.add_sound();
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
        rig.add_sound();
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

    fn set_sound(sound: u32, entry: &Entry, value: i32) -> MessageKind {
        MessageKind::SetParam {
            target: Target::Sound(SoundNumber(sound)),
            id: entry.id,
            value,
        }
    }

    fn set_volume(value: i32) -> MessageKind {
        MessageKind::SetParam {
            target: Target::Device,
            id: OUTPUT_VOLUME.id,
            value,
        }
    }

    #[test]
    fn a_new_synth_on_a_pad_is_heard() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.send(0, 0, new_sound(1));
        rig.send(1, 0, note_on(0));
        rig.send(2, 32, note_off(0));

        assert!(!is_silent(&rig.render(32)));

        let released = rig.render(9_600);
        assert!(is_silent(&released[9_600 - CHUNK..]));
    }

    #[test]
    fn the_output_volume_turns_it_down_after_the_clipper() {
        let at_volume = |volume| {
            let (messages, reports) = (Queue::new(), Queue::new());
            let mut rig = Rig::new(&messages, &reports);
            rig.send(0, 0, new_sound(1));
            rig.send(1, 0, set_sound(1, &LEVEL, 65_535));
            rig.send(2, 0, set_volume(volume));
            for note in 0..8 {
                rig.send(3 + note, 0, note_on(note));
            }
            rig.render(512)
        };

        // The volume glides over 128 samples.
        let (full, half) = (at_volume(65_535), at_volume(32_768));
        let (full, half) = (&full[128..], &half[128..]);

        // The note is loud enough for the clipper to bend it.
        assert!(peak(full) > 0.5, "peak {}", peak(full));
        for (full, half) in full.iter().zip(half) {
            assert!(libm::fabsf(half - full / 4.0) < 1e-4, "{full} and {half}");
        }
    }

    #[test]
    fn the_output_volume_glides_over_four_chunks() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.send(0, 0, new_sound(1));
        rig.send(1, 0, note_on(0));
        rig.render(256);

        rig.send(2, 256, set_volume(0));
        let gliding = rig.render(4 * CHUNK);
        let after = rig.render(CHUNK);

        assert!(gliding[3 * CHUNK..].iter().any(|&x| x != 0.0));
        assert!(after.iter().all(|&x| x == 0.0));
    }

    #[test]
    fn a_choked_voice_fades_out_in_the_chunk_of_the_note_that_chokes_it() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.send(0, 0, new_sound(1));
        rig.send(1, 0, new_sound(2));
        rig.send(2, 0, set_sound(1, &CHOKE_GROUP, 1));
        rig.send(3, 0, set_sound(2, &CHOKE_GROUP, 1));
        // The second sound is silent, so only the fade of the first is heard.
        rig.send(4, 0, set_sound(2, &LEVEL, 0));
        rig.send(5, 0, note_on(0));
        rig.send(
            6,
            256,
            MessageKind::NoteOn {
                note: NoteId(1),
                track: 0,
                sound: SoundNumber(2),
                pitch: 60,
                velocity: 127,
            },
        );
        assert!(!is_silent(&rig.render(256)));

        let fade = rig.render(CHUNK);
        let after = rig.render(CHUNK);

        assert!(fade.iter().any(|&x| x != 0.0));
        assert_eq!(fade[CHUNK - 1], 0.0);
        assert!(after.iter().all(|&x| x == 0.0));
    }

    #[test]
    fn the_loudest_mix_stays_within_one() {
        let (messages, reports) = (Queue::new(), Queue::new());
        let mut rig = Rig::new(&messages, &reports);
        rig.send(0, 0, new_sound(1));
        rig.send(1, 0, set_sound(1, &WAVE, SUPERSAW));
        rig.send(2, 0, set_sound(1, &SPREAD, 65_535));
        rig.send(3, 0, set_sound(1, &LEVEL, 65_535));
        rig.send(4, 0, set_sound(1, &RESONANCE, 65_535));
        rig.send(5, 0, set_volume(65_535));
        for note in 0..32 {
            rig.send(6 + note, 0, note_on(note));
        }

        let [left, right] = rig.render_stereo(48_000);

        assert!(
            left.iter()
                .chain(&right)
                .all(|x| x.is_finite() && libm::fabsf(*x) <= 1.0)
        );
        assert!(peak(&left) > 0.9 && peak(&right) > 0.9);
    }

    #[test]
    fn the_output_does_not_depend_on_the_batch_size() {
        let rendered = |batch: usize| {
            let (messages, reports) = (Queue::new(), Queue::new());
            let mut rig = Rig::new(&messages, &reports);
            rig.send(0, 0, new_sound(1));
            rig.send(1, 0, set_sound(1, &WAVE, SUPERSAW));
            rig.send(2, 0, set_sound(1, &SPREAD, 32_768));
            rig.send(3, 0, note_on(0));
            rig.send(4, 100, set_volume(20_000));
            rig.send(5, 200, note_on(1));
            rig.send(6, 300, note_off(0));
            let mut channels = [Vec::new(), Vec::new()];
            for _ in 0..512 / batch {
                let [left, right] = rig.render_stereo(batch);
                channels[0].extend(bits(&left));
                channels[1].extend(bits(&right));
            }
            channels
        };

        let by_chunks = rendered(CHUNK);

        assert_eq!(by_chunks, rendered(MAX_BATCH));
        assert!(by_chunks[0].iter().any(|&x| x != 0));
    }
}
