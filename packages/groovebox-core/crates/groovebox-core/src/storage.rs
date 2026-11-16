use crate::label::Label;

/// A path relative to the storage's root, such as "samples/drums/kick.wav" or "tmp".
pub type Path = Label<255>;

/// Where a request's data goes to or comes from: the I/O buffer or the sample RAM.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Memory {
    Io,
    SampleRam,
}

/// A request to the platform's storage. The control part sends one at a time; the platform
/// carries it out and queues the reply.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Request {
    /// Every file under `folder` at any depth, sorted by the bytes of their paths, from entry
    /// `from`, written into Io from 0 as one record after another: the path's length (`u8`), the
    /// path relative to `folder` and the file's size (`u32` little-endian). A page holds as many
    /// whole records as fit.
    List { folder: Path, from: u32 },
    /// `length` bytes of `file` from byte `at`, into Io from 0.
    Read { file: Path, at: u64, length: u32 },
    /// `length` bytes of `file` from byte `at`, into the sample RAM at byte `into`.
    Load {
        file: Path,
        at: u64,
        length: u32,
        into: u32,
    },
    /// Starts replacing `file`, making its folders.
    Begin { file: Path },
    /// Adds `length` bytes from `offset` of `from` to the file that `Begin` started.
    Append {
        from: Memory,
        offset: u32,
        length: u32,
    },
    /// Swaps the new file in. Without it the old one stays.
    Commit,
    /// Deletes a file, or a folder with everything in it, and then the folders it leaves empty,
    /// never `samples` or `tmp`.
    Delete { path: Path },
    /// The free bytes.
    Free,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    Done,
    /// A `List` page that left entries for the next.
    More,
    Missing,
    Full,
    Failed,
}

/// The platform's reply to the request with this number. `value` is, for `List`, the entries
/// written; for `Read` and `Load`, the bytes read; for `Free`, the free bytes; otherwise 0.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Reply {
    pub number: u32,
    pub status: Status,
    pub value: u64,
}
