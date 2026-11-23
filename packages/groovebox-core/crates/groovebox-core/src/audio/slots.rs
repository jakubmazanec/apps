use super::CHUNK;
use super::delay::Delay;
use super::reverb::Reverb;
use super::voice::Glide;
use crate::effect_ram::{PIECES, Piece};
use crate::param::{self, ParamId, TEMPO};
use crate::project::track::{self, Effect, SLOT_VALUES, move_item};

/// A slot of a track as the audio part keeps it.
#[derive(Clone, Copy)]
struct Slot {
    effect: Effect,
    /// The values of every effect type, in list order.
    values: [Glide; SLOT_VALUES],
    delay: Delay,
    reverb: Reverb,
    /// The piece of the effect memory it uses.
    piece: u8,
}

impl Slot {
    /// `effect` at its defaults on `piece`, holding nothing.
    const fn new(effect: Effect, piece: u8) -> Self {
        let defaults = track::Slot::new(effect).values;
        let mut values = [Glide::at(0); SLOT_VALUES];
        let mut place = 0;
        while place < SLOT_VALUES {
            values[place] = Glide::at(defaults[place]);
            place += 1;
        }
        Self {
            effect,
            values,
            delay: Delay::new(),
            reverb: Reverb::new(),
            piece,
        }
    }
}

/// Every track's six slots in chain order: each its effect, its values gliding as a sound's do,
/// its effect's state and the piece it uses (S9).
pub struct Slots {
    tracks: [[Slot; 6]; 4],
    /// The tempo the delays follow, in hundredths of a BPM.
    tempo: u32,
}

impl Slots {
    /// Every track with a delay in slot 1 and a reverb in slot 2 at their defaults and four empty
    /// slots (S2), slot `s` of track `t` on piece `6t + s`, at 120 BPM.
    pub const fn new() -> Self {
        let mut tracks = [[Slot::new(Effect::Empty, 0); 6]; 4];
        let mut piece = 0;
        while piece < PIECES {
            let effect = match piece % 6 {
                0 => Effect::Delay,
                1 => Effect::Reverb,
                _ => Effect::Empty,
            };
            tracks[piece / 6][piece % 6] = Slot::new(effect, piece as u8);
            piece += 1;
        }
        Self {
            tracks,
            tempo: TEMPO.default as u32,
        }
    }

    /// The slot clears and takes `effect` at its defaults, on the piece it uses.
    pub fn set_effect(&mut self, track: u8, slot: u8, effect: Effect) {
        let slot = &mut self.tracks[usize::from(track)][usize::from(slot)];
        *slot = Slot::new(effect, slot.piece);
    }

    /// The slot at `from` goes to `to` with its piece; the slots between move one place towards
    /// `from` (S3).
    pub fn move_slot(&mut self, track: u8, from: u8, to: u8) {
        move_item(&mut self.tracks[usize::from(track)], from, to);
    }

    /// Glides the value of `id` to `value` over the entry's glide in whole chunks, landing exactly
    /// on it; a glide of 0 sets it at once.
    pub fn set(&mut self, track: u8, slot: u8, id: ParamId, value: i32) {
        let slot = &mut self.tracks[usize::from(track)][usize::from(slot)];
        slot.values[track::Slot::place(id)].set(value, param::entry(id).glide);
    }

    pub fn set_tempo(&mut self, tempo: u32) {
        self.tempo = tempo;
    }

    /// Every slot of every track (STOP while stopped).
    pub fn clear(&mut self) {
        for slot in self.tracks.as_flattened_mut() {
            slot.delay.clear();
            slot.reverb.clear();
        }
    }

    /// One chunk of `bus` through the track's slots 1 to 6, passing over those S11 skips: an empty
    /// one and one that is not ringing while the chunk it takes is 0 on both sides. Every slot's
    /// values glide on, passed over or not.
    pub fn render(&mut self, track: u8, bus: &mut [[f32; CHUNK]; 2], pieces: &mut [Piece; PIECES]) {
        for slot in &mut self.tracks[usize::from(track)] {
            for value in &mut slot.values {
                value.step();
            }
            let piece = &mut pieces[usize::from(slot.piece)];
            match slot.effect {
                Effect::Delay
                    if slot.delay.ringing(piece)
                        || bus.as_flattened().iter().any(|&x| x != 0.0) =>
                {
                    slot.delay.render(
                        &slot.values.map(|value| value.value),
                        self.tempo,
                        bus,
                        piece,
                    );
                }
                Effect::Reverb
                    if slot.reverb.ringing(piece)
                        || bus.as_flattened().iter().any(|&x| x != 0.0) =>
                {
                    slot.reverb
                        .render(&slot.values.map(|value| value.value), bus, piece);
                }
                Effect::Empty | Effect::Delay | Effect::Reverb => {}
            }
        }
    }
}

impl Default for Slots {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::effect_ram::EffectRam;
    use crate::param::DELAY_LEVEL;

    #[test]
    #[allow(unsafe_code)]
    fn a_slot_passed_over_glides_on() {
        let (mut slots, effects) = (Slots::new(), EffectRam::boxed());
        // SAFETY: the test is the only user of its effect memory.
        let pieces = unsafe { effects.pieces() };
        slots.set(0, 0, DELAY_LEVEL.id, 65_535);

        for _ in 0..4 {
            let mut bus = [[0.0; CHUNK]; 2];
            slots.render(0, &mut bus, pieces);
            assert_eq!(bus, [[0.0; CHUNK]; 2]);
        }

        let place = track::Slot::place(DELAY_LEVEL.id);
        assert_eq!(slots.tracks[0][0].values[place].value, 65_535);
    }
}
