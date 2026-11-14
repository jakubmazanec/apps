use super::Control;
use crate::label::Label;
use crate::palette::{ACCENT, BACKGROUND, DIM, TEXT};
use crate::project::track::PadMode;
use crate::screen::{Canvas, HEIGHT, WIDTH};
use crate::ui::frame::{Piece, draw_header, draw_strip};
use crate::ui::layout::rect;
use core::fmt::Write;

impl Control {
    /// Draws the whole picture from the state of the control part alone, whatever the canvas held
    /// before. STEP is its header over an empty main area, whose grid comes with the sequencer, and
    /// an empty strip.
    ///
    /// The header names the screen, the track, the selected sound and the pad mode with the
    /// octave in KEYS mode. While an empty pad is selected there is no sound to name, and the
    /// pad's dim number stands in its place.
    pub fn draw(&self, canvas: &mut impl Canvas) {
        canvas.fill_rect(rect(0, 0, WIDTH as i32, HEIGHT as i32), BACKGROUND);
        let track = self.track();
        let mut track_name = Label::<2>::new();
        write!(track_name, "T{}", self.project.track + 1).expect("writing to a label never fails");
        let mut pad_number = Label::<2>::new();
        let sound = match track.selected_sound {
            Some(sound) => Piece {
                text: self
                    .project
                    .pool
                    .get(sound)
                    .expect("a selected sound is in the pool")
                    .name
                    .as_str(),
                color: TEXT,
            },
            None => {
                write!(
                    pad_number,
                    "{}",
                    track
                        .selected_pad
                        .expect("a track without a selected sound has a selected pad")
                        + 1
                )
                .expect("writing to a label never fails");
                Piece {
                    text: pad_number.as_str(),
                    color: DIM,
                }
            }
        };
        let mut mode = Label::<8>::new();
        match track.mode {
            PadMode::Pads => mode.push_str("Pads"),
            PadMode::Keys => {
                write!(mode, "Keys C{}", track.octave).expect("writing to a label never fails");
            }
        }
        draw_header(
            canvas,
            &[
                Piece {
                    text: self.view.screen.name(),
                    color: ACCENT,
                },
                Piece {
                    text: track_name.as_str(),
                    color: TEXT,
                },
                sound,
                Piece {
                    text: mode.as_str(),
                    color: DIM,
                },
            ],
            None,
        );
        draw_strip(canvas, &[None; 4]);
    }
}
