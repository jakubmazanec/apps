use super::view::Screen;
use crate::input::STEPS;
use crate::param::{
    ATTACK, CHOKE_GROUP, CUTOFF, DECAY, END, ENVELOPE_AMOUNT, Entry, FILTER_ATTACK, FILTER_DECAY,
    FILTER_RELEASE, FILTER_SUSTAIN, FILTER_TYPE, FILTER_VELOCITY, FINE_TUNE, GLIDE, GLIDE_TIME,
    KEY_FOLLOW, LEVEL, LOOP, LOOP_END, LOOP_START, MASTER_LEVEL, METRONOME, METRONOME_LEVEL, MODE,
    NOISE_LEVEL, OSCILLATOR_2_FINE_TUNE, OSCILLATOR_2_INTERVAL, OSCILLATOR_2_LEVEL, PAN, PLAY_MODE,
    ParamId, RELEASE, RESONANCE, REVERSE, ROOT_NOTE, SHAPE, SPREAD, START, SUB_LEVEL, SUSTAIN,
    TEMPO, TRANSPOSE, TRIGGER, VELOCITY, VOLUME_VELOCITY, WAVE,
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
    /// "Note memory": how much of the note memory the blocks in use take, in text and in its bar.
    /// It is not set.
    NoteMeter,
    /// "Grid": the length of a step, "1/16". Turns, - and + and OK leave it alone until it can
    /// change (S3).
    Grid,
    /// "Length": the current pattern's length, which OK changes in the Length picker (S10).
    Length,
    /// "Signature": the project's time signature, which OK changes in the Signature picker (S11).
    Signature,
    /// The NOTE strip's "Pitch": the held notes' pitches, by the Root note's names (S13).
    NotePitch,
    /// The NOTE strip's "Velocity": the held notes' velocities (S13).
    NoteVelocity,
    /// The NOTE strip's "Length": the held notes' lengths as fractions of a whole note (S13).
    NoteLength,
    /// The NOTE strip's "Position": how many grid steps the held notes lie from where their steps
    /// showed at their press (S13).
    NotePosition,
    /// MIX's "Track n": the level of track `n` (0 to 3). Its name says "muted" while the track is.
    TrackLevel(u8),
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
    menu[4] = Some(Screen::Mix);
    menu[5] = Some(Screen::Pool);
    menu[7] = Some(Screen::Settings);
    menu[8] = Some(Screen::Pattern);
    menu[9] = Some(Screen::Samples);
    menu
};

