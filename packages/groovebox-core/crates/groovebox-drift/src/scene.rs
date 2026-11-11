use groovebox_core::audio::MAX_BATCH;
use groovebox_core::input::{Input, PADS, Stamped};
use std::any::type_name;
use std::str::FromStr;

/// One item of a scene file: see "Shared formats" in the foundation plan.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SceneLine {
    Input(Stamped),
    Step(u64),
    Applied { number: u32, sample: u64 },
    Frame(u64),
    ExpectAudio { sample: u64, fingerprint: u64 },
    End(u64),
}

fn decimal<T: FromStr>(number: usize, word: &str) -> Result<T, String> {
    word.parse().map_err(|_| {
        format!(
            "line {number}: `{word}` is not a decimal {}",
            type_name::<T>()
        )
    })
}

fn pad(number: usize, word: &str) -> Result<u8, String> {
    let pad = decimal(number, word)?;
    if pad < PADS {
        Ok(pad)
    } else {
        Err(format!(
            "line {number}: pad {pad} is not from 0 to {}",
            PADS - 1
        ))
    }
}

/// Parses a scene file. Besides the shape of each line, it checks the header, the ranges of pads
/// and velocities, that `end` comes once and last, that `expect-audio` is at the end and that
/// each frame follows a step. Errors name the line.
pub fn parse(text: &str) -> Result<Vec<SceneLine>, String> {
    let mut items = text
        .lines()
        .zip(1..)
        .map(|(line, number)| (number, line.trim()))
        .filter(|(_, line)| !line.is_empty() && !line.starts_with('#'));
    match items.next() {
        Some((_, header)) if header.split_whitespace().eq(["groovebox-scene", "1"]) => {}
        item => {
            return Err(format!(
                "line {}: expected the header `groovebox-scene 1`",
                item.map_or(1, |(number, _)| number)
            ));
        }
    }
    let mut lines = Vec::new();
    for (number, item) in items {
        if let Some((_, SceneLine::End(_))) = lines.last() {
            return Err(format!("line {number}: nothing may follow `end`"));
        }
        let line = match item.split_whitespace().collect::<Vec<_>>()[..] {
            ["input", sample, "pad-hit", pad_word, velocity] => {
                let velocity = decimal(number, velocity)?;
                if !(1..=127).contains(&velocity) {
                    return Err(format!(
                        "line {number}: velocity {velocity} is not from 1 to 127"
                    ));
                }
                SceneLine::Input(Stamped {
                    sample: decimal(number, sample)?,
                    input: Input::PadHit {
                        pad: pad(number, pad_word)?,
                        velocity,
                    },
                })
            }
            ["input", sample, "pad-release", pad_word] => SceneLine::Input(Stamped {
                sample: decimal(number, sample)?,
                input: Input::PadRelease {
                    pad: pad(number, pad_word)?,
                },
            }),
            ["step", sample] => SceneLine::Step(decimal(number, sample)?),
            ["applied", message, sample] => SceneLine::Applied {
                number: decimal(number, message)?,
                sample: decimal(number, sample)?,
            },
            ["frame", sample] => SceneLine::Frame(decimal(number, sample)?),
            ["expect-audio", sample, fingerprint] => {
                if fingerprint.len() != 16
                    || !fingerprint
                        .bytes()
                        .all(|digit| matches!(digit, b'0'..=b'9' | b'a'..=b'f'))
                {
                    return Err(format!(
                        "line {number}: `{fingerprint}` is not 16 lowercase hex digits"
                    ));
                }
                SceneLine::ExpectAudio {
                    sample: decimal(number, sample)?,
                    fingerprint: u64::from_str_radix(fingerprint, 16)
                        .expect("16 hex digits fit in a u64"),
                }
            }
            ["end", sample] => SceneLine::End(decimal(number, sample)?),
            _ => return Err(format!("line {number}: unknown line `{item}`")),
        };
        lines.push((number, line));
    }
    let Some(&(_, SceneLine::End(end))) = lines.last() else {
        return Err(format!(
            "line {}: the scene has no `end`",
            text.lines().count()
        ));
    };
    let steps: Vec<u64> = lines
        .iter()
        .filter_map(|(_, line)| match *line {
            SceneLine::Step(sample) => Some(sample),
            _ => None,
        })
        .collect();
    for &(number, line) in &lines {
        match line {
            SceneLine::Frame(sample)
                if steps.is_empty()
                    && (sample == 0
                        || !sample.is_multiple_of(MAX_BATCH as u64)
                        || sample > end) =>
            {
                return Err(format!(
                    "line {number}: a frame in a scene without steps must be on a multiple of \
                    {MAX_BATCH} from {MAX_BATCH} to the end"
                ));
            }
            SceneLine::Frame(sample) if !steps.is_empty() && !steps.contains(&sample) => {
                return Err(format!("line {number}: the frame has no step at {sample}"));
            }
            SceneLine::ExpectAudio { sample, .. } if sample != end => {
                return Err(format!(
                    "line {number}: expect-audio is not at the end, {end}"
                ));
            }
            _ => {}
        }
    }
    Ok(lines.into_iter().map(|(_, line)| line).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_every_line_kind() {
        let text = "groovebox-scene 1\n# A comment.\n\ninput 100 pad-hit 0 127\n\
            input 300 pad-release 11\nstep 128\napplied 0 128\nframe 128\n\
            expect-audio 512 0123456789abcdef\nend 512\n";

        assert_eq!(
            parse(text),
            Ok(vec![
                SceneLine::Input(Stamped {
                    sample: 100,
                    input: Input::PadHit {
                        pad: 0,
                        velocity: 127
                    }
                }),
                SceneLine::Input(Stamped {
                    sample: 300,
                    input: Input::PadRelease { pad: 11 }
                }),
                SceneLine::Step(128),
                SceneLine::Applied {
                    number: 0,
                    sample: 128
                },
                SceneLine::Frame(128),
                SceneLine::ExpectAudio {
                    sample: 512,
                    fingerprint: 0x0123_4567_89ab_cdef
                },
                SceneLine::End(512),
            ])
        );
    }

    #[test]
    fn rejects_unknown_lines_with_their_number() {
        let error = parse("groovebox-scene 1\nbogus\nend 128").unwrap_err();

        assert!(error.contains("line 2"), "{error}");
    }

    #[test]
    fn rejects_an_implicit_frame_off_the_batch_grid() {
        assert!(parse("groovebox-scene 1\nframe 100\nend 128").is_err());
    }

    #[test]
    fn rejects_values_out_of_range_and_a_misplaced_header_or_end() {
        for (text, line) in [
            ("", "line 1"),
            ("groovebox-scene 2\nend 128", "line 1"),
            ("step 128\nend 128", "line 1"),
            (
                "groovebox-scene 1\ninput 0 pad-hit 12 127\nend 128",
                "line 2",
            ),
            ("groovebox-scene 1\ninput 0 pad-hit 0 0\nend 128", "line 2"),
            (
                "groovebox-scene 1\ninput 0 pad-hit 0 128\nend 128",
                "line 2",
            ),
            (
                "groovebox-scene 1\ninput 0 pad-release 12\nend 128",
                "line 2",
            ),
            (
                "groovebox-scene 1\nexpect-audio 128 0123456789ABCDEF\nend 128",
                "line 2",
            ),
            ("groovebox-scene 1\nexpect-audio 128 123\nend 128", "line 2"),
            (
                "groovebox-scene 1\nexpect-audio 64 0123456789abcdef\nend 128",
                "line 2",
            ),
            ("groovebox-scene 1\nstep 128", "line 2"),
            ("groovebox-scene 1\nend 128\nend 256", "line 3"),
            ("groovebox-scene 1\nend 128\nstep 128", "line 3"),
            ("groovebox-scene 1\nframe 0\nend 128", "line 2"),
            ("groovebox-scene 1\nframe 256\nend 128", "line 2"),
            ("groovebox-scene 1\nstep 128\nframe 256\nend 512", "line 3"),
        ] {
            let error = parse(text).expect_err(text);
            assert!(error.contains(line), "{text:?}: {error}");
        }
    }
}
