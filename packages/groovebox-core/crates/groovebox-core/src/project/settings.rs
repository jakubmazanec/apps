use crate::param::{self, ENTRIES, ParamId, Scope};

/// The values of the `Device` entries of the master list, in list order.
const DEVICE_VALUES: usize = param::count(ENTRIES, Scope::Device);

/// The device's own settings, which belong to no project: one value per `Device` entry.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DeviceSettings {
    values: [i32; DEVICE_VALUES],
}

impl DeviceSettings {
    /// Every entry at its default.
    pub const fn new() -> Self {
        Self {
            values: param::defaults(ENTRIES, Scope::Device),
        }
    }

    /// # Panics
    ///
    /// When `id` is not a `Device` entry: an ID comes from the master list.
    pub fn get(&self, id: ParamId) -> i32 {
        self.values[Self::place(id)]
    }

    /// Stores the value, stopping it at the entry's lowest or highest value.
    ///
    /// # Panics
    ///
    /// When `id` is not a `Device` entry.
    pub fn set(&mut self, id: ParamId, value: i32) {
        let entry = param::entry(id);
        self.values[Self::place(id)] = value.clamp(entry.low, entry.high);
    }

    fn place(id: ParamId) -> usize {
        param::position(ENTRIES, Scope::Device, id).expect("every ID in use is a device entry")
    }
}

impl Default for DeviceSettings {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::param::{METRONOME, METRONOME_LEVEL, METRONOME_LEVEL_DEFAULT, ParamId, VELOCITY};

    #[test]
    fn the_metronome_starts_off_at_its_level() {
        let settings = DeviceSettings::new();

        assert_eq!(settings.get(METRONOME.id), 0);
        assert_eq!(settings.get(METRONOME_LEVEL.id), METRONOME_LEVEL_DEFAULT);
    }

    #[test]
    fn a_new_set_of_settings_holds_every_default() {
        let settings = DeviceSettings::new();

        assert_eq!(settings.get(VELOCITY.id), 1);
        assert_eq!(DeviceSettings::default(), settings);
    }

    #[test]
    fn settings_are_built_at_compile_time() {
        const NEW: DeviceSettings = DeviceSettings::new();

        assert_eq!(NEW.get(VELOCITY.id), VELOCITY.default);
    }

    #[test]
    fn a_value_set_is_the_value_got() {
        let mut settings = DeviceSettings::new();

        settings.set(VELOCITY.id, 0);

        assert_eq!(settings.get(VELOCITY.id), 0);
    }

    #[test]
    fn a_value_outside_the_entry_range_stops_at_its_end() {
        let mut settings = DeviceSettings::new();

        settings.set(VELOCITY.id, 5);
        assert_eq!(settings.get(VELOCITY.id), 1);
        settings.set(VELOCITY.id, -5);
        assert_eq!(settings.get(VELOCITY.id), 0);
    }

    #[test]
    #[should_panic(expected = "every ID in use is a device entry")]
    fn an_id_that_is_no_device_entry_panics() {
        DeviceSettings::new().get(ParamId(1_000));
    }
}
