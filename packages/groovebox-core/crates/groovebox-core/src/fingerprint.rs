const OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
const PRIME: u64 = 0x0000_0100_0000_01b3;

/// A running FNV-1a 64 hash. The field is public so that a caller that keeps the hash elsewhere
/// can resume it.
pub struct Fingerprint(pub u64);

impl Fingerprint {
    pub const fn new() -> Self {
        Self(OFFSET)
    }

    pub fn bytes(&mut self, bytes: &[u8]) {
        for byte in bytes {
            self.0 = (self.0 ^ u64::from(*byte)).wrapping_mul(PRIME);
        }
    }

    /// Adds the bits of `value` as 4 little-endian bytes.
    pub fn f32(&mut self, value: f32) {
        self.bytes(&value.to_bits().to_le_bytes());
    }

    pub fn value(&self) -> u64 {
        self.0
    }
}

impl Default for Fingerprint {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fnv1a_vectors() {
        let hash = |text: &str| {
            let mut fingerprint = Fingerprint::new();
            fingerprint.bytes(text.as_bytes());
            fingerprint.value()
        };

        assert_eq!(hash(""), 0xcbf2_9ce4_8422_2325);
        assert_eq!(hash("a"), 0xaf63_dc4c_8601_ec8c);
        assert_eq!(hash("foobar"), 0x8594_4171_f739_67e8);
    }
}
