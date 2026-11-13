use std::{env, fs, io::BufReader, path::Path};

const BUDGET: &str = "../../budget.toml";
const FONT_DESCRIPTION: &str = "font/monogram.fnt";
const FONT_ATLAS: &str = "font/monogram_0.png";
const GLYPHS: usize = 577;
const ADVANCE: i32 = 6;
// A glyph's rows are bytes with the leftmost column in bit 7, in a cell of 12 rows (0 to 11).
const MAX_WIDTH: usize = 8;
const CELL_HEIGHT: usize = 12;

/// Turns a `name = integer` line into the source of a constant.
fn constant(line: &str) -> Option<String> {
    let (name, value) = line.split_once('=')?;
    let (name, value) = (name.trim(), value.trim());
    let is_name = name.starts_with(|first: char| first.is_ascii_lowercase())
        && name
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_');
    let is_integer = value.starts_with(|first: char| first.is_ascii_digit())
        && value.chars().all(|c| c.is_ascii_digit() || c == '_');
    (is_name && is_integer).then(|| {
        format!(
            "pub const {}: usize = {value};\n",
            name.to_ascii_uppercase()
        )
    })
}

/// The source of the budget's constants.
fn budget() -> String {
    let budget = fs::read_to_string(BUDGET).unwrap_or_else(|error| panic!("{BUDGET}: {error}"));
    budget
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .map(|line| {
            constant(line).unwrap_or_else(|| {
                panic!(
                    "{BUDGET}: expected `name = integer`, a comment or a blank line, found `{line}`"
                )
            })
        })
        .collect()
}

/// The value of the integer attribute `name` of a `<char .../>` line.
fn attribute<T: TryFrom<i32>>(line: &str, name: &str) -> T {
    let key = format!(" {name}=\"");
    let start = line
        .find(&key)
        .unwrap_or_else(|| panic!("{FONT_DESCRIPTION}: no {name} in `{line}`"))
        + key.len();
    let value = line[start..]
        .split('"')
        .next()
        .expect("split always yields a first part");
    value
        .parse::<i32>()
        .ok()
        .and_then(|value| T::try_from(value).ok())
        .unwrap_or_else(|| panic!("{FONT_DESCRIPTION}: bad {name} `{value}` in `{line}`"))
}

/// The width, the height and the alpha channel of the font's atlas.
fn atlas() -> (usize, usize, Vec<u8>) {
    let file = fs::File::open(FONT_ATLAS).unwrap_or_else(|error| panic!("{FONT_ATLAS}: {error}"));
    let mut reader = png::Decoder::new(BufReader::new(file))
        .read_info()
        .unwrap_or_else(|error| panic!("{FONT_ATLAS}: {error}"));
    let mut pixels = vec![
        0;
        reader
            .output_buffer_size()
            .expect("the atlas fits in memory")
    ];
    let info = reader
        .next_frame(&mut pixels)
        .unwrap_or_else(|error| panic!("{FONT_ATLAS}: {error}"));
    assert!(
        info.color_type == png::ColorType::Rgba && info.bit_depth == png::BitDepth::Eight,
        "{FONT_ATLAS}: expected 8-bit RGBA, found {:?} {:?}",
        info.color_type,
        info.bit_depth
    );
    let alpha = pixels
        .as_chunks::<4>()
        .0
        .iter()
        .map(|&[_, _, _, alpha]| alpha)
        .collect();
    (info.width as usize, info.height as usize, alpha)
}

/// The source of the table of glyphs, sorted by code point.
fn glyphs() -> String {
    let description = fs::read_to_string(FONT_DESCRIPTION)
        .unwrap_or_else(|error| panic!("{FONT_DESCRIPTION}: {error}"));
    let (atlas_width, atlas_height, alpha) = atlas();
    let mut glyphs: Vec<(u32, String)> = description
        .lines()
        .filter(|line| line.trim_start().starts_with("<char "))
        .map(|line| {
            let code: u32 = attribute(line, "id");
            let (x, y): (usize, usize) = (attribute(line, "x"), attribute(line, "y"));
            let (width, height): (usize, usize) =
                (attribute(line, "width"), attribute(line, "height"));
            let (x_offset, y_offset): (i8, i8) =
                (attribute(line, "xoffset"), attribute(line, "yoffset"));
            let advance: i32 = attribute(line, "xadvance");
            assert!(advance == ADVANCE, "{FONT_DESCRIPTION}: xadvance {advance} in `{line}`");
            assert!(width <= MAX_WIDTH, "{FONT_DESCRIPTION}: width {width} in `{line}`");
            assert!(
                i32::from(y_offset) + height as i32 <= CELL_HEIGHT as i32,
                "{FONT_DESCRIPTION}: reaches below row {} in `{line}`",
                CELL_HEIGHT - 1
            );
            assert!(
                height <= CELL_HEIGHT && x + width <= atlas_width && y + height <= atlas_height,
                "{FONT_DESCRIPTION}: outside the atlas in `{line}`"
            );
            let mut rows = [0u8; CELL_HEIGHT];
            for (row, bits) in rows.iter_mut().take(height).enumerate() {
                for column in 0..width {
                    if alpha[(y + row) * atlas_width + x + column] > 0 {
                        *bits |= 0x80 >> column;
                    }
                }
            }
            (
                code,
                format!(
                    "    Glyph {{ code: {code}, x: {x_offset}, y: {y_offset}, width: {width}, height: {height}, rows: {rows:?} }},\n"
                ),
            )
        })
        .collect();
    assert!(
        glyphs.len() == GLYPHS,
        "{FONT_DESCRIPTION}: expected {GLYPHS} characters, found {}",
        glyphs.len()
    );
    glyphs.sort_by_key(|&(code, _)| code);
    assert!(
        glyphs.windows(2).all(|pair| pair[0].0 != pair[1].0),
        "{FONT_DESCRIPTION}: a character appears twice"
    );
    let rows: String = glyphs.into_iter().map(|(_, source)| source).collect();
    format!("pub static GLYPHS: [Glyph; {GLYPHS}] = [\n{rows}];\n")
}

fn main() {
    for path in [BUDGET, FONT_DESCRIPTION, FONT_ATLAS] {
        println!("cargo:rerun-if-changed={path}");
    }
    let out_dir = env::var_os("OUT_DIR").expect("cargo sets OUT_DIR for build scripts");
    let out_dir = Path::new(&out_dir);
    fs::write(out_dir.join("budget.rs"), budget()).expect("OUT_DIR is writable");
    fs::write(out_dir.join("font.rs"), glyphs()).expect("OUT_DIR is writable");
}
