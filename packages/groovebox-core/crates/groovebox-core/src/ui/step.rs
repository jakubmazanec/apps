//! STEP's main area: the lanes' labels, the grid with its tint and lines, the notes, the cursor and
//! the music (Look, "STEP").

use crate::control::step_view::{CELL, GRID_CELLS, GRID_END, PAGE, grid_left, place_of};
use crate::font::glyph;
use crate::palette::{
    ACCENT, BACKGROUND, FAINT, LINE, NOTE_LOUD, NOTE_MID, NOTE_SOFT, SHOWN_BAR, TEXT,
};
use crate::project::Signature;
use crate::screen::{Canvas, Color};
use crate::ui::item::draw_cursor;
use crate::ui::layout::{ROW_FIRST, ROW_HEIGHT, ROW_PITCH, TEXT_INSET, rect};
use crate::ui::text;

/// The first column of the labels and the separators, 1 px inside the screen's edge.
const LEFT: i32 = 1;
/// A note's block: 2 px right of its cell's left line, 1 px below its lane's top, 5 px wide and 11
/// high (S6).
const NOTE_X: i32 = 2;
/// The block of a late cell (`Mark::late`): 2 px further right.
const LATE_NOTE_X: i32 = NOTE_X + 2;
const NOTE_WIDTH: i32 = CELL - 3;
const NOTE_HEIGHT: i32 = ROW_HEIGHT - 2;

/// What a cell shows (S6): the notes of its lane's sound that start in its sixteenth.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Mark {
    /// The loudest note's velocity.
    pub velocity: u8,
    /// How many notes there are.
    pub count: u8,
    /// How many pixels the longest note's tail is long: its length past a sixteenth, 8 px to
    /// 480 ticks, rounded down.
    pub tail: u16,
    /// Whether none of the notes starts on its sixteenth's first tick.
    pub late: bool,
}

/// A lane as the names column shows it.
#[derive(Clone, Copy)]
pub struct LaneView<'a> {
    pub label: &'a str,
    pub color: Color,
    /// Whether the cursor is on the lane: its label is inverted.
    pub selected: bool,
}

/// STEP's main area as `draw_step` draws it.
pub struct StepPicture<'a> {
    /// The shown lanes, at most `LANES_SHOWN`.
    pub lanes: &'a [LaneView<'a>],
    pub columns: u32,
    pub first_cell: u32,
    /// The pattern's cells.
    pub cells: u32,
    pub signature: Signature,
    /// The page the step buttons show, counted over the pattern.
    pub shown_page: u32,
    /// The shown index of the first extra lane.
    pub first_extra: Option<usize>,
    /// The cells of the shown lanes, from the first shown cell.
    pub marks: &'a [[Option<Mark>; GRID_CELLS]],
    /// The shown lane and column of the cursor.
    pub cursor: Option<(usize, u32)>,
    /// The music line's x.
    pub music: Option<i32>,
}

