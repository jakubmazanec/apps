use crate::budget;
use crate::param::ParamId;
use crate::project::pool::{SOUND_DEFAULTS, SOUND_VALUES, Sound, SoundNumber};

/// The audio part's own copy of every sound's values, in number order like the pool, so the audio
/// thread reads them without sharing anything with the control part.
pub struct Sounds {
    sounds: [(SoundNumber, [i32; SOUND_VALUES]); budget::POOL_SOUNDS],
    /// Which slots hold a sound that was removed: it stays where it is until `add` needs the room.
    removed: [bool; budget::POOL_SOUNDS],
    /// The slots in use, removed ones included.
    length: usize,
}

impl Sounds {
    pub const fn new() -> Self {
        Self {
            sounds: [(SoundNumber(0), SOUND_DEFAULTS); budget::POOL_SOUNDS],
            removed: [false; budget::POOL_SOUNDS],
            length: 0,
        }
    }

    /// Adds a sound. Numbers only grow, so it goes last. When every slot is in use, the sounds
    /// that were removed give theirs back first, in one pass that keeps the others in number order.
    ///
    /// # Panics
    ///
    /// When the audio part holds as many sounds as the pool can: the control part never makes
    /// more.
    pub fn add(&mut self, sound: SoundNumber, values: [i32; SOUND_VALUES]) {
        if self.length == budget::POOL_SOUNDS {
            let mut kept = 0;
            for slot in 0..self.length {
                if !self.removed[slot] {
                    self.sounds[kept] = self.sounds[slot];
                    kept += 1;
                }
            }
            self.length = kept;
            self.removed = [false; budget::POOL_SOUNDS];
        }
        self.sounds[self.length] = (sound, values);
        self.length += 1;
    }

    /// Forgets `sound` and moves none of the others, so removing many sounds in one chunk costs
    /// no more than removing one.
    ///
    /// # Panics
    ///
    /// When the audio part does not hold `sound`, as `values` does.
    pub fn remove(&mut self, sound: SoundNumber) {
        let index = self.find(sound);

        self.removed[index] = true;
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
            .ok()
            .filter(|&index| !self.removed[index])
            .expect("the control part uses only a sound it added and did not delete")
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

    /// The values of a sound that its number tells apart from the others.
    fn with(number: u32) -> [i32; SOUND_VALUES] {
        let mut values = SOUND_DEFAULTS;
        values[0] = number as i32;
        values
    }

    #[test]
    fn removing_a_sound_keeps_the_others_found_by_number() {
        let mut sounds = Sounds::new();
        for number in 1..=3 {
            sounds.add(SoundNumber(number), with(number));
        }

        sounds.remove(SoundNumber(2));
        sounds.add(SoundNumber(4), with(4));

        for number in [1, 3, 4] {
            assert_eq!(sounds.values(SoundNumber(number)), &with(number));
        }
    }

    #[test]
    fn removing_a_sound_moves_none_of_the_others() {
        let mut sounds = Sounds::new();
        for number in 1..=3 {
            sounds.add(SoundNumber(number), with(number));
        }

        sounds.remove(SoundNumber(1));

        assert_eq!(sounds.sounds[1].0, SoundNumber(2));
        assert_eq!(sounds.sounds[2].0, SoundNumber(3));
    }

    #[test]
    #[should_panic]
    fn a_removed_sound_is_not_found() {
        let mut sounds = Sounds::new();
        for number in 1..=3 {
            sounds.add(SoundNumber(number), with(number));
        }

        sounds.remove(SoundNumber(2));

        sounds.values(SoundNumber(2));
    }

    #[test]
    fn a_full_table_takes_back_the_room_of_removed_sounds_in_number_order() {
        let mut sounds = Sounds::new();
        let full = budget::POOL_SOUNDS as u32;
        for number in 1..=full {
            sounds.add(SoundNumber(number), with(number));
        }
        let removed = [1, 2, full / 2, full - 1, full];
        for number in removed {
            sounds.remove(SoundNumber(number));
        }

        for number in full + 1..=full + removed.len() as u32 {
            sounds.add(SoundNumber(number), with(number));
        }

        for number in (1..=full + removed.len() as u32).filter(|number| !removed.contains(number)) {
            assert_eq!(sounds.values(SoundNumber(number)), &with(number));
        }
    }

    #[test]
    #[should_panic]
    fn a_removed_sound_is_not_found_after_the_table_took_back_its_room() {
        let mut sounds = Sounds::new();
        let full = budget::POOL_SOUNDS as u32;
        for number in 1..=full {
            sounds.add(SoundNumber(number), with(number));
        }

        sounds.remove(SoundNumber(2));
        sounds.add(SoundNumber(full + 1), with(full + 1));

        sounds.values(SoundNumber(2));
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
