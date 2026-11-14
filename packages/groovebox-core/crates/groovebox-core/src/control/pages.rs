use super::view::Screen;
use crate::input::STEPS;
use crate::param::{ParamId, VELOCITY};
use crate::project::track::Track;

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
    menu
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

/// The pages of `screen` in the order of their steps under PAGE, while `track` is the current
/// track. STEP has none of its own: PAGE there acts on SOUND's pages.
///
/// SOUND's Pad page works on the track's selected pad. While that pad is empty there is no sound
/// to copy, and the page shows only its Sound item.
pub fn pages(screen: Screen, track: &Track) -> &'static [PageDef] {
    match screen {
        Screen::Step => &[],
        Screen::Sound => match track.selected_sound {
            Some(_) => &[PageDef {
                name: "Pad",
                items: &[PAD_SOUND, PAD_COPY],
                picture: Some(Picture::Pads),
            }],
            None => &[PageDef {
                name: "Pad",
                items: &[PAD_SOUND],
                picture: Some(Picture::Pads),
            }],
        },
        Screen::Settings => &[PageDef {
            name: "Playing",
            items: &[ItemDef {
                kind: ItemKind::Param(VELOCITY.id),
                encoder: Some(0),
            }],
            picture: None,
        }],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::pool::SoundNumber;

    #[test]
    fn each_encoder_holds_at_most_one_item_of_a_page() {
        let mut with_a_sound = Track::new();
        with_a_sound.put(0, Some(SoundNumber(1)));
        for (screen, track) in Screen::ALL
            .into_iter()
            .flat_map(|screen| [(screen, Track::new()), (screen, with_a_sound)])
        {
            for page in pages(screen, &track) {
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
