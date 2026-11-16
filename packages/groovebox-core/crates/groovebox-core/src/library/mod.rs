pub mod convert;
pub mod name;
pub mod wav;

/// A file's place in the library's table. It is reused only once the audio part let go of the
/// file.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FileId(pub u16);
