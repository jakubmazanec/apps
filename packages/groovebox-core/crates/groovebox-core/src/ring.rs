/// A first-in first-out ring for one thread. It holds at most `N` items.
pub struct Ring<T: Copy, const N: usize> {
    items: [Option<T>; N],
    head: usize,
    len: usize,
}

impl<T: Copy, const N: usize> Ring<T, N> {
    pub const fn new() -> Self {
        Self {
            items: [None; N],
            head: 0,
            len: 0,
        }
    }

    pub fn push(&mut self, item: T) -> Result<(), T> {
        if self.len == N {
            return Err(item);
        }
        self.items[(self.head + self.len) % N] = Some(item);
        self.len += 1;
        Ok(())
    }

    pub fn pop(&mut self) -> Option<T> {
        let item = self.peek()?;
        self.head = (self.head + 1) % N;
        self.len -= 1;
        Some(item)
    }

    pub fn peek(&self) -> Option<T> {
        if self.len == 0 {
            return None;
        }
        self.items[self.head]
    }
}

impl<T: Copy, const N: usize> Default for Ring<T, N> {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ring_fifo_until_full_and_after() {
        let mut ring = Ring::<u32, 2>::new();

        assert_eq!(ring.push(1), Ok(()));
        assert_eq!(ring.push(2), Ok(()));
        assert_eq!(ring.push(3), Err(3));
        assert_eq!(ring.pop(), Some(1));
        assert_eq!(ring.push(3), Ok(()));
        assert_eq!(ring.pop(), Some(2));
        assert_eq!(ring.pop(), Some(3));
    }
}
