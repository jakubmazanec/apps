//! A recorded note's pressure curve, in a block of the note memory (Project model, "Pressure
//! curves"): byte 0 is `CURVE`, bytes 1 and 2 count the points and from byte 4 each point takes 3
//! bytes, the ticks since the point before (since the hit for the first) and the value.

use super::{BLOCK, Block, RESERVE, Store};

/// The first byte of a curve block: a kind no tree block has.
pub const CURVE: u8 = 255;
/// The points a block holds: 169.
pub const POINTS: usize = (BLOCK - 4) / 3;

/// A curve that records, with the last point it kept.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Curve {
    block: Block,
    value: u8,
    /// Since the hit.
    ticks: u64,
    /// The ticks after the last kept point that keep a point whose value has not moved.
    spacing: u32,
}

impl Curve {
    /// A curve in a block of its own whose first point is `value`, `ticks` after the hit, while
    /// more than `RESERVE` blocks are free: otherwise none, as the curve gives way first.
    pub fn start(store: &mut Store<'_>, ticks: u64, value: u8) -> Option<Self> {
        if store.free() <= RESERVE {
            return None;
        }
        let block = store.take();
        store.block_mut(block)[0] = CURVE;
        let mut curve = Self {
            block,
            value,
            ticks: 0,
            // A 1/32 beat.
            spacing: 60,
        };
        curve.keep(store, ticks, value);
        Some(curve)
    }

    /// The pressure `value`, `ticks` after the hit: kept when its value moved by 2 or more or the
    /// spacing has passed since the last kept point. A tick before that point counts as its own.
    pub fn point(&mut self, store: &mut Store<'_>, ticks: u64, value: u8) {
        let ticks = ticks.max(self.ticks);
        if self.value.abs_diff(value) >= 2 || ticks - self.ticks >= u64::from(self.spacing) {
            self.keep(store, ticks, value);
        }
    }

    pub fn block(&self) -> Block {
        self.block
    }

    /// Adds the point, its ticks since the last kept one held at 65,535. A full block first drops
    /// points 2, 4, 6 and so on, each adding its ticks to the point after it, and the spacing
    /// doubles.
    fn keep(&mut self, store: &mut Store<'_>, ticks: u64, value: u8) {
        let block = store.block_mut(self.block);
        let mut count = count(block);
        let points = block[4..].as_chunks_mut().0;
        if count == POINTS {
            for i in 1..=POINTS / 2 {
                let joined =
                    point_ticks(points[2 * i - 1]).saturating_add(point_ticks(points[2 * i]));
                points[i] = points[2 * i];
                points[i][..2].copy_from_slice(&joined.to_le_bytes());
            }
            count = POINTS / 2 + 1;
            self.spacing = self.spacing.saturating_mul(2);
        }
        let [low, high] = ((ticks - self.ticks).min(u16::MAX.into()) as u16).to_le_bytes();
        points[count] = [low, high, value];
        block[1..3].copy_from_slice(&(count as u16 + 1).to_le_bytes());
        (self.value, self.ticks) = (value, ticks);
    }
}

/// The points of a curve block: the ticks since the point before and the value.
pub fn points(block: &[u8; BLOCK]) -> impl Iterator<Item = (u16, u8)> + '_ {
    block[4..].as_chunks().0[..count(block)]
        .iter()
        .map(|&point| (point_ticks(point), point[2]))
}

fn count(block: &[u8; BLOCK]) -> usize {
    usize::from(u16::from_le_bytes([block[1], block[2]]))
}

fn point_ticks(point: [u8; 3]) -> u16 {
    u16::from_le_bytes([point[0], point[1]])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::NoteRam;
    use std::vec::Vec;

    /// The points `curve` kept.
    fn kept(store: &Store<'_>, curve: &Curve) -> Vec<(u16, u8)> {
        points(store.block(curve.block())).collect()
    }

    #[test]
    fn points_keep_what_says_something_new() {
        let ram = NoteRam::boxed();
        // SAFETY: the test is the only store.
        let mut store = unsafe { ram.store() };
        let mut curve = Curve::start(&mut store, 5, 50).unwrap();

        // A move of 1 says nothing new, a move of 2 does and so does the spacing passing.
        curve.point(&mut store, 15, 51);
        curve.point(&mut store, 25, 52);
        curve.point(&mut store, 80, 52);
        curve.point(&mut store, 85, 52);

        assert_eq!(kept(&store, &curve), [(5, 50), (20, 52), (60, 52)]);
        assert_eq!(
            store.block(curve.block())[..13],
            [CURVE, 3, 0, 0, 5, 0, 50, 20, 0, 52, 60, 0, 52]
        );
    }

    #[test]
    fn a_full_curve_drops_every_second_point_and_doubles_the_spacing() {
        let ram = NoteRam::boxed();
        // SAFETY: the test is the only store.
        let mut store = unsafe { ram.store() };
        // Point n at 60 n ticks with the value n, each kept as the spacing passed.
        let mut curve = Curve::start(&mut store, 60, 1).unwrap();
        for n in 2..=POINTS as u64 {
            curve.point(&mut store, 60 * n, n as u8);
        }
        assert_eq!(kept(&store, &curve).len(), POINTS);

        curve.point(&mut store, 60 * 170, 170);

        let points = kept(&store, &curve);
        assert_eq!(
            points.iter().map(|&(_, value)| value).collect::<Vec<_>>(),
            (1..=169).step_by(2).chain([170]).collect::<Vec<u8>>()
        );
        assert_eq!(
            points
                .iter()
                .map(|&(ticks, _)| u32::from(ticks))
                .sum::<u32>(),
            60 * 170
        );
        // 119 ticks and a move of 1 say nothing new, 120 ticks do and so does a move of 2.
        curve.point(&mut store, 60 * 170 + 119, 171);
        assert_eq!(kept(&store, &curve).len(), 86);
        curve.point(&mut store, 60 * 170 + 120, 171);
        curve.point(&mut store, 60 * 170 + 121, 173);
        assert_eq!(kept(&store, &curve)[86..], [(120, 171), (1, 173)]);
    }

    #[test]
    fn a_long_pause_holds_its_ticks_at_65_535() {
        let ram = NoteRam::boxed();
        // SAFETY: the test is the only store.
        let mut store = unsafe { ram.store() };
        let mut curve = Curve::start(&mut store, 70_000, 50).unwrap();

        // The ticks count on from the point itself, not from what it holds.
        curve.point(&mut store, 70_060, 50);
        curve.point(&mut store, 200_000, 50);

        assert_eq!(kept(&store, &curve), [(65_535, 50), (60, 50), (65_535, 50)]);
    }
}
