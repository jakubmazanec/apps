# Font

The screen's font is [monogram](https://datagoblin.itch.io/monogram) by datagoblin, released under
CC0. Both files come unchanged from that itch.io page, and they are the ones first added to this
repository in commit `517abc56`:

- `monogram.fnt` describes the font in the BMFont text format: one `<char .../>` line for each of
  its 577 glyphs, with the glyph's place in the picture and its offsets.
- `monogram_0.png` is the picture of the glyphs, with ink where the alpha is above 0.

`build.rs` reads both and compiles the glyphs into the core as the table `font::GLYPHS`, sorted by
code point. Each glyph becomes a few bytes of rows, so the core needs neither the files nor a PNG
decoder at run time. The build fails when the font stops being what the screen is drawn for: a
character count other than 577, an advance other than 6 pixels, a glyph wider than 8 pixels or one
that reaches below row 11 of its 12-row cell.
