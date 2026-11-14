use crate::input::{Button, VOLUME};

/// How long a press must last to count as a hold: 300 ms.
pub const HOLD: u64 = 14_400;
/// How long an arrow, - or + is held before it starts to repeat: 400 ms.
pub const REPEAT_DELAY: u64 = 19_200;
/// The time between two repeats of a held arrow, - or +: 50 ms.
pub const REPEAT_EVERY: u64 = 2_400;

/// The buttons that repeat while they are held: the arrows, - and +.
pub const REPEATING: [Button; 6] = [
    Button::Up,
    Button::Down,
    Button::Left,
    Button::Right,
    Button::Minus,
    Button::Plus,
];

/// One more than the highest button code, which is the push switch of the last encoder.
const SLOTS: usize = Button::Push(VOLUME - 1).code() as usize + 1;

/// What the release of a button means.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Release {
    /// A short press on its own: a button that acts when you let go acts now.
    Tap,
    /// Held for `HOLD` or longer, or another control was used while it was held.
    Long,
    /// A combination took the press, so it is neither a tap nor a hold, whatever its timing.
    Taken,
    /// The button was not held.
    NotHeld,
}

/// A button held down, from its press to its release.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Press {
    button: Button,
    sample: u64,
    /// The number of the press among all presses. Two presses at one sample keep the order in
    /// which they were handled.
    order: u64,
    /// Another control was used while the button was held.
    used: bool,
    /// A combination took the press.
    taken: bool,
    /// The sample of the next repeat. A button that does not repeat has none, and a press that is
    /// taken loses it.
    repeat: Option<u64>,
}

/// The timing of the 42 buttons: taps against holds, what a combination uses up and takes, and the
/// repeats of held arrows, - and +.
///
/// The presses and releases come in sample order. This part knows no time but the samples it is
/// given, and it makes no repeat itself: the control part asks for the next one that is due and
/// acts on it at its own sample.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Buttons {
    /// The press of each button by its code, or `None` while it is not held.
    presses: [Option<Press>; SLOTS],
    /// How many presses have been made.
    made: u64,
}

impl Buttons {
    pub const fn new() -> Self {
        Self {
            presses: [None; SLOTS],
            made: 0,
        }
    }

    /// A button is pressed at `sample`. Every other held button is marked as used. The arrows,
    /// `Minus` and `Plus` start repeating after `REPEAT_DELAY`. A button that is already held
    /// changes nothing.
    pub fn press(&mut self, button: Button, sample: u64) {
        if self.is_held(button) {
            return;
        }
        self.used();
        self.presses[Self::slot(button)] = Some(Press {
            button,
            sample,
            order: self.made,
            used: false,
            taken: false,
            repeat: REPEATING.contains(&button).then_some(sample + REPEAT_DELAY),
        });
        self.made += 1;
    }

    /// A button is released at `sample`.
    pub fn release(&mut self, button: Button, sample: u64) -> Release {
        let Some(press) = self.presses[Self::slot(button)].take() else {
            return Release::NotHeld;
        };
        if press.taken {
            Release::Taken
        } else if press.used || sample - press.sample >= HOLD {
            Release::Long
        } else {
            Release::Tap
        }
    }

    /// A control was used (an encoder turn or a pad hit): every held button is marked as used. A
    /// button pressed later starts unused.
    pub fn used(&mut self) {
        for press in self.presses.iter_mut().flatten() {
            press.used = true;
        }
    }

    /// A combination took the press of this button: it neither taps nor repeats. A button that is
    /// not held is left alone.
    pub fn take(&mut self, button: Button) {
        if let Some(press) = &mut self.presses[Self::slot(button)] {
            press.taken = true;
            press.repeat = None;
        }
    }

    pub fn is_held(&self, button: Button) -> bool {
        self.presses[Self::slot(button)].is_some()
    }

    /// The one of these buttons that was pressed first, among those held and not taken.
    pub fn first_held(&self, of: &[Button]) -> Option<Button> {
        of.iter()
            .filter_map(|&button| self.presses[Self::slot(button)].as_ref())
            .filter(|press| !press.taken)
            .min_by_key(|press| press.order)
            .map(|press| press.button)
    }