/// The library meter, which no encoder holds: the Dev page's item, POOL's and SAMPLES' above the
/// strip.
pub const LIBRARY_METER: ItemDef = ItemDef {
    kind: ItemKind::LibraryMeter,
    encoder: None,
};
/// The note memory meter, the Dev page's item under the library meter, which no encoder holds.
const NOTE_METER: ItemDef = ItemDef {
    kind: ItemKind::NoteMeter,
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
/// The Pad page of a sound selected on no pad, as POOL selects it: Engine alone (S10).
const NO_PAD: PageDef = PageDef {
    items: &[PAD_ENGINE],
    ..PAD
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

/// PATTERN's Timing page: Tempo on encoder 1 and Grid on 2 (S4).
pub(super) const TIMING: PageDef = PageDef {
    name: "Timing",
    items: &[
        item(TEMPO, Some(0)),
        ItemDef {
            kind: ItemKind::Grid,
            encoder: Some(1),
        },
    ],
    picture: None,
};

/// PATTERN's Bars page: Length on encoder 1 and Signature on 2 (S4).
const BARS: PageDef = PageDef {
    name: "Bars",
    items: &[
        ItemDef {
            kind: ItemKind::Length,
            encoder: Some(0),
        },
        ItemDef {
            kind: ItemKind::Signature,
            encoder: Some(1),
        },
    ],
    picture: None,
};

/// Track `track`'s level on the encoder of its number, as MIX holds it.
const fn track_level(track: u8) -> ItemDef {
    ItemDef {
        kind: ItemKind::TrackLevel(track),
        encoder: Some(track),
    }
}

/// MIX's one page, which has no name (S7): the four track levels on encoders 1 to 4, then the
/// master level, which no encoder holds.
const MIX: PageDef = PageDef {
    name: "",
    items: &[
        track_level(0),
        track_level(1),
        track_level(2),
        track_level(3),
        item(MASTER_LEVEL, None),
    ],
    picture: None,
};

/// The NOTE strip's items while steps are held (S12): Pitch, Velocity, Length and Position on
/// encoders 1 to 4.
pub(super) const NOTE: [ItemDef; 4] = [
    ItemDef {
        kind: ItemKind::NotePitch,
        encoder: Some(0),
    },
    ItemDef {
        kind: ItemKind::NoteVelocity,
        encoder: Some(1),
    },
    ItemDef {
        kind: ItemKind::NoteLength,
        encoder: Some(2),
    },
    ItemDef {
        kind: ItemKind::NotePosition,
        encoder: Some(3),
    },
];

/// SOUND's pages for a sound: `pad`, the page of its engine, then those of its chain and voice.
const fn sound_pages(pad: PageDef, engine: PageDef) -> [PageDef; 6] {
    [pad, engine, FILTER, FILTER_ENVELOPE, VOLUME_ENVELOPE, VOICE]
}

/// The pages of `screen` in the order of their steps under PAGE, while `sound` is the selected
/// sound of the current track and `pad` says whether the track has a selected pad. STEP has none
/// of its own: PAGE there acts on SOUND's pages. FX has none yet, and SAMPLES and POOL have none.
///
/// SOUND works on the track's selected pad: its Pad page, then the page of the sound's engine
/// (Sample or Synth) and the pages of its chain and its voice. While that pad is empty there is no
/// sound to copy or to shape, and SOUND has only the Pad page with its Sound item. A sound
/// selected on no pad has no pad to put a sound on or to copy to, so its Pad page holds Engine
/// alone, on encoder 3. PATTERN has its Timing and Bars pages and MIX its one page.
pub fn pages(screen: Screen, sound: Option<&Sound>, pad: bool) -> &'static [PageDef] {
    match screen {
        Screen::Step | Screen::Fx | Screen::Pool | Screen::Samples => &[],
        Screen::Mix => &[MIX],
        Screen::Sound => match (sound.map(|sound| &sound.engine), pad) {
            (Some(Engine::Sample(_)), true) => &const { sound_pages(PAD, SAMPLE) },
            (Some(Engine::Sample(_)), false) => &const { sound_pages(NO_PAD, SAMPLE) },
            (Some(Engine::Synth), true) => &const { sound_pages(PAD, SYNTH) },
            (Some(Engine::Synth), false) => &const { sound_pages(NO_PAD, SYNTH) },
            (None, _) => &[PageDef {
                items: &[PAD_SOUND],
                ..PAD
            }],
        },
        Screen::Settings => &[
            PageDef {
                name: "Playing",
                items: &[
                    ItemDef {
                        kind: ItemKind::Param(VELOCITY.id),
                        encoder: Some(0),
                    },
                    ItemDef {
                        kind: ItemKind::Param(METRONOME.id),
                        encoder: Some(1),
                    },
                    ItemDef {
                        kind: ItemKind::Param(METRONOME_LEVEL.id),
                        encoder: Some(2),
                    },
                ],
                picture: None,
            },
            PageDef {
                name: "Dev",
                items: &[LIBRARY_METER, NOTE_METER],
                picture: None,
            },
        ],
        Screen::Pattern => &[TIMING, BARS],
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
            notes: 0,
            on_tracks: [0; 4],
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
            for page in [true, false]
                .into_iter()
                .flat_map(|pad| pages(screen, sound, pad))
            {
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

    #[test]
    fn settings_playing_holds_velocity_metronome_and_its_level() {
        assert_eq!(
            pages(Screen::Settings, None, true)[0].items,
            [
                item(VELOCITY, Some(0)),
                item(METRONOME, Some(1)),
                item(METRONOME_LEVEL, Some(2)),
            ]
        );
    }

    #[test]
    fn the_pad_page_of_a_sound_on_no_pad_holds_engine_only() {
        let synth = Sound {
            number: SoundNumber(1),
            name: Label::new(),
            engine: Engine::Synth,
            values: SOUND_DEFAULTS,
            notes: 0,
            on_tracks: [0; 4],
        };
        let sample = Sound {
            engine: Engine::Sample(Sample::File(FileId(0))),
            ..synth
        };
        for sound in [&synth, &sample] {
            let on_a_pad = pages(Screen::Sound, Some(sound), true);
            let on_no_pad = pages(Screen::Sound, Some(sound), false);

            assert_eq!(
                on_no_pad[0],
                PageDef {
                    items: &[ItemDef {
                        kind: ItemKind::PadEngine,
                        encoder: Some(2),
                    }],
                    ..on_a_pad[0]
                }
            );
            // The other five pages stay.
            assert_eq!(on_no_pad[1..], on_a_pad[1..]);
        }
    }
}
