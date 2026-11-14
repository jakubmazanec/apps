use groovebox_core::audio::MAX_BATCH;
use groovebox_core::input::{Button, ENCODERS, Input, PADS, Stamped};
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

/// A decimal byte from `low` to `high`, called `name` in the error.
fn byte(number: usize, name: &str, word: &str, low: u8, high: u8) -> Result<u8, String> {
    let value = decimal(number, word)?;
    if (low..=high).contains(&value) {
        Ok(value)
    } else {
        Err(format!(
            "line {number}: {name} {value} is not from {low} to {high}"
        ))
    }
}

fn pad(number: usize, word: &str) -> Result<u8, String> {
    byte(number, "pad", word, 0, PADS - 1)
}

fn velocity(number: usize, word: &str) -> Result<u8, String> {
    byte(number, "velocity", word, 1, 127)
}

fn pressure(number: usize, word: &str) -> Result<u8, String> {
    byte(number, "pressure", word, 0, 127)
}

fn note(number: usize, word: &str) -> Result<u8, String> {
    byte(number, "note", word, 0, 127)
}

/// The scene names of the function buttons, at the index of their code.
const FUNCTION_NAMES: [&str; 22] = [
    "t1",
    "t2",
    "t3",
    "t4",
    "pads-keys",
    "roll",
    "menu",
    "page",
    "copy",
    "shift",
    "rec",
    "play",
    "stop",
    "tempo",
    "up",
    "down",
    "left",
    "right",
    "ok",
    "cancel",
    "minus",
    "plus",
];

const STEP_NAMES: [&str; 16] = [
    "step-1", "step-2", "step-3", "step-4", "step-5", "step-6", "step-7", "step-8", "step-9",
    "step-10", "step-11", "step-12", "step-13", "step-14", "step-15", "step-16",
];

const PUSH_NAMES: [&str; 4] = ["push-1", "push-2", "push-3", "push-4"];

const ENCODER_NAMES: [&str; ENCODERS as usize] =
    ["encoder-1", "encoder-2", "encoder-3", "encoder-4", "volume"];

/// The name of a button in a scene. Panics for a step or a push that does not exist.
pub fn button_name(button: Button) -> &'static str {
    match button {
        Button::Step(step) => STEP_NAMES[usize::from(step)],
        Button::Push(push) => PUSH_NAMES[usize::from(push)],
        function => FUNCTION_NAMES[usize::from(function.code())],
    }
}

/// The button that a scene calls `name`.
pub fn button_from_name(name: &str) -> Option<Button> {
    (0..=u8::MAX)
        .filter_map(Button::from_code)
        .find(|&button| button_name(button) == name)
}

fn button(number: usize, word: &str) -> Result<Button, String> {
    button_from_name(word).ok_or_else(|| format!("line {number}: `{word}` is not a button"))
}

fn encoder(number: usize, word: &str) -> Result<u8, String> {
    ENCODER_NAMES
        .iter()
        .position(|&name| name == word)
        .map(|encoder| encoder as u8)
        .ok_or_else(|| format!("line {number}: `{word}` is not an encoder"))
}

fn clicks(number: usize, word: &str) -> Result<i8, String> {
    let clicks: i32 = decimal(number, word)?;
    match i8::try_from(clicks) {
        Ok(clicks) if clicks != 0 && clicks != i8::MIN => Ok(clicks),
        _ => Err(format!(
            "line {number}: clicks {clicks} are not from -127 to 127, except 0"
        )),
    }
}