    /// The earliest repeat that is scheduled and the button it belongs to; at one sample the lowest
    /// button code goes first. It can lie after the sample the caller steps to, and the caller then
    /// leaves it for a later step. The caller must call `repeated` for every repeat it reaches,
    /// whether it acts on it or drops it, as until then this one stays the earliest.
    pub fn next_repeat(&self) -> Option<(u64, Button)> {
        self.presses
            .iter()
            .flatten()
            .filter_map(|press| Some((press.repeat?, press.button)))
            .min_by_key(|&(sample, button)| (sample, button.code()))
    }

    /// The caller reached the repeat of this button, and acted on it or dropped it: its next one is
    /// `REPEAT_EVERY` later. A button that is not repeating is left alone.
    pub fn repeated(&mut self, button: Button) {
        if let Some(Press {
            repeat: Some(sample),
            ..
        }) = &mut self.presses[Self::slot(button)]
        {
            *sample += REPEAT_EVERY;
        }
    }

    fn slot(button: Button) -> usize {
        usize::from(button.code())
    }
}

impl Default for Buttons {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use Button::*;
    use Release::*;

    #[test]
    fn a_short_press_alone_taps() {
        let mut buttons = Buttons::new();

        buttons.press(PadsKeys, 0);
        assert_eq!(buttons.release(PadsKeys, HOLD - 1), Tap);

        buttons.press(PadsKeys, 0);
        assert_eq!(buttons.release(PadsKeys, HOLD), Long);
    }

    #[test]
    fn another_control_spoils_the_tap() {
        let mut buttons = Buttons::new();

        buttons.press(PadsKeys, 0);
        buttons.press(Up, 10);
        assert_eq!(buttons.release(PadsKeys, 20), Long);
        assert_eq!(buttons.release(Up, 30), Tap);

        buttons.press(Cancel, 40);
        buttons.used();
        assert_eq!(buttons.release(Cancel, 50), Long);
    }

    #[test]
    fn a_consumed_press_never_taps() {
        let mut buttons = Buttons::new();

        buttons.press(Menu, 0);
        buttons.press(Step(2), 10);
        buttons.take(Step(2));

        assert_eq!(buttons.release(Menu, 20), Long);
        assert_eq!(buttons.release(Step(2), 30), Taken);
    }

    #[test]
    fn a_taken_press_is_taken_whatever_its_timing() {
        let mut buttons = Buttons::new();

        buttons.press(Step(0), 0);
        buttons.take(Step(0));
        assert_eq!(buttons.release(Step(0), 1), Taken);

        buttons.press(Step(0), 100);
        buttons.take(Step(0));
        assert_eq!(buttons.release(Step(0), 100 + HOLD * 10), Taken);

        buttons.press(Step(0), 200_000);
        assert_eq!(buttons.release(Step(0), 200_001), Tap);
    }

    #[test]
    fn used_marks_only_the_buttons_held_at_that_moment() {
        let mut buttons = Buttons::new();

        buttons.press(Cancel, 0);
        buttons.used();
        buttons.press(Copy, 5);

        assert_eq!(buttons.release(Copy, 10), Tap);
        assert_eq!(buttons.release(Cancel, 10), Long);
    }

    #[test]
    fn a_press_marks_the_other_held_buttons_but_not_itself() {
        let mut buttons = Buttons::new();

        buttons.press(Menu, 0);
        buttons.press(Page, 5);
        buttons.press(Step(0), 6);

        assert_eq!(buttons.release(Step(0), 7), Tap);
        assert_eq!(buttons.release(Page, 8), Long);
        assert_eq!(buttons.release(Menu, 9), Long);
    }

    #[test]
    fn a_duplicate_press_does_not_move_the_repeat() {
        let mut buttons = Buttons::new();

        buttons.press(Down, 100);
        buttons.press(Down, 5_000);

        assert_eq!(buttons.next_repeat(), Some((100 + REPEAT_DELAY, Down)));
    }

    #[test]
    fn a_duplicate_press_does_not_restart_the_timing() {
        let mut buttons = Buttons::new();

        buttons.press(Tempo, 0);
        buttons.press(Tempo, HOLD - 1);

        assert_eq!(buttons.release(Tempo, HOLD), Long);
    }

