use super::view::Screen;
use crate::input::STEPS;
use crate::param::{
    ATTACK, CHOKE_GROUP, CUTOFF, DECAY, END, ENVELOPE_AMOUNT, Entry, FILTER_ATTACK, FILTER_DECAY,
    FILTER_RELEASE, FILTER_SUSTAIN, FILTER_TYPE, FILTER_VELOCITY, FINE_TUNE, GLIDE, GLIDE_TIME,
    KEY_FOLLOW, LEVEL, LOOP, LOOP_END, LOOP_START, MODE, NOISE_LEVEL, OSCILLATOR_2_FINE_TUNE,
    OSCILLATOR_2_INTERVAL, OSCILLATOR_2_LEVEL, PAN, PLAY_MODE, ParamId, RELEASE, RESONANCE,
    REVERSE, ROOT_NOTE, SHAPE, SPREAD, START, SUB_LEVEL, SUSTAIN, TRANSPOSE, TRIGGER, VELOCITY,
    VOLUME_VELOCITY, WAVE,
};
use crate::project::pool::{Engine, Sound};

/// What an item of a page is.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ItemKind {
    /// A value of the master list.
    Param(ParamId),
    /// The Pad page's Sound: the selected pad's sound, which OK changes in the sound picker.
    PadSound,
    /// The Pad page's Copy: how many pads use the selected pad's sound. OK gives the pad its own
    /// copy of it.
    PadCopy,
    /// The Pad page's Engine: the selected sound's engine, which OK changes in the Engine picker.
    PadEngine,
    /// The Sample page's Sample: the name of the sound's file, which OK changes in the sample
    /// picker.
    SampleFile,
    /// "Library": how much of the sample RAM the library takes, in text and in its bar. It is not
    /// set.
    LibraryMeter,
}

/// An item of a page and the encoder that holds it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ItemDef {
    pub kind: ItemKind,
    /// The encoder's index, 0 to 3, as encoder inputs count them. The page and the strip show its
    /// number, 1 to 4.
    pub encoder: Option<u8>,
}

/// A picture that a page shows at the right of its items.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Picture {
    /// The current track's 12 pads, each with its sound's name.
    Pads,
    /// The peaks of the sound's file about a faint middle line, with its Start and End marks.
    Waveform,
    /// The filter's response at its mode, cutoff and resonance, with a faint line at the cutoff.
    FilterCurve,
    /// The shape of an envelope, from its four entries.
    Envelope {
        attack: ParamId,
        decay: ParamId,
        sustain: ParamId,
        release: ParamId,
    },
}

/// A page of a screen: its name, its items from the top and its picture, where one helps.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PageDef {
    pub name: &'static str,
    pub items: &'static [ItemDef],
    pub picture: Option<Picture>,
}

/// The screen that MENU + each step shows, for the screens that exist so far.
pub const MENU: [Option<Screen>; STEPS as usize] = {
    let mut menu = [None; STEPS as usize];
    menu[0] = Some(Screen::Step);
    menu[2] = Some(Screen::Sound);
    menu[7] = Some(Screen::Settings);
    menu[9] = Some(Screen::Samples);
    menu
};

/// The library meter, which no encoder holds: the Dev page's item and SAMPLES' above the strip.
pub const LIBRARY_METER: ItemDef = ItemDef {
    kind: ItemKind::LibraryMeter,
    encoder: None,
};

/// The Pad page's Sound, on encoder 1.
const PAD_SOUND: ItemDef = ItemDef {
    kind: ItemKind::PadSound,
    encoder: Some(0),
};
/// The Pad page's Copy, on encoder 2.
const PAD_COPY: ItemDef = ItemDef {
    kind: ItemKind::PadCopy,
    encoder: Some(1),
};
/// The Pad page's Engine, on encoder 3.
const PAD_ENGINE: ItemDef = ItemDef {
    kind: ItemKind::PadEngine,
    encoder: Some(2),
};

/// The value `entry` as an item, on encoder `encoder` where it has one.
const fn item(entry: Entry, encoder: Option<u8>) -> ItemDef {
    ItemDef {
        kind: ItemKind::Param(entry.id),
        encoder,
    }
}

