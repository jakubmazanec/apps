use super::view::Screen;
use crate::input::STEPS;
use crate::param::{ParamId, VELOCITY};

/// What an item of a page is.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ItemKind {
    /// A value of the master list.
    Param(ParamId),
}

/// An item of a page and the encoder that holds it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ItemDef {
    pub kind: ItemKind,
    /// The encoder's index, 0 to 3, as encoder inputs count them. The page and the strip show its
    /// number, 1 to 4.
    pub encoder: Option<u8>,
}

/// A page of a screen: its name and its items from the top.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PageDef {
    pub name: &'static str,
    pub items: &'static [ItemDef],
}

/// The screen that MENU + each step shows, for the screens that exist so far.
pub const MENU: [Option<Screen>; STEPS as usize] = {
    let mut menu = [None; STEPS as usize];
    menu[0] = Some(Screen::Step);
    menu[7] = Some(Screen::Settings);
    menu
};

/// The pages of `screen` in the order of their steps under PAGE. STEP has none of its own: PAGE
/// there acts on SOUND's pages.
pub fn pages(screen: Screen) -> &'static [PageDef] {
    match screen {
        Screen::Step | Screen::Sound => &[],
        Screen::Settings => &[PageDef {
            name: "Playing",
            items: &[ItemDef {
                kind: ItemKind::Param(VELOCITY.id),
                encoder: Some(0),
            }],
        }],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_encoder_holds_at_most_one_item_of_a_page() {
        for screen in [Screen::Step, Screen::Sound, Screen::Settings] {
            for page in pages(screen) {
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
