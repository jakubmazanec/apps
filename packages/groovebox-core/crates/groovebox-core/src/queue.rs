#![allow(unsafe_code)]

use core::mem::MaybeUninit;

#[cfg(not(feature = "loom"))]
mod shim {
    pub use core::sync::atomic::{AtomicU32, Ordering};

    /// The part of loom's `UnsafeCell` that the queue uses.
    pub struct UnsafeCell<T>(core::cell::UnsafeCell<T>);

    impl<T> UnsafeCell<T> {
        pub const fn new(value: T) -> Self {
            Self(core::cell::UnsafeCell::new(value))
        }

        pub fn with<R>(&self, access: impl FnOnce(*const T) -> R) -> R {
            access(self.0.get())
        }

        pub fn with_mut<R>(&self, access: impl FnOnce(*mut T) -> R) -> R {
            access(self.0.get())
        }
    }
}

#[cfg(feature = "loom")]
mod shim {
    pub use loom::cell::UnsafeCell;
    pub use loom::sync::atomic::{AtomicU32, Ordering};
}

use shim::{AtomicU32, Ordering, UnsafeCell};

/// A lock-free single-producer single-consumer ring of `N` items. `N` is a power of two.
///
/// `head` counts the items pushed and `tail` the items popped, both wrapping at 2^32. So a full
/// queue (`head - tail == N`) differs from an empty one (`head == tail`), and an index maps to its
/// slot by its low bits.
pub struct Queue<T: Copy, const N: usize> {
    head: AtomicU32,
    tail: AtomicU32,
    slots: [UnsafeCell<MaybeUninit<T>>; N],
}

// SAFETY: the producer writes a slot only while it is empty and the consumer reads it only while it
// is full. Each side hands a slot over with a Release store of its index and the other side takes
// it with an Acquire load, so the two never touch a slot at the same time.
unsafe impl<T: Copy + Send, const N: usize> Sync for Queue<T, N> {}

impl<T: Copy, const N: usize> Queue<T, N> {
    const CAPACITY: u32 = {
        assert!(
            N.is_power_of_two() && N as u64 <= 1 << 31,
            "N must be a power of two of at most 2^31"
        );
        N as u32
    };

    #[cfg(not(feature = "loom"))]
    pub const fn new() -> Self {
        let _ = Self::CAPACITY;
        Self {
            head: AtomicU32::new(0),
            tail: AtomicU32::new(0),
            slots: [const { UnsafeCell::new(MaybeUninit::uninit()) }; N],
        }
    }

    #[cfg(feature = "loom")]
    pub fn new() -> Self {
        let _ = Self::CAPACITY;
        Self {
            head: AtomicU32::new(0),
            tail: AtomicU32::new(0),
            slots: core::array::from_fn(|_| UnsafeCell::new(MaybeUninit::uninit())),
        }
    }

    /// # Safety
    ///
    /// At most one producer of this queue may exist at a time.
    pub unsafe fn producer(&self) -> Producer<'_, T, N> {
        Producer { queue: self }
    }

    /// # Safety
    ///
    /// At most one consumer of this queue may exist at a time.
    pub unsafe fn consumer(&self) -> Consumer<'_, T, N> {
        Consumer { queue: self }
    }

    fn slot(&self, index: u32) -> &UnsafeCell<MaybeUninit<T>> {
        &self.slots[index as usize & (N - 1)]
    }
}

impl<T: Copy, const N: usize> Default for Queue<T, N> {
    fn default() -> Self {
        Self::new()
    }
}

pub struct Producer<'a, T: Copy, const N: usize> {
    queue: &'a Queue<T, N>,
}

impl<T: Copy, const N: usize> Producer<'_, T, N> {
    /// Gives the item back when the queue is full.
    pub fn push(&mut self, item: T) -> Result<(), T> {
        let head = self.queue.head.load(Ordering::Relaxed);
        let tail = self.queue.tail.load(Ordering::Acquire);
        if head.wrapping_sub(tail) == Queue::<T, N>::CAPACITY {
            return Err(item);
        }
        self.queue.slot(head).with_mut(|slot| {
            // SAFETY: the slot is empty, so the consumer does not read it, and this is the only
            // producer.
            unsafe { slot.write(MaybeUninit::new(item)) }
        });
        self.queue
            .head
            .store(head.wrapping_add(1), Ordering::Release);
        Ok(())
    }
}

pub struct Consumer<'a, T: Copy, const N: usize> {
    queue: &'a Queue<T, N>,
}

