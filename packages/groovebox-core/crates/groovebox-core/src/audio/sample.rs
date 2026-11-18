use super::CHUNK;
use crate::library::FileId;
use crate::message::SampleFile;
use crate::param::{END, Entry, LOOP, LOOP_END, LOOP_START, ParamId, REVERSE, START};
use crate::sample_ram::Reader;

/// A whole frame in the 32.32 fixed point of a position.
const FRAME: u64 = 1 << 32;

/// The sample engine's source: it plays a file from Start to End and around its loop at any rate,
/// in reverse from End back to Start. It reads one chunk ahead, as the preview does, so a fade
/// reads nothing of the file. Each output frame is a 4-point Hermite curve through the frames
/// around the position, unscaled: a full-scale sample reads ±1, a mono one in both channels.
pub struct Player {
    /// The file it plays; none for a missing sample.
    sample: Option<SampleFile>,
    /// Where it reads next, in frames of 32.32 fixed point.
    position: u64,
    /// The chunk that `render` gives next.
    ahead: [[f32; CHUNK]; 2],
    /// The chunk read ahead holds the sample's end, so it reads no more.
    ended: bool,
    /// `render` gave out the chunk that held the sample's end.
    finished: bool,
}

impl Player {
    pub const fn new() -> Self {
        Self {
            sample: None,
            position: 0,
            ahead: [[0.0; CHUNK]; 2],
            ended: true,
            finished: true,
        }
    }

    /// Plays `sample` with the values `read` gives from Start, or from End in reverse, and reads
    /// its first chunk ahead at `rate`. `None` has finished at once.
    pub fn start(
        &mut self,
        sample: Option<SampleFile>,
        read: impl Fn(ParamId) -> i32,
        rate: f32,
        reader: &Reader<'_>,
    ) {
        let position = sample.map_or(0, |SampleFile { frames, .. }| {
            let (start, end, _, reverse) = points(&read, frames);
            if reverse { end } else { start }
        });
        *self = Self {
            sample,
            position,
            ended: sample.is_none(),
            finished: sample.is_none(),
            ..Self::new()
        };
        self.ahead = self.read_chunk(read, rate, reader);
    }

    /// Gives the chunk read ahead and reads the next at `rate`, the file's frames per output
    /// frame, with the values `read` gives now.
    pub fn render(
        &mut self,
        read: impl Fn(ParamId) -> i32,
        rate: f32,
        reader: &Reader<'_>,
    ) -> [[f32; CHUNK]; 2] {
        self.finished = self.ended;
        let next = self.read_chunk(read, rate, reader);
        core::mem::replace(&mut self.ahead, next)
    }

    /// The chunk read ahead, reading nothing.
    pub fn ahead(&self) -> [[f32; CHUNK]; 2] {
        self.ahead
    }

    /// Whether `render` gave out the chunk in which the sample ended: only silence follows.
    pub fn finished(&self) -> bool {
        self.finished
    }

    pub fn file(&self) -> Option<FileId> {
        self.sample.map(|sample| sample.file)
    }

    pub fn stereo(&self) -> bool {
        self.sample.is_some_and(|sample| sample.stereo)
    }

