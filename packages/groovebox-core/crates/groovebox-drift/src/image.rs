use groovebox_core::screen::{HEIGHT, WIDTH};
use png::{BitDepth, ColorType, Encoder};
use std::fs::File;
use std::io::BufWriter;
use std::path::Path;

/// Writes a screen's pixels as an indexed PNG with this palette.
pub fn write_png(path: &Path, pixels: &[u8], palette: &[[u8; 3]; 256]) {
    let mut encoder = Encoder::new(
        BufWriter::new(
            File::create(path).unwrap_or_else(|error| panic!("{}: {error}", path.display())),
        ),
        WIDTH as u32,
        HEIGHT as u32,
    );
    encoder.set_color(ColorType::Indexed);
    encoder.set_depth(BitDepth::Eight);
    encoder.set_palette(palette.as_flattened());
    encoder
        .write_header()
        .and_then(|mut writer| {
            writer.write_image_data(pixels)?;
            writer.finish()
        })
        .unwrap_or_else(|error| panic!("{}: {error}", path.display()));
}
