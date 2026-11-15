use super::name;
use crate::budget;
use crate::label::Label;
use crate::param::{self, ENTRIES, ParamId, Scope};

/// The most bytes of a sound's name.
pub const NAME_BYTES: usize = 64;

/// The values a sound holds: one for each `Sound` entry of the master list, in list order.
pub const SOUND_VALUES: usize = param::count(ENTRIES, Scope::Sound);

/// What a new sound holds: every entry's default.
pub const SOUND_DEFAULTS: [i32; SOUND_VALUES] = param::defaults(ENTRIES, Scope::Sound);

/// A sound's number: from 1 and never reused while the project lives, so a number anywhere only
/// ever meant one sound.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct SoundNumber(pub u32);

/// How a sound makes its sound. Milestone 2 adds `Sample`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Engine {
    Synth,
}

impl Engine {
    /// The name of the page SOUND shows for the engine's own entries.
    pub const fn page_name(self) -> &'static str {
        match self {
            Self::Synth => "Synth",
        }
    }
}

/// A sound: its number, its automatic name, its engine and the values of its entries.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Sound {
    pub number: SoundNumber,
    pub name: Label<NAME_BYTES>,
    pub engine: Engine,
    pub values: [i32; SOUND_VALUES],
}

impl Sound {
    /// The place of the `Sound` entry `id` among a sound's values.
    ///
    /// # Panics
    ///
    /// When `id` is not a `Sound` entry: an ID comes from the master list.
    pub fn place(id: ParamId) -> usize {
        param::position(ENTRIES, Scope::Sound, id).expect("every ID in use is a sound entry")
    }

    /// The value of the `Sound` entry `id`.
    pub fn value(&self, id: ParamId) -> i32 {
        self.values[Self::place(id)]
    }

    /// Stores the value, stopping it at the entry's lowest or highest value.
    pub fn set(&mut self, id: ParamId, value: i32) {
        let entry = param::entry(id);
        self.values[Self::place(id)] = value.clamp(entry.low, entry.high);
    }

    /// What the pool's places hold before a sound is made in them.
    const UNUSED: Self = Self {
        number: SoundNumber(0),
        name: Label::new(),
        engine: Engine::Synth,
        values: SOUND_DEFAULTS,
    };
}

/// A refusal: the pool holds as many sounds as it can, or has no number left.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PoolFull;

/// Every sound of the project, kept in place. The sounds lie in number order without gaps from the
/// start of the array, so a sound is found by its number.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Pool {
    sounds: [Sound; budget::POOL_SOUNDS],
    length: usize,
    /// The number the next sound takes. It only grows.
    next: u32,
}

impl Pool {
    /// A `const fn`, so a `static` holding a pool is built when the program is compiled and needs
    /// no stack.
    pub const fn new() -> Self {
        Self {
            sounds: [Sound::UNUSED; budget::POOL_SOUNDS],
            length: 0,
            next: 1,
        }
    }

    /// Makes a synth sound that takes every default. A refusal changes nothing.
    pub fn new_synth(&mut self) -> Result<SoundNumber, PoolFull> {
        let number = self.vacancy()?;
        let name = name::next_name(self, "Syn", true);

        Ok(self.append(Sound {
            number,
            name,
            engine: Engine::Synth,
            values: SOUND_DEFAULTS,
        }))
    }

    /// Makes a sound with the engine and the values of `of`, and its own name and number. A refusal
    /// changes nothing.
    ///
    /// # Panics
    ///
    /// When `of` is not in the pool.
    pub fn copy(&mut self, of: SoundNumber) -> Result<SoundNumber, PoolFull> {
        let original = *self.get(of).expect("the sound to copy is in the pool");
        let number = self.vacancy()?;
        let (base, _) = name::split(original.name.as_str());
        let name = name::next_name(self, base, true);

        Ok(self.append(Sound {
            number,
            name,
            ..original
        }))
    }

    /// The sound with this number, found by a search over the numbers.
    pub fn get(&self, number: SoundNumber) -> Option<&Sound> {
        Some(&self.sounds[self.find(number)?])
    }

    /// The sound with this number, to change.
    pub fn get_mut(&mut self, number: SoundNumber) -> Option<&mut Sound> {
        let index = self.find(number)?;

        Some(&mut self.sounds[index])
    }

    /// The sounds in number order.
    pub fn sounds(&self) -> &[Sound] {
        &self.sounds[..self.length]
    }

    /// The place of the sound with this number among the sounds.
    fn find(&self, number: SoundNumber) -> Option<usize> {
        self.sounds()
            .binary_search_by_key(&number, |sound| sound.number)
            .ok()
    }

    /// The number the next sound takes. Running out of numbers refuses like a full pool; the last
    /// number is never made, so counting on never overflows.
    fn vacancy(&self) -> Result<SoundNumber, PoolFull> {
        if self.length < budget::POOL_SOUNDS && self.next < u32::MAX {
            Ok(SoundNumber(self.next))
        } else {
            Err(PoolFull)
        }
    }

    /// Adds a sound that `vacancy` approved.
    fn append(&mut self, sound: Sound) -> SoundNumber {
        self.sounds[self.length] = sound;
        self.length += 1;
        self.next += 1;
        sound.number
    }