/// The Pad page while the selected pad has a sound.
const PAD: PageDef = PageDef {
    name: "Pad",
    items: &[PAD_SOUND, PAD_COPY, PAD_ENGINE],
    picture: Some(Picture::Pads),
};
const SAMPLE: PageDef = PageDef {
    name: "Sample",
    items: &[
        ItemDef {
            kind: ItemKind::SampleFile,
            encoder: Some(0),
        },
        item(START, Some(1)),
        item(END, Some(2)),
        item(LOOP, Some(3)),
        item(LOOP_START, None),
        item(LOOP_END, None),
        item(REVERSE, None),
        item(ROOT_NOTE, None),
    ],
    picture: Some(Picture::Waveform),
};
const SYNTH: PageDef = PageDef {
    name: Engine::Synth.page_name(),
    items: &[
        item(WAVE, Some(0)),
        item(SHAPE, Some(1)),
        item(SPREAD, Some(2)),
        item(SUB_LEVEL, Some(3)),
        item(NOISE_LEVEL, None),
        item(OSCILLATOR_2_LEVEL, None),
        item(OSCILLATOR_2_INTERVAL, None),
        item(OSCILLATOR_2_FINE_TUNE, None),
    ],
    picture: None,
};
const FILTER: PageDef = PageDef {
    name: "Filter",
    items: &[
        item(MODE, Some(0)),
        item(CUTOFF, Some(1)),
        item(RESONANCE, Some(2)),
        item(ENVELOPE_AMOUNT, Some(3)),
        item(KEY_FOLLOW, None),
        item(FILTER_VELOCITY, None),
        item(FILTER_TYPE, None),
    ],
    picture: Some(Picture::FilterCurve),
};
const FILTER_ENVELOPE: PageDef = PageDef {
    name: "Filter envelope",
    items: &[
        item(FILTER_ATTACK, Some(0)),
        item(FILTER_DECAY, Some(1)),
        item(FILTER_SUSTAIN, Some(2)),
        item(FILTER_RELEASE, Some(3)),
    ],
    picture: Some(Picture::Envelope {
        attack: FILTER_ATTACK.id,
        decay: FILTER_DECAY.id,
        sustain: FILTER_SUSTAIN.id,
        release: FILTER_RELEASE.id,
    }),
};
const VOLUME_ENVELOPE: PageDef = PageDef {
    name: "Volume envelope",
    items: &[
        item(ATTACK, Some(0)),
        item(DECAY, Some(1)),
        item(SUSTAIN, Some(2)),
        item(RELEASE, Some(3)),
        item(VOLUME_VELOCITY, None),
        item(LEVEL, None),
        item(PAN, None),
    ],
    picture: Some(Picture::Envelope {
        attack: ATTACK.id,
        decay: DECAY.id,
        sustain: SUSTAIN.id,
        release: RELEASE.id,
    }),
};
const VOICE: PageDef = PageDef {
    name: "Voice",
    items: &[
        item(PLAY_MODE, Some(0)),
        item(GLIDE_TIME, Some(1)),
        item(GLIDE, Some(2)),
        item(TRIGGER, Some(3)),
        item(CHOKE_GROUP, None),
        item(TRANSPOSE, None),
        item(FINE_TUNE, None),
    ],
    picture: None,
};

/// The pages of `screen` in the order of their steps under PAGE, while `sound` is the selected
/// sound of the current track. STEP has none of its own: PAGE there acts on SOUND's pages. SAMPLES
/// has none.
///
/// SOUND works on the track's selected pad: its Pad page, then the page of the sound's engine
/// (Sample or Synth) and the pages of its chain and its voice. While that pad is empty there is no
/// sound to copy or to shape, and SOUND has only the Pad page with its Sound item.
pub fn pages(screen: Screen, sound: Option<&Sound>) -> &'static [PageDef] {
    match screen {
        Screen::Step | Screen::Samples => &[],
        Screen::Sound => match sound.map(|sound| &sound.engine) {
            Some(Engine::Sample(_)) => {
                &[PAD, SAMPLE, FILTER, FILTER_ENVELOPE, VOLUME_ENVELOPE, VOICE]
            }
            Some(Engine::Synth) => &[PAD, SYNTH, FILTER, FILTER_ENVELOPE, VOLUME_ENVELOPE, VOICE],
            None => &[PageDef {
                items: &[PAD_SOUND],
                ..PAD
            }],
        },
        Screen::Settings => &[
            PageDef {
                name: "Playing",
                items: &[ItemDef {
                    kind: ItemKind::Param(VELOCITY.id),
                    encoder: Some(0),
                }],
                picture: None,
            },
            PageDef {
                name: "Dev",
                items: &[LIBRARY_METER],
                picture: None,
            },
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::label::Label;
    use crate::library::FileId;
    use crate::project::pool::{SOUND_DEFAULTS, Sample, SoundNumber};

    #[test]
    fn each_encoder_holds_at_most_one_item_of_a_page() {
        let synth = Sound {
            number: SoundNumber(1),
            name: Label::new(),
            engine: Engine::Synth,
            values: SOUND_DEFAULTS,
        };
        let sample = Sound {
            engine: Engine::Sample(Sample::File(FileId(0))),
            ..synth
        };
        for (screen, sound) in Screen::ALL.into_iter().flat_map(|screen| {
            [
                (screen, None),
                (screen, Some(&synth)),
                (screen, Some(&sample)),
            ]
        }) {
            for page in pages(screen, sound) {
                for encoder in 0..4 {
                    let holding = page
                        .items
                        .iter()
                        .filter(|item| item.encoder == Some(encoder));
                    assert!(holding.count() <= 1, "{} encoder {encoder}", page.name);
                }
                assert!(
                    page.items
                        .iter()
                        .all(|item| item.encoder.is_none_or(|encoder| encoder < 4)),
                    "{}",
                    page.name
                );
            }
        }
    }
}