    /// The next chunk from the position on: silent from where the sample ends, and without
    /// reading once it has ended. Each frame it reads is held within the file.
    fn read_chunk(
        &mut self,
        read: impl Fn(ParamId) -> i32,
        rate: f32,
        reader: &Reader<'_>,
    ) -> [[f32; CHUNK]; 2] {
        let mut chunk = [[0.0; CHUNK]; 2];
        let Some(SampleFile {
            file,
            frames,
            stereo,
        }) = self.sample.filter(|_| !self.ended)
        else {
            return chunk;
        };
        let (start, end, looped, reverse) = points(read, frames);
        // `as` saturates, so a huge rate only ends the sample or goes round the loop.
        let step = (rate * FRAME as f32) as u64;
        // After a `UseTable` the file's slice lies elsewhere: it is looked up in the table in use.
        let slice = reader.slice(file);
        for n in 0..CHUNK {
            let whole = self.position / FRAME;
            let t = (self.position % FRAME) as f32 / FRAME as f32;
            let around = [whole.saturating_sub(1), whole, whole + 1, whole + 2]
                .map(|frame| reader.frame(slice, stereo, frame.min(u64::from(frames - 1)) as u32));
            for (channel, out) in chunk.iter_mut().enumerate() {
                let [before, x0, x1, after] =
                    around.map(|(left, right)| f32::from(if channel == 0 { left } else { right }));
                let c1 = 0.5 * (x1 - before);
                let c2 = before - 2.5 * x0 + 2.0 * x1 - 0.5 * after;
                let c3 = 0.5 * (after - before) + 1.5 * (x0 - x1);
                out[n] = (((c3 * t + c2) * t + c1) * t + x0) / 32_768.0;
            }
            let moved = match (reverse, looped) {
                (false, None) => self.position.checked_add(step).filter(|&next| next <= end),
                (false, Some((from, to))) => {
                    let next = self.position.saturating_add(step);
                    Some(if next < to {
                        next
                    } else {
                        from + (next - to) % (to - from)
                    })
                }
                (true, None) => self
                    .position
                    .checked_sub(step)
                    .filter(|&next| next >= start),
                (true, Some((from, to))) => Some(match self.position.checked_sub(step) {
                    Some(next) if next >= from => next,
                    // It went at least one unit before the loop's start, so it comes back as far
                    // before the loop's end.
                    _ => to - 1 - (from.saturating_add(step) - self.position - 1) % (to - from),
                }),
            };
            match moved {
                Some(next) => self.position = next,
                None => {
                    self.ended = true;
                    break;
                }
            }
        }
        chunk
    }
}

impl Default for Player {
    fn default() -> Self {
        Self::new()
    }
}

/// The positions of Start, End and the loop that `read` gives, held within a file of `frames`
/// frames, and whether it plays in reverse. The loop runs from its first frame to just past its
/// last: it is the part of Loop start to Loop end that lies between Start and End, and there is
/// none when Loop is off or that part is empty.
fn points(read: impl Fn(ParamId) -> i32, frames: u32) -> (u64, u64, Option<(u64, u64)>, bool) {
    let at = |entry: &Entry| u64::from((read(entry.id) as u32).min(frames - 1)) * FRAME;
    let (start, end) = (at(&START), at(&END));
    let (from, to) = (at(&LOOP_START).max(start), at(&LOOP_END).min(end) + FRAME);
    let looped = (read(LOOP.id) != 0 && from < to).then_some((from, to));
    (start, end, looped, read(REVERSE.id) != 0)
}

#[cfg(all(test, not(feature = "loom")))]
mod tests {
    use super::*;
    use crate::param;
    use crate::sample_ram::{BLOCK, Blocks, Listed, Listing, SampleRam, Tables, blocks_for};
    use std::boxed::Box;
    use std::vec::Vec;

    /// A sample RAM and its block tables. The test writes files into them and lists them as the
    /// audio tests' `Rig::add_file` does.
    struct Ram {
        tables: Box<Tables>,
        ram: Box<SampleRam>,
        listing: Listing,
        blocks: Blocks,
    }

    impl Ram {
        fn new() -> Self {
            Self {
                tables: Box::new(Tables::new()),
                ram: SampleRam::boxed(),
                listing: Listing::new(),
                blocks: Blocks::new(),
            }
        }

        /// Writes `samples` into free blocks as `file`, a stereo file's frames left then right,
        /// lists the blocks as its slice and gives the file.
        fn add(&mut self, file: u16, stereo: bool, samples: &[i16]) -> SampleFile {
            let frames = samples.len() as u32 / (1 + u32::from(stereo));
            let blocks: Vec<u32> = self
                .blocks
                .take(blocks_for(frames, 1 + u8::from(stereo)))
                .expect("enough blocks are free")
                .collect();
            self.write(&blocks, samples);
            let listed = self
                .listing
                .add(&self.tables, FileId(file), blocks.into_iter());
            assert_eq!(listed, Some(Listed::Appended));
            SampleFile {
                file: FileId(file),
                frames,
                stereo,
            }
        }