    #[test]
    fn a_duplicate_press_does_not_mark_the_other_buttons_used() {
        let mut buttons = Buttons::new();

        buttons.press(Menu, 0);
        buttons.press(Menu, 5);

        assert_eq!(buttons.release(Menu, 10), Tap);
    }

    #[test]
    fn a_duplicate_press_does_not_untake_the_press() {
        let mut buttons = Buttons::new();

        buttons.press(Menu, 0);
        buttons.take(Menu);
        buttons.press(Menu, 5);

        assert_eq!(buttons.first_held(&[Menu]), None);
        assert_eq!(buttons.release(Menu, 10), Taken);
    }

    #[test]
    fn releasing_a_button_that_is_not_held_says_so() {
        let mut buttons = Buttons::new();

        assert_eq!(buttons.release(Cancel, 0), NotHeld);

        buttons.press(Cancel, 1);
        assert_eq!(buttons.release(Cancel, 2), Tap);
        assert_eq!(buttons.release(Cancel, 3), NotHeld);
    }

    #[test]
    fn taking_a_button_that_is_not_held_does_nothing() {
        let mut buttons = Buttons::new();

        buttons.take(Up);
        buttons.press(Up, 0);

        assert_eq!(buttons.next_repeat(), Some((REPEAT_DELAY, Up)));
        assert_eq!(buttons.release(Up, 1), Tap);
    }

    #[test]
    fn a_button_is_held_from_its_press_to_its_release() {
        let mut buttons = Buttons::new();
        assert!(!buttons.is_held(Shift));

        buttons.press(Shift, 0);
        assert!(buttons.is_held(Shift));
        assert!(!buttons.is_held(Menu));

        // A taken press is still held.
        buttons.take(Shift);
        assert!(buttons.is_held(Shift));

        buttons.release(Shift, 1);
        assert!(!buttons.is_held(Shift));
    }

    #[test]
    fn every_button_is_held_on_its_own() {
        let all = || (0..=u8::MAX).filter_map(Button::from_code);
        let mut buttons = Buttons::new();
        assert_eq!(all().count(), 42);

        for (sample, button) in (0..).zip(all()) {
            buttons.press(button, sample);
        }
        for (released, button) in (0..).zip(all()) {
            let held = all().filter(|&other| buttons.is_held(other)).count();
            assert_eq!(held, 42 - released);

            assert_ne!(buttons.release(button, 100), NotHeld, "{button:?}");
            assert!(!buttons.is_held(button), "{button:?}");
        }
    }

    #[test]
    fn held_arrows_repeat_after_400_ms_every_50_ms() {
        let mut buttons = Buttons::new();

        buttons.press(Down, 1_000);
        assert_eq!(buttons.next_repeat(), Some((20_200, Down)));

        buttons.repeated(Down);
        assert_eq!(buttons.next_repeat(), Some((22_600, Down)));

        buttons.repeated(Down);
        assert_eq!(buttons.next_repeat(), Some((25_000, Down)));
    }

    #[test]
    fn the_constants_are_the_ones_of_the_spec() {
        assert_eq!(HOLD, 300 * 48);
        assert_eq!(REPEAT_DELAY, 400 * 48);
        assert_eq!(REPEAT_EVERY, 50 * 48);
    }

    #[test]
    fn only_the_arrows_minus_and_plus_repeat() {
        for code in 0..=u8::MAX {
            let Some(button) = Button::from_code(code) else {
                continue;
            };
            let mut buttons = Buttons::new();

            buttons.press(button, 10);

            let repeats = [Up, Down, Left, Right, Minus, Plus].contains(&button);
            let expected = repeats.then_some((10 + REPEAT_DELAY, button));
            assert_eq!(buttons.next_repeat(), expected, "{button:?}");
        }
    }

    #[test]
    fn a_taken_arrow_does_not_repeat() {
        let mut buttons = Buttons::new();

        buttons.press(Up, 0);
        buttons.take(Up);

        assert_eq!(buttons.next_repeat(), None);
    }