    /// Adds a synth with exactly this name, as a sample's first sound is named.
    #[cfg(test)]
    pub(super) fn add_named(&mut self, name: &str) -> SoundNumber {
        let number = self.vacancy().expect("the test pool has room");
        let mut label = Label::new();
        label.push_str(name);

        self.append(Sound {
            number,
            name: label,
            engine: Engine::Synth,
            values: SOUND_DEFAULTS,
        })
    }
}

impl Default for Pool {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::param::{CUTOFF, LP_24, MODE};

    #[test]
    fn numbers_are_never_reused() {
        let mut pool = Pool::new();

        assert_eq!(pool.new_synth(), Ok(SoundNumber(1)));
        assert_eq!(pool.new_synth(), Ok(SoundNumber(2)));
        assert_eq!(pool.copy(SoundNumber(1)), Ok(SoundNumber(3)));
        assert!(
            pool.sounds()
                .iter()
                .map(|sound| sound.number.0)
                .eq([1, 2, 3])
        );
    }

    #[test]
    fn a_new_synth_is_named_syn_with_a_number_and_takes_every_default() {
        let mut pool = Pool::new();

        let first = pool.new_synth().unwrap();
        let second = pool.new_synth().unwrap();

        let sound = pool.get(first).unwrap();
        assert_eq!(sound.name.as_str(), "Syn 1");
        assert_eq!(sound.engine, Engine::Synth);
        assert_eq!(sound.values, SOUND_DEFAULTS);
        assert_eq!(pool.get(second).unwrap().name.as_str(), "Syn 2");
    }

    #[test]
    fn a_copy_has_the_same_engine_and_values_and_its_own_name_and_number() {
        let mut pool = Pool::new();
        let original = pool.new_synth().unwrap();
        pool.sounds[0].values = [7; SOUND_VALUES];

        let copy = pool.copy(original).unwrap();

        let (original, copy) = (pool.get(original).unwrap(), pool.get(copy).unwrap());
        assert_eq!(copy.number, SoundNumber(2));
        assert_eq!(copy.name.as_str(), "Syn 2");
        assert_eq!(copy.engine, original.engine);
        assert_eq!(copy.values, [7; SOUND_VALUES]);
        assert_eq!(original.name.as_str(), "Syn 1");
    }

    #[test]
    fn a_copy_takes_the_next_number_of_its_base_whichever_sound_it_copies() {
        let mut pool = Pool::new();
        pool.add_named("Kick");

        let second = pool.copy(SoundNumber(1)).unwrap();
        let third = pool.copy(second).unwrap();

        assert_eq!(pool.get(second).unwrap().name.as_str(), "Kick 2");
        assert_eq!(pool.get(third).unwrap().name.as_str(), "Kick 3");
    }

    #[test]
    fn a_sound_holds_the_value_set_within_its_entry_range() {
        let mut pool = Pool::new();
        let number = pool.new_synth().unwrap();
        let sound = pool.get_mut(number).unwrap();

        sound.set(CUTOFF.id, 100);
        assert_eq!(sound.value(CUTOFF.id), 100);
        sound.set(CUTOFF.id, 70_000);
        assert_eq!(sound.value(CUTOFF.id), 65_535);
        sound.set(CUTOFF.id, -1);
        assert_eq!(sound.value(CUTOFF.id), 0);
        assert_eq!(sound.value(MODE.id), LP_24);
        assert!(pool.get_mut(SoundNumber(2)).is_none());
    }

    #[test]
    fn get_finds_a_sound_by_its_number() {
        let mut pool = Pool::new();
        for _ in 0..5 {
            pool.new_synth().unwrap();
        }

        assert!(pool.get(SoundNumber(0)).is_none());
        assert_eq!(pool.get(SoundNumber(1)).unwrap().name.as_str(), "Syn 1");
        assert_eq!(pool.get(SoundNumber(5)).unwrap().name.as_str(), "Syn 5");
        assert!(pool.get(SoundNumber(6)).is_none());
    }

    #[test]
    #[should_panic(expected = "the sound to copy is in the pool")]
    fn copying_a_sound_that_is_not_in_the_pool_panics() {
        let _ = Pool::new().copy(SoundNumber(1));
    }

    #[test]
    fn a_full_pool_refuses_and_uses_no_number() {
        let mut pool = Pool::new();
        for number in 1..=1_024 {
            assert_eq!(pool.new_synth(), Ok(SoundNumber(number)));
        }
        let before = pool.clone();

        assert_eq!(pool.new_synth(), Err(PoolFull));
        assert_eq!(pool.copy(SoundNumber(1)), Err(PoolFull));

        assert_eq!(pool, before);
        assert_eq!(pool.sounds().len(), 1_024);
        assert_eq!(pool.sounds().last().unwrap().number, SoundNumber(1_024));
    }

    #[test]
    fn running_out_of_numbers_refuses_like_a_full_pool() {
        let mut pool = Pool::new();
        pool.next = u32::MAX;

        assert_eq!(pool.new_synth(), Err(PoolFull));
        assert!(pool.sounds().is_empty());
    }

    #[test]
    fn a_pool_is_built_at_compile_time() {
        const LENGTH: usize = Pool::new().length;

        assert_eq!(LENGTH, 0);
        assert!(Pool::new().sounds().is_empty());
        assert_eq!(Pool::new(), Pool::default());
    }
}
