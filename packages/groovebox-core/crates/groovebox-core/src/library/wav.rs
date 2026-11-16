use crate::label::Label;

const PCM: u16 = 1;
const FLOAT: u16 = 3;
const EXTENSIBLE: u16 = 0xFFFE;
const MIN_RATE: u32 = 1_000;
pub(super) const MAX_RATE: u32 = 384_000;
/// The converted file's rate, written into its `fmt ` chunk.
const RATE: u32 = 48_000;
/// The nanoseconds between two samples at 48 kHz, rounded, for the `smpl` chunk.
const SAMPLE_PERIOD: u32 = 20_833;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Encoding {
    Int16,
    Int24,
    Int32,
    Float32,
}

impl Encoding {
    pub fn bytes(self) -> usize {
        match self {
            Self::Int16 => 2,
            Self::Int24 => 3,
            Self::Int32 | Self::Float32 => 4,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Format {
    pub channels: u8,
    pub rate: u32,
    pub encoding: Encoding,
}

/// What our private `gbox` chunk holds.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Ours {
    pub fingerprint: [u8; 16],
    pub original: Label<255>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Header {
    pub format: Format,
    /// Where the audio starts in the file.
    pub data_at: u64,
    pub frames: u32,
    pub root: Option<u8>,
    /// The first loop's first and last frame, both inclusive.
    pub loop_points: Option<(u32, u32)>,
    /// `None` for a file that is not ours, or whose `gbox` chunk is damaged.
    pub ours: Option<Ours>,
}

fn u16_at(bytes: &[u8], at: usize) -> Option<u16> {
    Some(u16::from_le_bytes(bytes.get(at..at + 2)?.try_into().ok()?))
}

fn u32_at(bytes: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_le_bytes(bytes.get(at..at + 4)?.try_into().ok()?))
}

/// Reads the head of a file: `start` holds its first bytes, `file_bytes` is its whole size. The
/// chunks up to the `data` chunk's header must lie in `start`. A `data` chunk longer than the file
/// is cut to the file's whole frames. `None` is a file the device cannot read; whatever the bytes
/// are, it never panics.
pub fn parse(start: &[u8], file_bytes: u64) -> Option<Header> {
    if start.get(..4)? != b"RIFF" || start.get(8..12)? != b"WAVE" {
        return None;
    }
    let mut format = None;
    let mut root = None;
    let mut loop_points = None;
    let mut ours = None;
    let mut at = 12;
    loop {
        let rest = start.get(at..)?;
        let size = u32_at(rest, 4)?;
        let body = rest.get(8..)?.get(..usize::try_from(size).ok()?);
        match &rest[..4] {
            b"fmt " => {
                let body = body?;
                let tag = match u16_at(body, 0)? {
                    // The first two bytes of the extensible format's GUID name the format.
                    EXTENSIBLE => u16_at(body, 24)?,
                    tag => tag,
                };
                let encoding = match (tag, u16_at(body, 14)?) {
                    (PCM, 16) => Encoding::Int16,
                    (PCM, 24) => Encoding::Int24,
                    (PCM, 32) => Encoding::Int32,
                    (FLOAT, 32) => Encoding::Float32,
                    _ => return None,
                };
                let channels = u8::try_from(u16_at(body, 2)?)
                    .ok()
                    .filter(|channels| (1..=2).contains(channels))?;
                let rate = u32_at(body, 4)?;
                if !(MIN_RATE..=MAX_RATE).contains(&rate) {
                    return None;
                }
                format = Some(Format {
                    channels,
                    rate,
                    encoding,
                });
            }
            // A chunk too short to say gives neither value.
            b"smpl" => {
                let body = body?;
                root = u32_at(body, 12)
                    .and_then(|note| u8::try_from(note).ok())
                    .filter(|note| *note < 128);
                loop_points = u32_at(body, 28)
                    .filter(|loops| *loops > 0)
                    .and_then(|_| Some((u32_at(body, 44)?, u32_at(body, 48)?)));
            }
            // A chunk of another version or a damaged one is not ours.
            b"gbox" => {
                ours = body
                    .filter(|body| body.first() == Some(&1))
                    .and_then(|body| {
                        let name = body.get(19..19 + usize::from(*body.get(18)?))?;
                        let mut original = Label::new();
                        original.push_str(core::str::from_utf8(name).ok()?);
                        Some(Ours {
                            fingerprint: body.get(2..18)?.try_into().ok()?,
                            original,
                        })
                    });
            }
            b"data" => {
                let format = format?;
                let data_at = at as u64 + 8;
                let data_bytes = u64::from(size).min(file_bytes.saturating_sub(data_at));
                let frames =
                    data_bytes / (u64::from(format.channels) * format.encoding.bytes() as u64);
                let frames = u32::try_from(frames).ok().filter(|frames| *frames > 0)?;
                return Some(Header {
                    format,
                    data_at,
                    frames,
                    root,
                    loop_points: loop_points
                        .filter(|&(first, last)| first <= last && last < frames),
                    ours,
                });
            }
            _ => {}
        }
        // A chunk of odd size is followed by a pad byte.
        at = usize::try_from(at as u64 + 8 + u64::from(size) + u64::from(size & 1)).ok()?;
    }
}

/// Turns the little-endian samples in `bytes` into `out`, as many as both hold. Integers are
/// divided by 2^(bits - 1), floats are kept and a float that is not finite becomes 0.
pub fn decode(encoding: Encoding, bytes: &[u8], out: &mut [f32]) {
    for (sample, bytes) in out.iter_mut().zip(bytes.chunks_exact(encoding.bytes())) {
        *sample = match encoding {
            Encoding::Int16 => f32::from(i16::from_le_bytes([bytes[0], bytes[1]])) / 32_768.0,
            // The shift moves the sign bit of the 3 bytes into place.
            Encoding::Int24 => {
                (i32::from_le_bytes([0, bytes[0], bytes[1], bytes[2]]) >> 8) as f32 / 8_388_608.0
            }
            Encoding::Int32 => {
                i32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) as f32
                    / 2_147_483_648.0
            }
            Encoding::Float32 => {
                let sample = f32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
                if sample.is_finite() { sample } else { 0.0 }
            }
        };
    }
}

/// Writes the head of a converted file into `out`, which must hold 512 bytes: everything up to and
/// including the `data` chunk's header, which the audio follows. Returns the bytes written.
pub fn write_header(
    out: &mut [u8],
    channels: u8,
    frames: u32,
    root: u8,
    loop_points: Option<(u32, u32)>,
    ours: &Ours,
) -> usize {
    let name = ours.original.as_str().as_bytes();
    let block_align = u16::from(channels) * 2;
    let data_bytes = frames * u32::from(block_align);
    let mut at = 0;
    let mut put = |bytes: &[u8]| {
        out[at..at + bytes.len()].copy_from_slice(bytes);
        at += bytes.len();
    };

    put(b"RIFF");
    put(&[0; 4]);
    put(b"WAVE");

    put(b"fmt ");
    put(&16u32.to_le_bytes());
    put(&PCM.to_le_bytes());
    put(&u16::from(channels).to_le_bytes());
    put(&RATE.to_le_bytes());
    put(&(RATE * u32::from(block_align)).to_le_bytes());
    put(&block_align.to_le_bytes());
    put(&16u16.to_le_bytes());

    put(b"gbox");
    put(&(19 + name.len() as u32).to_le_bytes());
    put(&[1, 0]);
    put(&ours.fingerprint);
    put(&[name.len() as u8]);
    put(name);
    if name.len().is_multiple_of(2) {
        put(&[0]);
    }

    put(b"smpl");
    put(&(36 + 24 * u32::from(loop_points.is_some())).to_le_bytes());
    put(&[0; 8]);
    put(&SAMPLE_PERIOD.to_le_bytes());
    put(&u32::from(root).to_le_bytes());
    put(&[0; 12]);
    put(&u32::from(loop_points.is_some()).to_le_bytes());
    put(&[0; 4]);
    if let Some((first, last)) = loop_points {
        put(&[0; 8]);
        put(&first.to_le_bytes());
        put(&last.to_le_bytes());
        put(&[0; 8]);
    }

    put(b"data");
    put(&data_bytes.to_le_bytes());

    out[4..8].copy_from_slice(&(at as u32 - 8 + data_bytes).to_le_bytes());
    at
}

/// The note the end of a file name gives: its last part, split at space, `_`, `-` and `.`, that
/// reads as a letter from A to G in either case, a `#` or a `b` or nothing and an octave from 0 to
/// 9, as in `Bass_C2` (C4 is 60). `None` when no part reads as a note or the note is above 127.
pub fn root_from_name(name: &str) -> Option<u8> {
    name.rsplit([' ', '_', '-', '.'])
        .find_map(|part| {
            let (letter, rest) = part.as_bytes().split_first()?;
            let semitone = match letter.to_ascii_uppercase() {
                b'C' => 0,
                b'D' => 2,
                b'E' => 4,
                b'F' => 5,
                b'G' => 7,
                b'A' => 9,
                b'B' => 11,
                _ => return None,
            };
            let (accidental, octave) = match rest {
                [b'#', octave] => (1, octave),
                [b'b', octave] => (-1, octave),
                [octave] => (0, octave),
                _ => return None,
            };
            let octave = char::from(*octave).to_digit(10)?;
            Some(semitone + accidental + 12 * (octave as i32 + 1))
        })
        .and_then(|note| u8::try_from(note).ok())
        .filter(|note| *note < 128)
}

/// A whole WAV file of a sine at an amplitude of 0.5, so that the rounding never clips: `seconds`
/// of `hz` at `rate`, the same signal in every channel. The maths is `libm`'s, so every build
/// makes the same bytes.
#[cfg(any(test, feature = "harness"))]
pub fn sine(
    hz: f32,
    seconds: f32,
    rate: u32,
    encoding: Encoding,
    channels: u8,
) -> std::vec::Vec<u8> {
    let frames = libm::roundf(seconds * rate as f32) as u32;
    let data_bytes = frames * u32::from(channels) * encoding.bytes() as u32;
    let (tag, bits) = match encoding {
        Encoding::Int16 => (PCM, 16),
        Encoding::Int24 => (PCM, 24),
        Encoding::Int32 => (PCM, 32),
        Encoding::Float32 => (FLOAT, 32),
    };
    let block_align = u16::from(channels) * bits / 8;

    let mut file = std::vec::Vec::new();
    file.extend_from_slice(b"RIFF");
    file.extend_from_slice(&(36 + data_bytes + data_bytes % 2).to_le_bytes());
    file.extend_from_slice(b"WAVEfmt ");
    file.extend_from_slice(&16u32.to_le_bytes());
    file.extend_from_slice(&tag.to_le_bytes());
    file.extend_from_slice(&u16::from(channels).to_le_bytes());
    file.extend_from_slice(&rate.to_le_bytes());
    file.extend_from_slice(&(rate * u32::from(block_align)).to_le_bytes());
    file.extend_from_slice(&block_align.to_le_bytes());
    file.extend_from_slice(&bits.to_le_bytes());
    file.extend_from_slice(b"data");
    file.extend_from_slice(&data_bytes.to_le_bytes());
    for frame in 0..frames {
        let phase = core::f64::consts::TAU * f64::from(hz) * f64::from(frame) / f64::from(rate);
        let sample = 0.5 * libm::sin(phase);
        for _ in 0..channels {
            match encoding {
                Encoding::Int16 => {
                    file.extend_from_slice(&(libm::round(sample * 32_768.0) as i16).to_le_bytes())
                }
                Encoding::Int24 => file.extend_from_slice(
                    &(libm::round(sample * 8_388_608.0) as i32).to_le_bytes()[..3],
                ),
                Encoding::Int32 => file.extend_from_slice(
                    &(libm::round(sample * 2_147_483_648.0) as i32).to_le_bytes(),
                ),
                Encoding::Float32 => file.extend_from_slice(&(sample as f32).to_le_bytes()),
            }
        }
    }
    // A chunk of odd size is followed by a pad byte.
    file.resize(file.len() + (data_bytes % 2) as usize, 0);
    file
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::vec::Vec;

    const PCM: u16 = 1;
    const FLOAT: u16 = 3;
    const EXTENSIBLE: u16 = 0xFFFE;

    fn chunk(id: &[u8; 4], body: &[u8]) -> Vec<u8> {
        let mut chunk = Vec::new();
        chunk.extend_from_slice(id);
        chunk.extend_from_slice(&(body.len() as u32).to_le_bytes());
        chunk.extend_from_slice(body);
        if body.len() % 2 == 1 {
            chunk.push(0);
        }
        chunk
    }

    fn riff(chunks: &[Vec<u8>]) -> Vec<u8> {
        let mut file = b"RIFF\0\0\0\0WAVE".to_vec();
        for chunk in chunks {
            file.extend_from_slice(chunk);
        }
        let size = (file.len() - 8) as u32;
        file[4..8].copy_from_slice(&size.to_le_bytes());
        file
    }

    fn fmt(tag: u16, channels: u16, rate: u32, bits: u16) -> Vec<u8> {
        let block = channels * bits / 8;
        let mut body = Vec::new();
        body.extend_from_slice(&tag.to_le_bytes());
        body.extend_from_slice(&channels.to_le_bytes());
        body.extend_from_slice(&rate.to_le_bytes());
        body.extend_from_slice(&(rate * u32::from(block)).to_le_bytes());
        body.extend_from_slice(&block.to_le_bytes());
        body.extend_from_slice(&bits.to_le_bytes());
        chunk(b"fmt ", &body)
    }

    fn extensible(subformat: u16, channels: u16, rate: u32, bits: u16) -> Vec<u8> {
        let mut body = fmt(EXTENSIBLE, channels, rate, bits)[8..].to_vec();
        body.extend_from_slice(&22u16.to_le_bytes());
        body.extend_from_slice(&bits.to_le_bytes());
        body.extend_from_slice(&3u32.to_le_bytes());
        body.extend_from_slice(&subformat.to_le_bytes());
        body.extend_from_slice(&[0, 0, 0, 0, 0x10, 0, 0x80, 0, 0, 0xAA, 0, 0x38, 0x9B, 0x71]);
        chunk(b"fmt ", &body)
    }

    fn smpl(unity_note: u32, loops: &[(u32, u32)]) -> Vec<u8> {
        let mut body = [0u8; 36].to_vec();
        body[12..16].copy_from_slice(&unity_note.to_le_bytes());
        body[28..32].copy_from_slice(&(loops.len() as u32).to_le_bytes());
        for (first, last) in loops {
            let mut record = [0u8; 24];
            record[8..12].copy_from_slice(&first.to_le_bytes());
            record[12..16].copy_from_slice(&last.to_le_bytes());
            body.extend_from_slice(&record);
        }
        chunk(b"smpl", &body)
    }

    /// The first 64 KB of the file, as a caller reads them.
    fn read(file: &[u8]) -> Option<Header> {
        parse(&file[..file.len().min(65_536)], file.len() as u64)
    }

    fn mono_16_bit(frames: usize) -> Vec<Vec<u8>> {
        std::vec![
            fmt(PCM, 1, 48_000, 16),
            chunk(b"data", &std::vec![0; frames * 2])
        ]
    }

    #[test]
    fn every_accepted_format_parses() {
        for encoding in [
            Encoding::Int16,
            Encoding::Int24,
            Encoding::Int32,
            Encoding::Float32,
        ] {
            for channels in [1, 2] {
                let file = sine(440.0, 1.0, 44_100, encoding, channels);

                let header = read(&file).unwrap();

                assert_eq!(
                    header.format,
                    Format {
                        channels,
                        rate: 44_100,
                        encoding
                    }
                );
                assert_eq!(header.frames, 44_100);
                assert_eq!(header.data_at, 44);
                assert_eq!(header.root, None);
                assert_eq!(header.loop_points, None);
                assert_eq!(header.ours, None);
            }
        }
    }

    #[test]
    fn extensible_reads_as_its_subformat() {
        let data = chunk(b"data", &[0; 24]);

        let pcm = riff(&[extensible(PCM, 2, 96_000, 24), data.clone()]);
        let float = riff(&[extensible(FLOAT, 1, 22_050, 32), data.clone()]);
        let other = riff(&[extensible(2, 1, 22_050, 32), data]);

        let pcm = read(&pcm).unwrap();
        assert_eq!(
            pcm.format,
            Format {
                channels: 2,
                rate: 96_000,
                encoding: Encoding::Int24
            }
        );
        assert_eq!(pcm.frames, 4);
        let float = read(&float).unwrap();
        assert_eq!(
            float.format,
            Format {
                channels: 1,
                rate: 22_050,
                encoding: Encoding::Float32
            }
        );
        assert_eq!(float.frames, 6);
        assert_eq!(read(&other), None);
    }

    #[test]
    fn smpl_gives_the_root_and_the_first_loop() {
        let file = riff(&[
            fmt(PCM, 1, 48_000, 16),
            smpl(36, &[(1_000, 1_999), (5, 9)]),
            chunk(b"data", &[0; 4_000]),
        ]);

        let header = read(&file).unwrap();

        assert_eq!(header.root, Some(36));
        assert_eq!(header.loop_points, Some((1_000, 1_999)));
    }

    #[test]
    fn smpl_without_a_loop_or_a_note_gives_neither() {
        let without_loop = riff(&[
            fmt(PCM, 1, 48_000, 16),
            smpl(60, &[]),
            chunk(b"data", &[0; 4_000]),
        ]);
        let without_note = riff(&[
            fmt(PCM, 1, 48_000, 16),
            smpl(128, &[(0, 9)]),
            chunk(b"data", &[0; 4_000]),
        ]);

        let without_loop = read(&without_loop).unwrap();
        let without_note = read(&without_note).unwrap();

        assert_eq!(
            (without_loop.root, without_loop.loop_points),
            (Some(60), None)
        );
        assert_eq!(
            (without_note.root, without_note.loop_points),
            (None, Some((0, 9)))
        );
    }

    #[test]
    fn a_loop_outside_the_audio_is_dropped() {
        for loop_points in [(5, 2_000), (9, 5)] {
            let file = riff(&[
                fmt(PCM, 1, 48_000, 16),
                smpl(60, &[loop_points]),
                chunk(b"data", &[0; 4_000]),
            ]);

            assert_eq!(read(&file).unwrap().loop_points, None);
        }
    }

    #[test]
    fn what_the_device_cannot_read_is_none() {
        let data = chunk(b"data", &[0; 400]);
        let unreadable = [
            ("8-bit", riff(&[fmt(PCM, 1, 48_000, 8), data.clone()])),
            ("3 channels", riff(&[fmt(PCM, 3, 48_000, 16), data.clone()])),
            (
                "no channels",
                riff(&[fmt(PCM, 0, 48_000, 16), data.clone()]),
            ),
            ("ADPCM", riff(&[fmt(2, 1, 48_000, 4), data.clone()])),
            (
                "64-bit float",
                riff(&[fmt(FLOAT, 1, 48_000, 64), data.clone()]),
            ),
            (
                "16-bit float",
                riff(&[fmt(FLOAT, 1, 48_000, 16), data.clone()]),
            ),
            ("999 Hz", riff(&[fmt(PCM, 1, 999, 16), data.clone()])),
            (
                "384,001 Hz",
                riff(&[fmt(PCM, 1, 384_001, 16), data.clone()]),
            ),
            ("no data chunk", riff(&[fmt(PCM, 1, 48_000, 16)])),
            ("no fmt chunk", riff(core::slice::from_ref(&data))),
            (
                "data before fmt",
                riff(&[data.clone(), fmt(PCM, 1, 48_000, 16)]),
            ),
            ("zero frames", riff(&mono_16_bit(0))),
            (
                "less than a frame",
                riff(&[fmt(PCM, 2, 48_000, 16), chunk(b"data", &[0; 3])]),
            ),
            (
                "fmt after 64 KB",
                riff(&[
                    chunk(b"junk", &[0; 70_000]),
                    fmt(PCM, 1, 48_000, 16),
                    data.clone(),
                ]),
            ),
            ("no RIFF", b"RIFX\0\0\0\0WAVE".to_vec()),
            ("no WAVE", b"RIFF\0\0\0\0AVI ".to_vec()),
            ("empty", Vec::new()),
        ];

        for (name, file) in unreadable {
            assert_eq!(read(&file), None, "{name}");
        }
    }

    #[test]
    fn the_rates_at_both_ends_are_accepted() {
        for rate in [1_000, 384_000] {
            let file = riff(&[fmt(PCM, 1, rate, 16), chunk(b"data", &[0; 400])]);

            assert_eq!(read(&file).unwrap().format.rate, rate);
        }
    }

    #[test]
    fn a_data_chunk_longer_than_the_file_is_cut_to_whole_frames() {
        for claimed in [1_000, u32::MAX] {
            let mut file = riff(&[fmt(PCM, 2, 48_000, 16)]);
            file.extend_from_slice(b"data");
            file.extend_from_slice(&claimed.to_le_bytes());
            file.extend_from_slice(&[0; 11]);

            let header = read(&file).unwrap();

            assert_eq!(header.frames, 2);
            assert_eq!(header.data_at, file.len() as u64 - 11);
        }
    }

    #[test]
    fn a_data_chunk_shorter_than_the_file_keeps_its_own_length() {
        let mut file = riff(&mono_16_bit(10));
        file.extend_from_slice(&chunk(b"LIST", &[0; 100]));

        assert_eq!(read(&file).unwrap().frames, 10);
    }

    #[test]
    fn chunks_are_walked_past_their_pad_byte() {
        let file = riff(&[
            chunk(b"junk", &[1, 2, 3]),
            fmt(PCM, 1, 48_000, 16),
            chunk(b"junk", &[]),
            chunk(b"data", &[0; 20]),
        ]);

        let header = read(&file).unwrap();

        assert_eq!(header.frames, 10);
        assert_eq!(header.data_at, file.len() as u64 - 20);
    }

    #[test]
    fn a_chunk_that_claims_more_than_exists_is_none() {
        for claimed in [100, u32::MAX, u32::MAX - 1] {
            let mut file = riff(&[]);
            file.extend_from_slice(b"junk");
            file.extend_from_slice(&claimed.to_le_bytes());
            file.extend_from_slice(&fmt(PCM, 1, 48_000, 16));
            file.extend_from_slice(&chunk(b"data", &[0; 20]));

            assert_eq!(read(&file), None, "{claimed}");
        }
    }

    #[test]
    fn a_file_cut_short_anywhere_is_none_without_panicking() {
        let file = sine(440.0, 0.001, 44_100, Encoding::Int16, 1);
        let header_end = 44;

        for end in 0..file.len() {
            assert_eq!(
                parse(&file[..end], file.len() as u64).is_some(),
                end >= header_end,
                "{end}"
            );
        }
    }

    #[test]
    fn decode_scales_to_plus_minus_one() {
        let mut out = [9.0; 2];

        decode(Encoding::Int16, &[0x00, 0x80, 0xFF, 0x7F], &mut out);
        assert_eq!(out, [-1.0, 32_767.0 / 32_768.0]);

        decode(
            Encoding::Int24,
            &[0x00, 0x00, 0x80, 0xFF, 0xFF, 0x7F],
            &mut out,
        );
        assert_eq!(out, [-1.0, 8_388_607.0 / 8_388_608.0]);

        decode(
            Encoding::Int32,
            &[0x00, 0x00, 0x00, 0x80, 0x00, 0x00, 0x00, 0x40],
            &mut out,
        );
        assert_eq!(out, [-1.0, 0.5]);

        let floats = [0.25f32, f32::NAN, f32::INFINITY, -2.0];
        let bytes: Vec<u8> = floats.iter().flat_map(|f| f.to_le_bytes()).collect();
        let mut out = [9.0; 4];
        decode(Encoding::Float32, &bytes, &mut out);
        assert_eq!(out, [0.25, 0.0, 0.0, -2.0]);
    }

    #[test]
    fn decode_stops_at_the_shorter_of_the_bytes_and_the_output() {
        let mut out = [9.0; 3];

        decode(Encoding::Int16, &[0, 0, 0, 0, 0], &mut out);

        assert_eq!(out, [0.0, 0.0, 9.0]);
    }

    #[test]
    fn the_root_comes_from_the_end_of_the_name() {
        assert_eq!(root_from_name("Bass_C2"), Some(36));
        assert_eq!(root_from_name("pad A#3"), Some(58));
        assert_eq!(root_from_name("Lead Db4"), Some(61));
        assert_eq!(root_from_name("C4 loop 2"), Some(60));
        assert_eq!(root_from_name("G9"), Some(127));
        assert_eq!(root_from_name("G#9"), None);
        assert_eq!(root_from_name("kick"), None);
    }

    #[test]
    fn the_last_note_in_the_name_wins() {
        assert_eq!(root_from_name("C2-E3.wav"), Some(52));
        assert_eq!(root_from_name("bass.c1.wav"), Some(24));
        assert_eq!(root_from_name("a b C0"), Some(12));
        assert_eq!(root_from_name("Cb0"), Some(11));
        assert_eq!(root_from_name("H4 C10 4"), None);
        assert_eq!(root_from_name(""), None);
    }

    #[test]
    fn our_header_reads_back() {
        for (original, loop_points) in [
            ("kick.wav", None),
            ("snare drum.wav", Some((10, 900))),
            ("žluťoučký kůň.wav", Some((0, 999))),
        ] {
            let ours = Ours {
                fingerprint: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
                original: {
                    let mut label = Label::new();
                    label.push_str(original);
                    label
                },
            };
            let mut out = [0xEE; 600];

            let written = write_header(&mut out, 2, 1_000, 72, loop_points, &ours);
            let file_bytes = written as u64 + 1_000 * 2 * 2;

            assert!(written <= 512);
            assert_eq!(&out[written..], &[0xEE; 600][written..]);
            assert_eq!(
                parse(&out[..written], file_bytes),
                Some(Header {
                    format: Format {
                        channels: 2,
                        rate: 48_000,
                        encoding: Encoding::Int16
                    },
                    data_at: written as u64,
                    frames: 1_000,
                    root: Some(72),
                    loop_points,
                    ours: Some(ours),
                })
            );
            assert_eq!(
                u32::from_le_bytes(out[4..8].try_into().unwrap()) as u64,
                file_bytes - 8
            );
        }
    }

    #[test]
    fn the_longest_header_fits_512_bytes() {
        let mut original = Label::new();
        original.push_str(&"a".repeat(255));
        let ours = Ours {
            fingerprint: [0; 16],
            original,
        };
        let mut out = [0; 512];

        let written = write_header(&mut out, 1, 5, 60, Some((1, 2)), &ours);

        assert!(written <= 512);
        assert_eq!(
            parse(&out[..written], written as u64 + 10)
                .unwrap()
                .ours
                .unwrap()
                .original
                .as_str()
                .len(),
            255
        );
    }

    #[test]
    fn the_chunks_of_our_header_come_in_the_promised_order() {
        let ours = Ours {
            fingerprint: [7; 16],
            original: Label::new(),
        };
        let mut out = [0; 512];

        let written = write_header(&mut out, 1, 5, 60, None, &ours);

        // fmt at 12 (24 bytes), gbox at 36 (8 + 19 + 0 + 1 pad), smpl at 64 (8 + 36), data at 108.
        assert_eq!(&out[12..16], b"fmt ");
        assert_eq!(&out[36..40], b"gbox");
        assert_eq!(&out[64..68], b"smpl");
        assert_eq!(&out[108..112], b"data");
        assert_eq!(written, 116);
    }

    #[test]
    fn a_gbox_chunk_that_is_not_ours_is_not_read() {
        let ours = Ours {
            fingerprint: [7; 16],
            original: {
                let mut label = Label::new();
                label.push_str("kick.wav");
                label
            },
        };
        let mut out = [0; 512];
        let written = write_header(&mut out, 1, 5, 60, None, &ours);

        // The chunk's body starts at 44: the format, 1 byte, the fingerprint, the name's length at 62.
        for (at, value) in [(44, 2), (62, 255), (63, 0xFF)] {
            let mut damaged = out;
            damaged[at] = value;

            assert_eq!(
                parse(&damaged[..written], written as u64 + 10)
                    .unwrap()
                    .ours,
                None,
                "{at}"
            );
        }
    }

    #[test]
    fn sine_makes_the_same_file_every_time_with_headroom() {
        let file = sine(1_000.0, 0.01, 48_000, Encoding::Int16, 1);

        assert_eq!(file, sine(1_000.0, 0.01, 48_000, Encoding::Int16, 1));
        let mut samples = [0.0; 480];
        decode(Encoding::Int16, &file[44..], &mut samples);
        let peak = samples
            .iter()
            .fold(0.0f32, |peak, sample| peak.max(sample.abs()));
        assert!((0.49..=0.5).contains(&peak), "{peak}");
    }

    #[test]
    fn sine_pads_an_odd_data_chunk() {
        let file = sine(440.0, 0.005, 1_000, Encoding::Int24, 1);

        assert_eq!(file.len(), 44 + 15 + 1);
        assert_eq!(read(&file).unwrap().frames, 5);
    }
}
