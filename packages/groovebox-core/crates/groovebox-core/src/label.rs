use core::fmt;

/// Text of at most `N` bytes of UTF-8, held in place. It is `Copy` and compares by content.
#[derive(Clone, Copy, PartialEq, Eq)]
pub struct Label<const N: usize> {
    // The bytes after `length` stay zero, so the derived comparison compares the content.
    bytes: [u8; N],
    length: usize,
}

impl<const N: usize> Label<N> {
    pub const fn new() -> Self {
        Self {
            bytes: [0; N],
            length: 0,
        }
    }

    /// A label of `text`. A `const fn`, so a label of the program's own text is built when the
    /// program is compiled.
    ///
    /// # Panics
    ///
    /// When `text` does not fit.
    pub const fn of(text: &str) -> Self {
        let mut label = Self::new();
        label
            .bytes
            .split_at_mut(text.len())
            .0
            .copy_from_slice(text.as_bytes());
        label.length = text.len();
        label
    }

    pub fn as_str(&self) -> &str {
        core::str::from_utf8(&self.bytes[..self.length]).expect("a label holds whole characters")
    }

    /// Appends `text`, or as much of it as fits: it stops after the last whole character that does.
    pub fn push_str(&mut self, text: &str) {
        let end = text.floor_char_boundary(N - self.length);
        self.bytes[self.length..self.length + end].copy_from_slice(&text.as_bytes()[..end]);
        self.length += end;
    }
}

impl<const N: usize> Default for Label<N> {
    fn default() -> Self {
        Self::new()
    }
}

impl<const N: usize> fmt::Debug for Label<N> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(self.as_str(), f)
    }
}

/// Writing never fails: what does not fit is cut, as in `push_str`.
impl<const N: usize> fmt::Write for Label<N> {
    fn write_str(&mut self, text: &str) -> fmt::Result {
        self.push_str(text);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use core::fmt::Write;

    #[test]
    fn push_str_stops_at_a_whole_character() {
        let mut label = Label::<5>::new();

        label.push_str("Žluť");

        // Ž is two bytes, ť would make the sixth.
        assert_eq!(label.as_str(), "Žlu");
    }

    #[test]
    fn push_str_appends_until_the_label_is_full() {
        let mut label = Label::<8>::new();

        label.push_str("Kick");
        label.push_str(" 12");
        label.push_str(" and more");

        assert_eq!(label.as_str(), "Kick 12 ");
    }

    #[test]
    fn a_new_label_is_empty() {
        assert_eq!(Label::<4>::new().as_str(), "");
        assert_eq!(Label::<4>::default(), Label::new());
    }

    #[test]
    fn labels_compare_by_content() {
        let mut whole = Label::<8>::new();
        whole.push_str("Syn 1");
        let mut parts = Label::<8>::new();
        parts.push_str("Syn");
        parts.push_str(" 1");
        let mut other = Label::<8>::new();
        other.push_str("Syn 2");

        assert_eq!(whole, parts);
        assert_ne!(whole, other);
    }

    #[test]
    fn a_label_is_copied_by_value() {
        let mut label = Label::<8>::new();
        label.push_str("Kick");
        let copy = label;
        label.push_str(" 2");

        assert_eq!(copy.as_str(), "Kick");
        assert_eq!(label.as_str(), "Kick 2");
    }

    #[test]
    fn write_formats_into_the_label_and_cuts_what_does_not_fit() {
        let mut label = Label::<6>::new();

        assert!(write!(label, "{} dB", -12).is_ok());

        assert_eq!(label.as_str(), "-12 dB");
        assert!(write!(label, "{}", 100).is_ok());
        assert_eq!(label.as_str(), "-12 dB");
    }

    #[test]
    fn a_label_in_a_constant_is_built_at_compile_time() {
        const EMPTY: Label<64> = Label::new();

        assert_eq!(EMPTY.as_str(), "");
    }
}