/// Parses a scene file. Besides the shape of each line, it checks the header, the ranges of the
/// values of inputs, that `end` comes once and last, that `expect-audio` is at the end and that
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
            ["input", sample, "pad-hit", pad_word, velocity_word] => SceneLine::Input(Stamped {
                sample: decimal(number, sample)?,
                input: Input::PadHit {
                    pad: pad(number, pad_word)?,
                    velocity: velocity(number, velocity_word)?,
                },
            }),
            ["input", sample, "pad-release", pad_word] => SceneLine::Input(Stamped {
                sample: decimal(number, sample)?,
                input: Input::PadRelease {
                    pad: pad(number, pad_word)?,
                },
            }),
            ["input", sample, "pad-pressure", pad_word, pressure_word] => {
                SceneLine::Input(Stamped {
                    sample: decimal(number, sample)?,
                    input: Input::PadPressure {
                        pad: pad(number, pad_word)?,
                        pressure: pressure(number, pressure_word)?,
                    },
                })
            }
            ["input", sample, "press", name] => SceneLine::Input(Stamped {
                sample: decimal(number, sample)?,
                input: Input::ButtonPress {
                    button: button(number, name)?,
                },
            }),
            ["input", sample, "release", name] => SceneLine::Input(Stamped {
                sample: decimal(number, sample)?,
                input: Input::ButtonRelease {
                    button: button(number, name)?,
                },
            }),
            ["input", sample, "turn", name, clicks_word] => SceneLine::Input(Stamped {
                sample: decimal(number, sample)?,
                input: Input::EncoderTurn {
                    encoder: encoder(number, name)?,
                    clicks: clicks(number, clicks_word)?,
                },
            }),
            ["input", sample, "note-on", note_word, velocity_word] => SceneLine::Input(Stamped {
                sample: decimal(number, sample)?,
                input: Input::NoteOn {
                    note: note(number, note_word)?,
                    velocity: velocity(number, velocity_word)?,
                },
            }),
            ["input", sample, "note-off", note_word] => SceneLine::Input(Stamped {
                sample: decimal(number, sample)?,
                input: Input::NoteOff {
                    note: note(number, note_word)?,
                },
            }),
            ["input", sample, "note-pressure", note_word, pressure_word] => {
                SceneLine::Input(Stamped {
                    sample: decimal(number, sample)?,
                    input: Input::NotePressure {
                        note: note(number, note_word)?,
                        pressure: pressure(number, pressure_word)?,
                    },
                })
            }
            ["input", sample, "channel-pressure", pressure_word] => SceneLine::Input(Stamped {
                sample: decimal(number, sample)?,
                input: Input::ChannelPressure {
                    pressure: pressure(number, pressure_word)?,
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
    use groovebox_core::input::VOLUME;

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
    fn every_input_line_parses() {
        let input = |input| SceneLine::Input(Stamped { sample: 64, input });
        for (line, expected) in [
            (
                "pad-hit 3 100",
                Input::PadHit {
                    pad: 3,
                    velocity: 100,
                },
            ),
            ("pad-release 3", Input::PadRelease { pad: 3 }),
            (
                "pad-pressure 11 0",
                Input::PadPressure {
                    pad: 11,
                    pressure: 0,
                },
            ),
            (
                "press menu",
                Input::ButtonPress {
                    button: Button::Menu,
                },
            ),
            (
                "release step-16",
                Input::ButtonRelease {
                    button: Button::Step(15),
                },
            ),
            (
                "press push-1",
                Input::ButtonPress {
                    button: Button::Push(0),
                },
            ),
            (
                "turn encoder-4 -127",
                Input::EncoderTurn {
                    encoder: 3,
                    clicks: -127,
                },
            ),
            (
                "turn volume 1",
                Input::EncoderTurn {
                    encoder: VOLUME,
                    clicks: 1,
                },
            ),
            (
                "note-on 127 1",
                Input::NoteOn {
                    note: 127,
                    velocity: 1,
                },
            ),
            ("note-off 0", Input::NoteOff { note: 0 }),
            (
                "note-pressure 60 127",
                Input::NotePressure {
                    note: 60,
                    pressure: 127,
                },
            ),
            ("channel-pressure 0", Input::ChannelPressure { pressure: 0 }),
        ] {
            assert_eq!(
                parse(&format!("groovebox-scene 1\ninput 64 {line}\nend 128")),
                Ok(vec![input(expected), SceneLine::End(128)]),
                "{line}"
            );
        }
    }

    #[test]
    fn every_button_name_round_trips() {
        for code in 0..=u8::MAX {
            if let Some(button) = Button::from_code(code) {
                assert_eq!(button_from_name(button_name(button)), Some(button));
            }
        }
        assert_eq!(button_name(Button::PadsKeys), "pads-keys");
        assert_eq!(button_name(Button::Step(0)), "step-1");
        assert_eq!(button_name(Button::Push(3)), "push-4");
        assert_eq!(button_from_name("step-17"), None);
        assert_eq!(button_from_name("encoder-1"), None);
    }

    #[test]
    fn bad_input_lines_name_their_line() {
        for line in [
            "press step-17",
            "press push-5",
            "press volume",
            "turn encoder-1 0",
            "turn encoder-5 1",
            "turn volume 128",
            "turn volume -128",
            "pad-pressure 12 0",
            "pad-pressure 0 128",
            "note-on 128 1",
            "note-on 0 0",
            "note-on 0 128",
            "note-off 128",
            "note-pressure 128 0",
            "note-pressure 0 128",
            "channel-pressure 128",
        ] {
            let error =
                parse(&format!("groovebox-scene 1\ninput 0 {line}\nend 128")).expect_err(line);
            assert!(error.contains("line 2"), "{line}: {error}");
        }
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
