use crate::palette::{BACKGROUND, LINE};
use crate::screen::{Canvas, Color, WIDTH};
use crate::ui::layout::{MAIN_TOP, ROW_PITCH, STRIP_LINE, TEXT_INSET, rect};
use crate::ui::text;

/// Draws a question in the middle of the main area: a box 1 pixel outlined around its `lines`,
/// one text row each, 1 pixel apart, their ink 4 pixels inside the outline. The box hides what
/// was drawn under it.
pub fn draw_question(canvas: &mut impl Canvas, lines: &[(&str, Color)]) {
    let inside = 1 + TEXT_INSET;
    let width = lines
        .iter()
        .map(|&(line, _)| text::width(line))
        .max()
        .unwrap_or(0)
        + 2 * inside;
    let height = ROW_PITCH * lines.len() as i32 + 1;
    let x = (WIDTH as i32 - width) / 2;
    let y = (MAIN_TOP + STRIP_LINE + 1 - height) / 2;
    canvas.fill_rect(rect(x, y, width, height), BACKGROUND);
    canvas.outline_rect(rect(x, y, width, height), LINE);
    for (row, &(line, color)) in (0..).zip(lines) {
        text::draw(canvas, x + inside, y + 1 + ROW_PITCH * row, line, color);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::palette::{BACKGROUND, DIM, LINE, TEXT};
    use crate::screen::Screen;
    use crate::ui::layout::rect;
    use crate::ui::test_pixels::{filled, ink, outlined, span};

    /// The lines of question.png.
    const LINES: [(&str, Color); 3] = [
        ("Delete Kick?", TEXT),
        ("On 2 pads, 24 notes", DIM),
        ("OK deletes, Cancel keeps", DIM),
    ];

    #[test]
    fn the_box_matches_question_png() {
        let mut screen = Screen::new();

        draw_question(&mut screen, &LINES);

        // As wide as its widest line plus 8 and 14 pixels a line plus 1, in the middle of the
        // main area.
        assert!(outlined(&screen, 164, 113, 151, 43, LINE));
        assert_eq!(ink(&screen, LINE), 2 * (151 + 43) - 4);
        // Each line's ink from x 168, its capitals on the rows of question.png.
        assert_eq!(span(&screen, 165..=313, 117..=123, TEXT), Some((168, 238)));
        assert_eq!(span(&screen, 165..=313, 131..=137, DIM), Some((168, 280)));
        assert_eq!(span(&screen, 165..=313, 145..=151, DIM), Some((168, 310)));
        assert_eq!(span(&screen, 165..=313, 114..=154, TEXT), Some((168, 238)));
        // The descenders of "pads" reach row 139.
        assert_eq!(span(&screen, 165..=313, 138..=139, DIM), Some((198, 223)));
    }

    #[test]
    fn the_box_hides_what_is_under_it() {
        let mut screen = Screen::new();
        screen.fill_rect(rect(0, 0, 480, 272), TEXT);

        draw_question(&mut screen, &[("Delete clap.wav?", DIM)]);

        // One line: 15 pixels high, centred in the main area.
        assert!(outlined(&screen, 188, 127, 103, 15, LINE));
        assert!(filled(&screen, 189..=289, 128..=130, BACKGROUND));
        assert!(filled(&screen, 189..=289, 140..=140, BACKGROUND));
        assert_eq!(span(&screen, 189..=289, 128..=140, TEXT), None);
        assert_eq!(span(&screen, 189..=289, 128..=140, DIM), Some((192, 286)));
        assert!(filled(&screen, 0..=479, 0..=126, TEXT));
        assert!(filled(&screen, 0..=187, 127..=141, TEXT));
    }
}