    #[test]
    fn a_taken_arrow_stops_repeating_after_it_started() {
        let mut buttons = Buttons::new();

        buttons.press(Up, 0);
        buttons.repeated(Up);
        buttons.take(Up);

        assert_eq!(buttons.next_repeat(), None);
        // Nothing brings it back, not even a stray repeat.
        buttons.repeated(Up);
        assert_eq!(buttons.next_repeat(), None);
    }

    #[test]
    fn a_released_arrow_stops_repeating_and_starts_over_when_pressed() {
        let mut buttons = Buttons::new();

        buttons.press(Minus, 0);
        buttons.repeated(Minus);
        buttons.release(Minus, 30_000);
        assert_eq!(buttons.next_repeat(), None);

        buttons.press(Minus, 40_000);
        assert_eq!(buttons.next_repeat(), Some((40_000 + REPEAT_DELAY, Minus)));
    }

    #[test]
    fn the_earliest_repeat_is_next_and_equal_samples_go_by_button_code() {
        let mut buttons = Buttons::new();

        buttons.press(Right, 100);
        buttons.press(Plus, 50);
        buttons.press(Up, 100);

        assert_eq!(buttons.next_repeat(), Some((50 + REPEAT_DELAY, Plus)));
        buttons.repeated(Plus);

        // Right was pressed before Up at the same sample, but Up has the lower code.
        assert_eq!(buttons.next_repeat(), Some((100 + REPEAT_DELAY, Up)));
        buttons.repeated(Up);

        assert_eq!(buttons.next_repeat(), Some((100 + REPEAT_DELAY, Right)));
        buttons.repeated(Right);

        // Plus, Up and Right are now 2,400 samples on from 50 and 100.
        assert_eq!(
            buttons.next_repeat(),
            Some((50 + REPEAT_DELAY + REPEAT_EVERY, Plus))
        );
    }

    #[test]
    fn repeating_something_that_is_not_repeating_does_nothing() {
        let mut buttons = Buttons::new();

        buttons.repeated(Up);
        buttons.press(Menu, 0);
        buttons.repeated(Menu);

        assert_eq!(buttons.next_repeat(), None);
        assert_eq!(buttons.release(Menu, 1), Tap);
    }

    #[test]
    fn the_first_held_modifier_counts() {
        let mut buttons = Buttons::new();

        buttons.press(Page, 0);
        buttons.press(Menu, 5);
        buttons.take(Menu);
        assert_eq!(buttons.first_held(&[Menu, Page]), Some(Page));

        buttons.release(Page, 10);
        assert_eq!(buttons.first_held(&[Menu, Page]), None);

        buttons.release(Menu, 15);
        buttons.press(Menu, 20);
        assert_eq!(buttons.first_held(&[Menu, Page]), Some(Menu));
    }

    #[test]
    fn the_earliest_press_is_the_first_held_also_at_one_sample() {
        let mut buttons = Buttons::new();

        // Page is handled first, though Menu has the lower code.
        buttons.press(Page, 7);
        buttons.press(Menu, 7);

        assert_eq!(buttons.first_held(&[Menu, Page]), Some(Page));
        assert_eq!(buttons.first_held(&[Page, Menu]), Some(Page));
        assert_eq!(buttons.first_held(&[Menu]), Some(Menu));
    }

    #[test]
    fn the_first_held_looks_only_at_the_buttons_it_is_asked_about() {
        let mut buttons = Buttons::new();

        buttons.press(Shift, 0);
        buttons.press(Page, 1);
        buttons.press(Menu, 2);

        assert_eq!(buttons.first_held(&[Menu, Page]), Some(Page));
        assert_eq!(buttons.first_held(&[Copy, Cancel]), None);
        assert_eq!(buttons.first_held(&[]), None);
    }

    #[test]
    fn a_later_press_of_a_button_counts_as_its_new_press() {
        let mut buttons = Buttons::new();

        buttons.press(Menu, 0);
        buttons.press(Page, 5);
        buttons.release(Menu, 10);
        buttons.press(Menu, 15);

        assert_eq!(buttons.first_held(&[Menu, Page]), Some(Page));
    }
}