        /// Writes `samples` into `blocks`, a stereo file's frames left then right.
        #[allow(unsafe_code)]
        fn write(&self, blocks: &[u32], samples: &[i16]) {
            for (&block, part) in blocks.iter().zip(samples.chunks(BLOCK / 2)) {
                // SAFETY: the test makes a reader only for each call to the player, so between
                // calls no other reference to these bytes lives.
                let bytes = unsafe { self.ram.bytes(block * BLOCK as u32, 2 * part.len() as u32) };
                for (bytes, sample) in bytes.as_chunks_mut::<2>().0.iter_mut().zip(part) {
                    *bytes = sample.to_le_bytes();
                }
            }
        }

        #[allow(unsafe_code)]
        fn reader(&self) -> Reader<'_> {
            // SAFETY: the player reads only files the test listed and wrote, and the test writes
            // blocks only while no reader lives.
            let [reader, _] = unsafe { self.tables.readers(&self.ram) };
            reader
        }
    }

    /// `frames` frames of a ramp: frame `i` holds `8 * i`, and a stereo frame `-8 * i` on the
    /// right.
    fn ramp(frames: i16, stereo: bool) -> Vec<i16> {
        (0..frames)
            .flat_map(|frame| {
                [8 * frame, -8 * frame]
                    .into_iter()
                    .take(1 + usize::from(stereo))
            })
            .collect()
    }

    /// The left samples of `frames` of a ramp as the player gives them.
    fn ramp_at(frames: impl IntoIterator<Item = i16>) -> Vec<f32> {
        frames
            .into_iter()
            .map(|frame| f32::from(8 * frame) / 32_768.0)
            .collect()
    }

    /// The values of a sound: `changes`, and every other entry's default.
    fn values<'a>(changes: &'a [(&Entry, i32)]) -> impl Fn(ParamId) -> i32 + Copy + 'a {
        move |id| {
            changes
                .iter()
                .find(|(entry, _)| entry.id == id)
                .map_or(param::entry(id).default, |&(_, value)| value)
        }
    }

    /// Starts `sample` with `changes` at `rate` and renders `chunks` chunks: each channel, and
    /// whether it had finished after each chunk.
    fn play(
        ram: &Ram,
        sample: SampleFile,
        changes: &[(&Entry, i32)],
        rate: f32,
        chunks: usize,
    ) -> ([Vec<f32>; 2], Vec<bool>) {
        let read = values(changes);
        let mut player = Player::new();
        player.start(Some(sample), read, rate, &ram.reader());
        let mut channels = [Vec::new(), Vec::new()];
        let mut finished = Vec::new();
        for _ in 0..chunks {
            let [left, right] = player.render(read, rate, &ram.reader());
            channels[0].extend(left);
            channels[1].extend(right);
            finished.push(player.finished());
        }
        (channels, finished)
    }

    fn bits(samples: &[f32]) -> Vec<u32> {
        samples.iter().map(|sample| sample.to_bits()).collect()
    }

    fn is_silent(samples: &[f32]) -> bool {
        samples.iter().all(|sample| sample.to_bits() == 0)
    }

    #[test]
    fn at_rate_1_it_plays_the_frames_from_start_to_end_and_finishes() {
        let mut ram = Ram::new();
        let sample = ram.add(0, false, &ramp(1_000, false));

        let ([left, right], finished) = play(&ram, sample, &[(&START, 100), (&END, 163)], 1.0, 4);

        assert_eq!(bits(&left[..64]), bits(&ramp_at(100..164)));
        assert!(is_silent(&left[64..]));
        assert_eq!(bits(&left), bits(&right));
        assert_eq!(finished, [false, true, true, true]);

        // No file has finished at once and plays silence.
        let mut player = Player::new();
        player.start(None, values(&[]), 1.0, &ram.reader());
        assert!(player.finished());
        assert_eq!(player.file(), None);
        let chunk = player.render(values(&[]), 1.0, &ram.reader());
        assert!(is_silent(chunk.as_flattened()));
        assert!(player.finished());
    }

    #[test]
    fn reverse_plays_from_end_back_to_start() {
        let mut ram = Ram::new();
        let sample = ram.add(0, false, &ramp(1_000, false));
        let changes: &[(&Entry, i32)] = &[(&START, 100), (&END, 163), (&REVERSE, 1)];

        let ([left, _], finished) = play(&ram, sample, changes, 1.0, 3);

        assert_eq!(bits(&left[..64]), bits(&ramp_at((100..164).rev())));
        assert!(is_silent(&left[64..]));
        assert_eq!(finished, [false, true, true]);
    }

    /// Loop on from 200 to 231 over the whole of a 1,000-frame file.
    const LOOPED: &[(&Entry, i32)] = &[
        (&LOOP, 1),
        (&LOOP_START, 200),
        (&LOOP_END, 231),
        (&START, 0),
        (&END, 999),
    ];

    #[test]
    fn a_loop_jumps_back_to_its_start_after_its_end() {
        let mut ram = Ram::new();
        let sample = ram.add(0, false, &ramp(1_000, false));

        let ([left, _], finished) = play(&ram, sample, LOOPED, 1.0, 10);

        let frames = (0..232).chain((200..232).cycle()).take(10 * CHUNK);
        assert_eq!(bits(&left), bits(&ramp_at(frames)));
        assert!(!finished.contains(&true));
    }

    #[test]
    fn a_loop_outside_start_and_end_does_not_loop() {
        let mut ram = Ram::new();
        let sample = ram.add(0, false, &ramp(1_000, false));
        let changes: &[(&Entry, i32)] = &[
            (&LOOP, 1),
            (&LOOP_START, 10),
            (&LOOP_END, 40),
            (&START, 500),
            (&END, 999),
        ];

        let ([left, _], finished) = play(&ram, sample, changes, 1.0, 17);

        assert_eq!(bits(&left[..500]), bits(&ramp_at(500..1_000)));
        assert!(is_silent(&left[500..]));
        assert_eq!(finished, [[false; 15].as_slice(), &[true; 2]].concat());
    }

    #[test]
    fn a_reversed_loop_runs_backwards() {
        let mut ram = Ram::new();
        let sample = ram.add(0, false, &ramp(1_000, false));
        let changes = [LOOPED, &[(&REVERSE, 1)]].concat();

        let ([left, _], finished) = play(&ram, sample, &changes, 1.0, 30);

        let frames = (200..1_000)
            .rev()
            .chain((200..232).rev().cycle())
            .take(30 * CHUNK);
        assert_eq!(bits(&left), bits(&ramp_at(frames)));
        assert!(!finished.contains(&true));
    }

    #[test]
    fn rate_2_skips_every_other_frame_and_rate_half_interpolates() {
        let mut ram = Ram::new();
        let sample = ram.add(0, false, &ramp(1_000, false));

        let ([twice, _], _) = play(&ram, sample, &[(&END, 999)], 2.0, 1);
        let ([half, _], _) = play(&ram, sample, &[(&START, 100), (&END, 999)], 0.5, 2);

        assert_eq!(bits(&twice), bits(&ramp_at((0..64).step_by(2))));
        // From frame 100 on: 800, then 804 halfway to 808, then 808.
        let halves: Vec<f32> = (0..64).map(|n| (800 + 4 * n) as f32 / 32_768.0).collect();
        assert_eq!(bits(&half), bits(&halves));
    }

    #[test]
    fn reads_stay_inside_the_file_whatever_the_values() {
        let mut ram = Ram::new();
        // Each 64-frame ramp fills the rest of its block with `i16::MAX`, and so does the block
        // the table lists after it.
        let files = [false, true].map(|stereo| {
            let mut samples = ramp(64, stereo);
            samples.resize(BLOCK / 2, i16::MAX);
            let file = 2 * u16::from(stereo);
            let sample = ram.add(file, stereo, &samples);
            ram.add(file + 1, false, &[i16::MAX; BLOCK / 2]);
            SampleFile {
                frames: 64,
                ..sample
            }
        });
        let points = [
            [0, 1_000_000, 0, 1_000_000],
            [63, 63, 63, 63],
            [64, 64, 64, 64],
            [i32::MAX, 0, i32::MAX, 0],
            [40, 20, 30, 10],
        ];

        for sample in files {
            for [start, end, loop_start, loop_end] in points {
                for (looped, reverse) in [(1, 0), (1, 1), (0, 0), (0, 1)] {
                    let changes: &[(&Entry, i32)] = &[
                        (&START, start),
                        (&END, end),
                        (&LOOP, looped),
                        (&LOOP_START, loop_start),
                        (&LOOP_END, loop_end),
                        (&REVERSE, reverse),
                    ];
                    // At whole frames the output is the ramp's frames.
                    let ([left, right], finished) = play(&ram, sample, changes, 16.0, 8);
                    let ramp = 0.0..=504.0 / 32_768.0;
                    assert!(left.iter().all(|x| ramp.contains(x)), "{changes:?}");
                    let right_ramp = if sample.stereo {
                        -504.0 / 32_768.0..=0.0
                    } else {
                        ramp
                    };
                    assert!(right.iter().all(|x| right_ramp.contains(x)), "{changes:?}");
                    // Start and End are held within the file, so a note without a loop ends
                    // within its 64 frames.
                    assert!(looped == 1 || finished[7], "{changes:?}");

                    // Between frames the curve may pass the last frame by less than a frame's step
                    // of the ramp; a frame of `i16::MAX` would show near 1.
                    for rate in [0.37, 3.3, 1_500.0] {
                        let ([left, right], finished) = play(&ram, sample, changes, rate, 8);
                        let bound = 512.0 / 32_768.0;
                        assert!(
                            left.iter().chain(&right).all(|x| libm::fabsf(*x) <= bound),
                            "{changes:?} at rate {rate}"
                        );
                        assert!(looped == 1 || finished[7], "{changes:?} at rate {rate}");
                    }
                }
            }
        }
    }

    #[test]
    fn a_two_frame_file_plays_and_ends() {
        let mut ram = Ram::new();
        let sample = ram.add(0, false, &ramp(2, false));

        for (reverse, frames) in [(0, [0, 1]), (1, [1, 0])] {
            let changes: &[(&Entry, i32)] = &[(&END, 1), (&REVERSE, reverse)];
            let ([left, _], finished) = play(&ram, sample, changes, 1.0, 2);

            assert_eq!(
                bits(&left[..2]),
                bits(&ramp_at(frames)),
                "reverse {reverse}"
            );
            assert!(is_silent(&left[2..]), "reverse {reverse}");
            assert_eq!(finished, [true, true], "reverse {reverse}");
        }
    }

    #[test]
    fn a_stereo_file_keeps_its_channels() {
        let mut ram = Ram::new();
        let mono = ram.add(0, false, &ramp(64, false));
        let stereo = ram.add(1, true, &ramp(64, true));

        let ([left, right], _) = play(&ram, stereo, &[(&END, 63)], 1.0, 2);

        assert_eq!(bits(&left), bits(&ramp_at(0..64)));
        let rights: Vec<f32> = (0..64)
            .map(|frame: i16| f32::from(-8 * frame) / 32_768.0)
            .collect();
        assert_eq!(bits(&right), bits(&rights));
        let mut player = Player::new();
        for (sample, is_stereo) in [(mono, false), (stereo, true)] {
            player.start(Some(sample), values(&[]), 1.0, &ram.reader());
            assert_eq!(player.stereo(), is_stereo);
            assert_eq!(player.file(), Some(sample.file));
        }
    }

    #[test]
    fn ahead_gives_the_next_chunk_without_reading() {
        let mut ram = Ram::new();
        let sample = ram.add(0, false, &ramp(1_000, false));
        let read = values(&[(&END, 999)]);
        let mut player = Player::new();
        player.start(Some(sample), read, 1.0, &ram.reader());
        player.render(read, 1.0, &ram.reader());

        let blocks: Vec<u32> = ram.listing.blocks(&ram.tables, FileId(0)).collect();
        ram.write(&blocks, &[0; BLOCK / 2]);

        let [left, right] = player.ahead();
        assert_eq!(bits(&left), bits(&ramp_at(32..64)));
        assert_eq!(bits(&right), bits(&left));
        assert_eq!(player.render(read, 1.0, &ram.reader()), [left, right]);
    }
}
