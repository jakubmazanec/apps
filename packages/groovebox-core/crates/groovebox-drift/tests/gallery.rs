//! The gallery's pictures of the font and the palette, drawn with the core's own code. They are
//! handled as the drift test handles the frames of a scene.

use groovebox_core::fingerprint::Fingerprint;
use groovebox_core::font::GLYPHS;
use groovebox_core::palette::{
    ACCENT, BACKGROUND, DIM, FAINT, LINE, NOTE_LOUD, NOTE_MID, NOTE_SOFT, PALETTE, RECORD,
    SHOWN_BAR, TEXT,
};
use groovebox_core::screen::{Canvas, Color, Screen, WIDTH};
use groovebox_core::ui::layout::{HEADER_ROW, MAIN_TOP, PIECE_GAP, ROW_PITCH, TEXT_INSET, rect};
use groovebox_core::ui::text;
use groovebox_drift::image::write_png;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

/// How far the pictures' first text lies from the left and the top.
const MARGIN: i32 = 4;
/// A text row: 13 pixels, with the capitals on its rows 3 to 9.
const ROW: i32 = 13;

/// The named entries of the palette and their names: the screen colours in the order of Look's
/// palette picture, then the background they are drawn on.
const ENTRIES: [(&str, Color); 11] = [
    ("text", TEXT),
    ("dim", DIM),
    ("faint", FAINT),
    ("line", LINE),
    ("shown bar", SHOWN_BAR),
    ("accent", ACCENT),
    ("record", RECORD),
    ("note soft", NOTE_SOFT),
    ("note mid", NOTE_MID),
    ("note loud", NOTE_LOUD),
    ("background", BACKGROUND),
];

/// Every glyph of the font in code-point order, in rows. A glyph's box may reach a column left of
/// its 6-pixel cell, as the space's does, or past it, as that of ™ does. So each glyph gets a slot
/// as wide as the boxes of all glyphs reach together, the slots are a pixel apart and every row is
/// a text row, which the 12-pixel cells do not fill: no two glyphs touch.
fn font() -> Box<Screen> {
    let left = GLYPHS
        .iter()
        .map(|glyph| i32::from(glyph.x))
        .min()
        .expect("the font has glyphs");
    let right = GLYPHS
        .iter()
        .map(|glyph| i32::from(glyph.x) + i32::from(glyph.width))
        .max()
        .expect("the font has glyphs");
    let pitch = right - left + 1;
    let per_row = (WIDTH as i32 - 2 * MARGIN) / pitch;
    let mut screen = Box::new(Screen::new());
    for (index, glyph) in (0..).zip(&GLYPHS) {
        screen.glyph(
            MARGIN - left + pitch * (index % per_row),
            MARGIN + ROW * (index / per_row),
            glyph,
            TEXT,
        );
    }
    screen
}

/// Every named entry of the palette as a swatch with its name, six to a row, as Look's palette
/// picture shows the screen colours: the title on the header's row and the rows of swatches from
/// the top of the main area, a picker's row apart. A swatch is a text row high, its colour inside a
/// `FAINT` outline, so the background's shows too, and its name is the next piece of the row.
fn palette() -> Box<Screen> {
    const SWATCH_WIDTH: i32 = 24;
    let mut screen = Box::new(Screen::new());
    text::draw(&mut *screen, MARGIN, HEADER_ROW, "Screen colours", DIM);
    for (y, entries) in (0..)
        .map(|row| MAIN_TOP + ROW_PITCH * row)
        .zip(ENTRIES.chunks(6))
    {
        let mut x = MARGIN;
        for &(name, color) in entries {
            screen.outline_rect(rect(x, y, SWATCH_WIDTH, ROW), FAINT);
            screen.fill_rect(rect(x + 1, y + 1, SWATCH_WIDTH - 2, ROW - 2), color);
            let name_x = x + SWATCH_WIDTH + TEXT_INSET;
            text::draw(&mut *screen, name_x, y, name, TEXT);
            x = name_x + text::width(name) + TEXT_INSET + PIECE_GAP;
        }
    }
    screen
}

#[test]
fn the_palette_picture_shows_every_named_entry() {
    let mut indices: Vec<u8> = ENTRIES.iter().map(|(_, color)| color.0).collect();
    indices.sort_unstable();

    assert!(indices.into_iter().eq(0..ENTRIES.len() as u8));
    // Every index without a name is black.
    assert!(
        PALETTE[ENTRIES.len()..]
            .iter()
            .all(|&entry| entry == [0; 3])
    );
}

#[test]
fn the_gallery_pictures_are_as_blessed() {
    let package = Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("the crate lies two folders below the package");
    let scenes = package.join("scenes");
    let bless = env::var_os("GROOVEBOX_BLESS").is_some_and(|value| value == "1");
    let pictures = [("font", font()), ("palette", palette())];
    let actual: String = pictures
        .iter()
        .map(|(name, screen)| {
            let mut fingerprint = Fingerprint::new();
            fingerprint.bytes(screen.pixels());
            format!("{name} {:016x}\n", fingerprint.value())
        })
        .collect();
    // Writes each picture as `<name>.png` into `directory` and returns the paths.
    let write = |directory: &Path| -> Vec<PathBuf> {
        fs::create_dir_all(directory)
            .unwrap_or_else(|error| panic!("{}: {error}", directory.display()));
        pictures
            .iter()
            .map(|(name, screen)| {
                let path = directory.join(format!("{name}.png"));
                write_png(&path, screen.pixels(), &PALETTE);
                path
            })
            .collect()
    };

    let file = scenes.join("gallery.fingerprints");
    match (!bless && file.exists()).then(|| fs::read_to_string(&file)) {
        None => {
            fs::write(&file, &actual).unwrap_or_else(|error| panic!("{}: {error}", file.display()));
            write(&scenes.join("gallery"));
        }
        Some(Ok(blessed)) if blessed.lines().eq(actual.lines()) => {}
        Some(Ok(blessed)) => {
            let written: String = write(&package.join("target/drift/gallery"))
                .iter()
                .map(|path| format!("{}\n", path.display()))
                .collect();
            panic!(
                "the gallery's fingerprints differ from {}\nblessed:\n{blessed}actual:\n{actual}\
                The actual pictures are in:\n{written}Run with GROOVEBOX_BLESS=1 to accept them.",
                file.display()
            );
        }
        Some(Err(error)) => panic!("{}: {error}", file.display()),
    }
}