impl<T: Copy, const N: usize> Consumer<'_, T, N> {
    pub fn pop(&mut self) -> Option<T> {
        let item = self.peek()?;
        let tail = self.queue.tail.load(Ordering::Relaxed);
        self.queue
            .tail
            .store(tail.wrapping_add(1), Ordering::Release);
        Some(item)
    }

    pub fn peek(&self) -> Option<T> {
        let tail = self.queue.tail.load(Ordering::Relaxed);
        let head = self.queue.head.load(Ordering::Acquire);
        if head == tail {
            return None;
        }
        Some(self.queue.slot(tail).with(|slot| {
            // SAFETY: the slot is full, so the producer does not write it, and `T` is `Copy`.
            unsafe { (*slot).assume_init() }
        }))
    }
}

#[cfg(all(test, not(feature = "loom")))]
mod tests {
    use super::*;

    fn split<T: Copy, const N: usize>(
        queue: &Queue<T, N>,
    ) -> (Producer<'_, T, N>, Consumer<'_, T, N>) {
        // SAFETY: each test takes one producer and one consumer from its own queue.
        unsafe { (queue.producer(), queue.consumer()) }
    }

    #[test]
    fn fifo_until_full() {
        let queue = Queue::<u32, 4>::new();
        let (mut producer, mut consumer) = split(&queue);

        for item in 1..=4 {
            assert_eq!(producer.push(item), Ok(()));
        }
        assert_eq!(producer.push(5), Err(5));
        for item in 1..=4 {
            assert_eq!(consumer.pop(), Some(item));
        }
        assert_eq!(consumer.pop(), None);
    }

    #[test]
    fn wraps_around() {
        let queue = Queue::<u32, 4>::new();
        let (mut producer, mut consumer) = split(&queue);

        for round in 0..10_000 {
            for item in 0..3 {
                assert_eq!(producer.push(round * 3 + item), Ok(()));
            }
            for item in 0..3 {
                assert_eq!(consumer.pop(), Some(round * 3 + item));
            }
        }
    }

    #[test]
    fn indices_wrap_at_u32_max() {
        let queue = Queue::<u32, 4>::new();
        queue.head.store(u32::MAX - 1, Ordering::Relaxed);
        queue.tail.store(u32::MAX - 1, Ordering::Relaxed);
        let (mut producer, mut consumer) = split(&queue);

        for item in 0..4 {
            assert_eq!(producer.push(item), Ok(()));
        }
        assert_eq!(producer.push(4), Err(4));
        for item in 0..4 {
            assert_eq!(consumer.pop(), Some(item));
        }
        assert_eq!(consumer.pop(), None);
    }

    #[test]
    fn peek_does_not_consume() {
        let queue = Queue::<u32, 4>::new();
        let (mut producer, mut consumer) = split(&queue);

        assert_eq!(producer.push(1), Ok(()));
        assert_eq!(consumer.peek(), Some(1));
        assert_eq!(consumer.peek(), Some(1));
        assert_eq!(consumer.pop(), Some(1));
    }

    #[test]
    fn two_threads_keep_order() {
        let queue = Queue::<u32, 64>::new();
        let (mut producer, mut consumer) = split(&queue);

        std::thread::scope(|scope| {
            scope.spawn(move || {
                for item in 0..200_000 {
                    while producer.push(item).is_err() {
                        std::hint::spin_loop();
                    }
                }
            });
            scope.spawn(move || {
                for expected in 0..200_000 {
                    let item = loop {
                        if let Some(item) = consumer.pop() {
                            break item;
                        }
                        std::hint::spin_loop();
                    };
                    assert_eq!(item, expected);
                }
            });
        });
    }
}

#[cfg(all(test, feature = "loom"))]
mod model {
    use super::*;

    #[test]
    fn one_producer_one_consumer() {
        loom::model(|| {
            let queue = loom::sync::Arc::new(Queue::<u32, 2>::new());
            let producer_thread = loom::thread::spawn({
                let queue = queue.clone();
                move || {
                    // SAFETY: this thread is the only one that takes a producer.
                    let mut producer = unsafe { queue.producer() };
                    for item in 1..=3 {
                        while producer.push(item).is_err() {
                            loom::thread::yield_now();
                        }
                    }
                }
            });
            // SAFETY: this thread is the only one that takes a consumer.
            let mut consumer = unsafe { queue.consumer() };
            let mut items = [0; 3];
            let mut count = 0;
            while count < items.len() {
                match consumer.pop() {
                    Some(item) => {
                        items[count] = item;
                        count += 1;
                    }
                    None => loom::thread::yield_now(),
                }
            }
            producer_thread.join().unwrap();

            assert_eq!(items, [1, 2, 3]);
        });
    }
}
