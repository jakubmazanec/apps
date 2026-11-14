/// The screens of the device that exist so far. A new project opens on STEP.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Screen {
    Step,
    Sound,
    Settings,
}

impl Screen {
    /// The name the header starts with.
    pub fn name(self) -> &'static str {
        match self {
            Self::Step => "Step",
            Self::Sound => "Sound",
            Self::Settings => "Settings",
        }
    }
}

/// What the screen shows.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct View {
    pub screen: Screen,
}

impl View {
    /// STEP, where a new project opens.
    pub const fn new() -> Self {
        Self {
            screen: Screen::Step,
        }
    }
}

impl Default for View {
    fn default() -> Self {
        Self::new()
    }
}