/// Draws STEP's main area (S3 to S7): the cells from the first one, as many as the columns and the
/// pattern have, with a tint on the dark cells and the page the step buttons show, then the lines
/// that start at each cell's left edge and after the last one; the lanes with their labels,
/// separators and notes; the cursor and last the music.
pub fn draw_step(canvas: &mut impl Canvas, picture: &StepPicture) {
    let StepPicture {
        lanes,
        columns,
        first_cell,
        cells,
        signature,
        shown_page,
        first_extra,
        marks,
        cursor,
        music,
        ..
    } = *picture;
    let x = |column: u32| grid_left(columns) + CELL * column as i32;
    let shown = columns.min(cells.saturating_sub(first_cell));
    let height = (ROW_PITCH * lanes.len() as i32 - 1) as u32;
    for column in 0..shown {
        let cell = first_cell + column;
        let tint = if place_of(cell, signature).is_none() {
            FAINT
        } else if cell / PAGE == shown_page {
            SHOWN_BAR
        } else {
            continue;
        };
        canvas.fill_rect(rect(x(column), ROW_FIRST, CELL, height as i32), tint);
    }
    let beat = PAGE / u32::from(signature.unit);
    for column in 0..=shown {
        // A page's start is a beat's too.
        let line = match place_of(first_cell + column, signature) {
            Some(place) if place.step == 0 => LINE,
            Some(place) if u32::from(place.step) % beat == 0 => FAINT,
            _ => continue,
        };
        canvas.vline(x(column), ROW_FIRST, height, line);
    }
    for (row, (lane, marks)) in lanes.iter().zip(marks).enumerate() {
        let y = ROW_FIRST + ROW_PITCH * row as i32;
        if lane.selected {
            canvas.fill_rect(
                rect(
                    LEFT,
                    y,
                    text::width(lane.label) + 2 * TEXT_INSET,
                    ROW_HEIGHT,
                ),
                ACCENT,
            );
        }
        text::draw(
            canvas,
            LEFT + TEXT_INSET,
            y,
            lane.label,
            if lane.selected {
                BACKGROUND
            } else {
                lane.color
            },
        );
        if row > 0 {
            let line = if first_extra == Some(row) {
                LINE
            } else {
                FAINT
            };
            canvas.hline(LEFT, y - 1, (GRID_END - LEFT + 1) as u32, line);
        }
        for (column, &mark) in (0..shown).zip(marks) {
            let Some(mark) = mark else { continue };
            let color = match mark.velocity {
                100.. => NOTE_LOUD,
                60.. => NOTE_MID,
                _ => NOTE_SOFT,
            };
            let block = x(column) + if mark.late { LATE_NOTE_X } else { NOTE_X };
            canvas.fill_rect(rect(block, y + 1, NOTE_WIDTH, NOTE_HEIGHT), color);
            // The tail runs on the block's middle rows and stops at the last cell.
            let tail = i32::from(mark.tail).min(CELL * (shown - column - 1) as i32);
            canvas.fill_rect(
                rect(block + NOTE_WIDTH, y + ROW_HEIGHT / 2 - 1, tail, 2),
                color,
            );
            // Two digits do not fit on the block.
            if mark.count > 1
                && let Some(digit) = char::from_digit(u32::from(mark.count), 10)
            {
                canvas.glyph(block, y, glyph(digit), BACKGROUND);
            }
        }
    }
    if let Some((lane, column)) = cursor {
        let y = ROW_FIRST + ROW_PITCH * lane as i32;
        draw_cursor(canvas, x(column) + 1, y, CELL - 1, ROW_HEIGHT);
    }
    if let Some(music) = music {
        canvas.vline(music, ROW_FIRST, height, TEXT);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::palette::{
        ACCENT, BACKGROUND, DIM, FAINT, LINE, NOTE_LOUD, NOTE_MID, NOTE_SOFT, RECORD, SHOWN_BAR,
        TEXT,
    };
    use crate::project::{FOUR_FOUR, Signature};
    use crate::screen::{Canvas, Screen};
    use crate::ui::layout::rect;
    use crate::ui::test_pixels::{filled, ink, outlined, picture, span};
    use crate::ui::text;

    const NO_MARKS: [[Option<Mark>; GRID_CELLS]; 16] = [[None; GRID_CELLS]; 16];

    /// One lane called "1", the 16 cells of a 4/4 bar on the page the step buttons show, names 17 px
    /// wide and 57 columns.
    fn one_lane() -> StepPicture<'static> {
        StepPicture {
            lanes: &[LaneView {
                label: "1",
                color: DIM,
                selected: false,
            }],
            columns: 57,
            first_cell: 0,
            cells: 16,
            signature: FOUR_FOUR,
            shown_page: 0,
            first_extra: None,
            marks: &NO_MARKS[..1],
            cursor: None,
            music: None,
        }
    }

    fn drawn(picture: &StepPicture) -> Screen {
        let mut screen = Screen::new();
        draw_step(&mut screen, picture);
        screen
    }

    /// Lane 0 of `one_lane` with `mark` in column `column` of a pattern of 4 bars.
    fn marked(column: usize, mark: Mark) -> Screen {
        let mut marks = NO_MARKS;
        marks[0][column] = Some(mark);
        drawn(&StepPicture {
            cells: 64,
            marks: &marks[..1],
            ..one_lane()
        })
    }

    fn note(velocity: u8, count: u8, tail: u16) -> Mark {
        Mark {
            velocity,
            count,
            tail,
            late: false,
        }
    }

    #[test]
    fn a_note_is_a_block_in_its_velocitys_grey() {
        for (velocity, grey) in [
            (1, NOTE_SOFT),
            (59, NOTE_SOFT),
            (60, NOTE_MID),
            (99, NOTE_MID),
            (100, NOTE_LOUD),
            (127, NOTE_LOUD),
        ] {
            let screen = marked(0, note(velocity, 1, 0));

            // 5 by 11 px at the cell's left line + 2 and the lane's top + 1: x 24 to 28, y 18 to 28.
            assert!(
                filled(&screen, 24..=28, 18..=28, grey),
                "velocity {velocity}"
            );
            assert_eq!(ink(&screen, grey), 5 * 11, "velocity {velocity}");
        }
    }

    #[test]
    fn a_late_cell_draws_its_note_2_px_right() {
        let late = marked(
            0,
            Mark {
                late: true,
                ..note(100, 1, 4)
            },
        );
        let on_time = marked(0, note(100, 1, 4));

        // The block from the cell's left line + 4, x 26 to 30, and its tail from the block's right
        // edge, x 31 to 34.
        assert!(filled(&late, 26..=30, 18..=28, NOTE_LOUD));
        assert!(filled(&late, 31..=34, 22..=23, NOTE_LOUD));
        assert_eq!(ink(&late, NOTE_LOUD), 5 * 11 + 4 * 2);
        // Not late: from + 2, x 24 to 28, its tail x 29 to 32.
        assert!(filled(&on_time, 24..=28, 18..=28, NOTE_LOUD));
        assert!(filled(&on_time, 29..=32, 22..=23, NOTE_LOUD));
        assert_eq!(ink(&on_time, NOTE_LOUD), 5 * 11 + 4 * 2);
    }

    #[test]
    fn a_long_note_has_a_tail_and_a_chord_its_count() {
        let tail = marked(0, note(100, 1, 8));

        // 2 px high from the block's right edge at the lane's top + 5: x 29 to 36, y 22 and 23.
        assert!(filled(&tail, 29..=36, 22..=23, NOTE_LOUD));
        assert_eq!(ink(&tail, NOTE_LOUD), 5 * 11 + 8 * 2);

        // A chord's count is a digit in the background colour on the block's rows 3 to 9.
        let three = marked(0, note(100, 3, 0));
        assert_eq!(
            picture(&three, 24..=28, 20..=26, BACKGROUND),
            [
                ".###.", "#...#", "....#", "..##.", "....#", "#...#", ".###."
            ]
        );
        assert!(filled(&three, 24..=28, 18..=19, NOTE_LOUD));
        assert!(filled(&three, 24..=28, 27..=28, NOTE_LOUD));
        // 2 to 9 have one, 1 and 10 or more none.
        for (count, digit) in [(1, false), (2, true), (9, true), (10, false), (255, false)] {
            let screen = marked(0, note(100, count, 0));

            assert_eq!(ink(&screen, NOTE_LOUD) < 5 * 11, digit, "count {count}");
        }
    }

    #[test]
    fn a_tail_stops_at_the_last_cell() {
        // 57 columns, the last one 56: its block ends at x 476 and has no tail, and the tail of
        // column 55 ends there too.
        let second_last = marked(55, note(100, 1, 500));
        let last = marked(56, note(100, 1, 500));

        assert_eq!(
            span(&second_last, 0..=479, 22..=22, NOTE_LOUD),
            Some((464, 476))
        );
        assert_eq!(
            span(&second_last, 0..=479, 18..=18, NOTE_LOUD),
            Some((464, 468))
        );
        assert_eq!(span(&last, 0..=479, 22..=22, NOTE_LOUD), Some((472, 476)));
        assert_eq!(ink(&last, NOTE_LOUD), 5 * 11);

        // Where the pattern ends before the columns do, the last cell of its 16 is the end.
        let mut marks = NO_MARKS;
        marks[0][14] = Some(note(100, 1, 500));
        let short = drawn(&StepPicture {
            marks: &marks[..1],
            ..one_lane()
        });
        assert_eq!(span(&short, 0..=479, 22..=22, NOTE_LOUD), Some((136, 148)));
    }

    #[test]
    fn dark_cells_the_shown_page_and_the_lines() {
        // 3/4 takes 12 of a page's 16 cells: 2 bars end at cell 32, x 278.
        let screen = drawn(&StepPicture {
            cells: 32,
            signature: Signature { beats: 3, unit: 4 },
            shown_page: 1,
            ..one_lane()
        });
        let rows = 17..=29;

        // The cells of the page the step buttons show are tinted, the dark ones faint.
        assert!(filled(&screen, 118..=149, rows.clone(), FAINT));
        assert!(filled(&screen, 151..=181, rows.clone(), SHOWN_BAR));
        assert!(filled(&screen, 183..=213, rows.clone(), SHOWN_BAR));
        assert!(filled(&screen, 215..=245, rows.clone(), SHOWN_BAR));
        assert!(filled(&screen, 246..=277, rows.clone(), FAINT));
        assert!(filled(&screen, 23..=53, rows.clone(), BACKGROUND));
        // Bar lines in the line grey, the last one closing the grid; beats faint.
        for x in [22, 150, 278] {
            assert!(filled(&screen, x..=x, rows.clone(), LINE), "x {x}");
        }
        for x in [54, 86, 182, 214] {
            assert!(filled(&screen, x..=x, rows.clone(), FAINT), "x {x}");
        }
        // A dark cell has no line of its own, and nothing is drawn past the pattern's end.
        assert_eq!(span(&screen, 119..=149, rows.clone(), LINE), None);
        assert_eq!(span(&screen, 247..=277, rows.clone(), LINE), None);
        assert!(filled(&screen, 279..=479, rows.clone(), BACKGROUND));
        // Only the lanes' height: 1 lane is 13 rows.
        assert!(filled(&screen, 0..=479, 30..=252, BACKGROUND));
        assert!(filled(&screen, 0..=479, 15..=16, BACKGROUND));
    }

    #[test]
    fn beats_follow_the_unit_and_a_pages_start_has_a_line() {
        let rows = 17..=29;
        // 7/8: a beat is 2 cells, 14 are used and the bar line comes at cell 16.
        let sevenths = drawn(&StepPicture {
            cells: 32,
            signature: Signature { beats: 7, unit: 8 },
            ..one_lane()
        });

        for x in [38, 54, 70, 86, 102, 118] {
            assert_eq!(sevenths.pixel(x, 20), FAINT, "x {x}");
        }
        assert_eq!(sevenths.pixel(22, 20), LINE);
        assert_eq!(sevenths.pixel(150, 20), LINE);
        // 5/4: the second page of the bar starts at cell 16 with a faint line on the plain
        // background, and cell 20 is dark.
        let fifths = drawn(&StepPicture {
            cells: 32,
            signature: Signature { beats: 5, unit: 4 },
            ..one_lane()
        });

        assert_eq!(fifths.pixel(150, 20), FAINT);
        assert!(filled(&fifths, 151..=157, rows.clone(), BACKGROUND));
        assert!(filled(&fifths, 182..=277, rows.clone(), FAINT));
        assert_eq!(fifths.pixel(278, 20), LINE);
    }

    #[test]
    fn a_view_shows_the_cells_from_its_first_and_ends_where_the_pattern_does() {
        // 4 bars of 4/4 from cell 52: 12 cells show and their edge closes the grid at x 118.
        let screen = drawn(&StepPicture {
            first_cell: 52,
            cells: 64,
            shown_page: 3,
            ..one_lane()
        });
        let rows = 17..=29;

        assert!(filled(&screen, 23..=53, rows.clone(), SHOWN_BAR));
        for x in [22, 54, 86] {
            assert!(filled(&screen, x..=x, rows.clone(), FAINT), "x {x}");
        }
        assert!(filled(&screen, 118..=118, rows.clone(), LINE));
        assert!(filled(&screen, 119..=479, rows, BACKGROUND));
    }

    #[test]
    fn labels_the_selected_block_and_the_extra_lanes_line() {
        let mut lanes = [LaneView {
            label: "",
            color: DIM,
            selected: false,
        }; 14];
        let others = [
            (1, "Kick", TEXT),
            (2, "3", DIM),
            (12, "Syn 1", TEXT),
            (13, "Missing", RECORD),
        ];
        for (lane, label, color) in others {
            lanes[lane].label = label;
            lanes[lane].color = color;
        }
        lanes[0] = LaneView {
            label: "Hat",
            color: TEXT,
            selected: true,
        };
        let screen = drawn(&StepPicture {
            lanes: &lanes,
            first_extra: Some(12),
            marks: &NO_MARKS[..14],
            ..one_lane()
        });

        // The selected label: the accent block from x 1, 3 px, the text's 17 and 3 px wide and
        // 13 high, with the text from x 4 in the background colour.
        let mut selected = Screen::new();
        selected.fill_rect(rect(1, 17, 23, 13), ACCENT);
        text::draw(&mut selected, 4, 17, "Hat", BACKGROUND);
        assert_eq!(
            picture(&screen, 0..=24, 16..=30, ACCENT),
            picture(&selected, 0..=24, 16..=30, ACCENT)
        );
        // The other labels in their colours from x 4 on their rows 14 px apart.
        for (lane, label, color) in others {
            let top = 17 + 14 * lane;
            let mut expected = Screen::new();
            text::draw(&mut expected, 4, top as i32, label, color);
            assert_eq!(
                picture(&screen, 1..=70, top..=top + 12, color),
                picture(&expected, 1..=70, top..=top + 12, color),
                "{label}"
            );
        }
        // Separators from x 1 to the grid's end: faint between lanes, the line grey above the
        // first extra lane, none above the first lane.
        assert!(filled(&screen, 1..=478, 30..=30, FAINT));
        assert!(filled(&screen, 1..=478, 170..=170, FAINT));
        assert!(filled(&screen, 1..=478, 184..=184, LINE));
        assert!(filled(&screen, 0..=479, 16..=16, BACKGROUND));
        assert_eq!(screen.pixel(0, 170), BACKGROUND);
        assert_eq!(screen.pixel(479, 184), BACKGROUND);
    }

    #[test]
    fn the_cursor_outline_and_the_music_line() {
        let lanes = [LaneView {
            label: "1",
            color: DIM,
            selected: false,
        }; 3];
        let with = |cursor, music| {
            drawn(&StepPicture {
                lanes: &lanes,
                marks: &NO_MARKS[..3],
                cursor,
                music,
                ..one_lane()
            })
        };

        // Lane 1, column 2: the accent outline 9 by 15 from the cell's left line, 1 px above the
        // lane's top.
        let cursor = with(Some((1, 2)), None);
        assert!(outlined(&cursor, 38, 30, 9, 15, ACCENT));
        assert_eq!(ink(&cursor, ACCENT), 2 * (9 + 15) - 4);

        // The music: 1 px of text colour over the lanes' height, 3 lanes of 13 rows and 2 gaps.
        let music = with(None, Some(41));
        assert!(filled(&music, 41..=41, 17..=57, TEXT));
        assert_eq!(ink(&music, TEXT), 41);

        // It is drawn over the cursor.
        let both = with(Some((1, 2)), Some(41));
        assert_eq!(both.pixel(41, 30), TEXT);
        assert_eq!(both.pixel(40, 30), ACCENT);
        assert_eq!(ink(&both, ACCENT), 2 * (9 + 15) - 4 - 2);

        let neither = with(None, None);
        assert_eq!(ink(&neither, ACCENT) + ink(&neither, TEXT), 0);
    }
}
