use crate::budget;
use crate::param::ParamId;
use crate::project::pool::{SOUND_DEFAULTS, SOUND_VALUES, Sound, SoundNumber};

/// The audio part's own copy of every sound's values, in number order like the pool, so the audio
/// thread reads them without sharing anything with the control part.
pub struct Sounds {
    sounds: [(SoundNumber, [i32; SOUND_VALUES]); budget::POOL_SOUNDS],
    length: usize,
}

impl Sounds {
    pub const fn new() -> Self {
        Self {
            sounds: [(SoundNumber(0), SOUND_DEFAULTS); budget::POOL_SOUNDS],
            length: 0,
        }
    }

    /// Adds a sound. Numbers only grow, so it goes last.
    ///
    /// # Panics
    ///
    /// When the audio part holds as many sounds as the pool can: the control part never makes
    /// more.
    pub fn add(&mut self, sound: SoundNumber, values: [i32; SOUND_VALUES]) {
        self.sounds[self.length] = (sound, values);
        self.length += 1;
    }

    /// Forgets `sound`; the others stay in number order.
    ///
    /// # Panics
    ///
    /// When the audio part does not hold `sound`, as `values` does.
    pub fn remove(&mut self, sound: SoundNumber) {
        let index = self.find(sound);

        self.sounds.copy_within(index + 1..self.length, index);
        self.length -= 1;
    }

    /// The values of `sound`, in the order of the master list's `Sound` entries.
    ///
    /// # Panics
    ///
    /// When the audio part does not hold `sound`: the control part adds a sound before it uses it.
    pub fn values(&self, sound: SoundNumber) -> &[i32; SOUND_VALUES] {
        &self.sounds[self.find(sound)].1
    }

    /// Stores the value of the `Sound` entry `id` of `sound`. The control part has held it within
    /// the entry's range.
    pub fn set(&mut self, sound: SoundNumber, id: ParamId, value: i32) {
        let index = self.find(sound);

        self.sounds[index].1[Sound::place(id)] = value;
    }

    fn find(&self, sound: SoundNumber) -> usize {
        self.sounds[..self.length]
            .binary_search_by_key(&sound, |&(number, _)| number)
            .expect("the control part adds a sound before it uses it")
    }
}

impl Default for Sounds {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(all(test, not(feature = "loom")))]
mod tests {
    use super::*;

    #[test]
    fn removing_a_sound_keeps_the_others_found_by_number() {
        let mut sounds = Sounds::new();
        let with = |value| {
            let mut values = SOUND_DEFAULTS;
            values[0] = value;
            values
        };
        for number in 1..=3 {
            sounds.add(SoundNumber(number), with(number as i32));
        }

        sounds.remove(SoundNumber(2));
        sounds.add(SoundNumber(4), with(4));

        for number in [1, 3, 4] {
            assert_eq!(sounds.values(SoundNumber(number)), &with(number as i32));
        }
    }

    #[test]
    #[should_panic]
    fn a_sound_beyond_what_the_pool_holds_panics() {
        let mut sounds = Sounds::new();

        for number in 1..=budget::POOL_SOUNDS as u32 + 1 {
            sounds.add(SoundNumber(number), SOUND_DEFAULTS);
        }
    }
}
