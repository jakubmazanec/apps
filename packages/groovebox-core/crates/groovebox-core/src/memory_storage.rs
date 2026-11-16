#![allow(unsafe_code)]

use crate::sample_ram::SampleRam;
use crate::storage::{Memory, Path, Reply, Request, Status};
use std::collections::{BTreeMap, BTreeSet};
use std::format;
use std::string::{String, ToString};
use std::vec::Vec;

/// A storage of `size` bytes in memory, for tests and the drift harness: its files by path and its
/// folders.
pub struct MemoryStorage {
    size: u64,
    files: BTreeMap<String, Vec<u8>>,
    /// Every folder by its path. A folder stays when its last file goes, unless a `Delete` takes
    /// it.
    folders: BTreeSet<String>,
    /// The file that `Begin` started replacing and the bytes appended to it so far.
    replacing: Option<(String, Vec<u8>)>,
}

impl MemoryStorage {
    pub fn new(size: u64) -> Self {
        Self {
            size,
            files: BTreeMap::new(),
            folders: BTreeSet::new(),
            replacing: None,
        }
    }

    /// Puts `bytes` at `path`, making its folders, whatever the size.
    pub fn put(&mut self, path: &str, bytes: Vec<u8>) {
        self.make_folders(path);
        self.files.insert(path.to_string(), bytes);
    }

    pub fn files(&self) -> &BTreeMap<String, Vec<u8>> {
        &self.files
    }

    /// Carries out `request` as `Request` says, with `io` as the I/O buffer, and replies with
    /// number 0 for the caller to set. A commit that would pass the size is `Full`.
    ///
    /// # Safety
    ///
    /// For a `Load` and an `Append` from `SampleRam`, nothing else touches the request's bytes of
    /// `ram` meanwhile: they are blocks of the caller's control side that the audio part was never
    /// told about (see `SampleRam::bytes`).
    pub unsafe fn carry_out(&mut self, request: &Request, io: &mut [u8], ram: &SampleRam) -> Reply {
        let (status, value) = match *request {
            Request::List { folder, from } => self.list(&folder, from, io),
            Request::Read { file, at, length } => match self.part(&file, at, length) {
                Some(part) => {
                    io[..part.len()].copy_from_slice(part);
                    (Status::Done, part.len() as u64)
                }
                None => (Status::Missing, 0),
            },
            Request::Load {
                file,
                at,
                length,
                into,
            } => match self.part(&file, at, length) {
                Some(part) => {
                    // SAFETY: the caller promises that nothing else touches these bytes meanwhile.
                    unsafe { ram.bytes(into, part.len() as u32) }.copy_from_slice(part);
                    (Status::Done, part.len() as u64)
                }
                None => (Status::Missing, 0),
            },
            Request::Begin { file } => {
                self.make_folders(file.as_str());
                self.replacing = Some((file.as_str().to_string(), Vec::new()));
                (Status::Done, 0)
            }
            Request::Append {
                from,
                offset,
                length,
            } => match &mut self.replacing {
                Some((_, bytes)) => {
                    bytes.extend_from_slice(match from {
                        Memory::Io => &io[offset as usize..][..length as usize],
                        // SAFETY: the caller promises that nothing else touches these bytes
                        // meanwhile.
                        Memory::SampleRam => unsafe { ram.bytes(offset, length) },
                    });
                    (Status::Done, 0)
                }
                None => (Status::Failed, 0),
            },
            Request::Commit => match self.replacing.take() {
                Some((file, bytes)) => {
                    let old = self.files.get(&file).map_or(0, Vec::len);
                    if self.used() - old as u64 + bytes.len() as u64 > self.size {
                        (Status::Full, 0)
                    } else {
                        self.files.insert(file, bytes);
                        (Status::Done, 0)
                    }
                }
                None => (Status::Failed, 0),
            },
            Request::Delete { path } => self.delete(path.as_str()),
            Request::Free => (Status::Done, self.size.saturating_sub(self.used())),
        };
        Reply {
            number: 0,
            status,
            value,
        }
    }

    /// Makes every folder above `path`.
    fn make_folders(&mut self, path: &str) {
        for (end, _) in path.match_indices('/') {
            self.folders.insert(path[..end].to_string());
        }
    }

    fn used(&self) -> u64 {
        self.files.values().map(|bytes| bytes.len() as u64).sum()
    }

    /// The bytes of `file` from `at`, at most `length` of them; none when there is no such file.
    fn part(&self, file: &Path, at: u64, length: u32) -> Option<&[u8]> {
        let bytes = self.files.get(file.as_str())?;
        let start = at.min(bytes.len() as u64) as usize;
        Some(&bytes[start..][..(length as usize).min(bytes.len() - start)])
    }

    /// Writes the records of `folder`'s files from entry `from` into `io`, as many as fit.
    fn list(&self, folder: &Path, from: u32, io: &mut [u8]) -> (Status, u64) {
        if !self.folders.contains(folder.as_str()) {
            return (Status::Missing, 0);
        }
        let inside = format!("{}/", folder.as_str());
        let mut entries = self
            .files
            .iter()
            .filter_map(|(path, bytes)| Some((path.strip_prefix(&inside)?, bytes.len())))
            .skip(from as usize)
            .peekable();
        let (mut written, mut end) = (0, 0);
        while let Some((path, size)) =
            entries.next_if(|(path, _)| end + 1 + path.len() + 4 <= io.len())
        {
            let record = &mut io[end..][..1 + path.len() + 4];
            record[0] = path.len() as u8;
            record[1..][..path.len()].copy_from_slice(path.as_bytes());
            record[1 + path.len()..].copy_from_slice(&(size as u32).to_le_bytes());
            end += record.len();
            written += 1;
        }
        let status = if entries.peek().is_some() {
            Status::More
        } else {
            Status::Done
        };
        (status, written)
    }

    /// Deletes a file, or a folder with everything in it, and then the folders that leaves empty,
    /// never `samples` or `tmp`.
    fn delete(&mut self, path: &str) -> (Status, u64) {
        if !(self.files.remove(path).is_some() || self.folders.remove(path)) {
            return (Status::Missing, 0);
        }
        let inside = format!("{path}/");
        self.files.retain(|file, _| !file.starts_with(&inside));
        self.folders.retain(|folder| !folder.starts_with(&inside));
        let mut emptied = path;
        while let Some((parent, _)) = emptied.rsplit_once('/')
            && !["samples", "tmp"].contains(&parent)
            && !self
                .files
                .keys()
                .chain(&self.folders)
                .any(|other| other.starts_with(&format!("{parent}/")))
        {
            self.folders.remove(parent);
            emptied = parent;
        }
        (Status::Done, 0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::vec;

    fn path(text: &str) -> Path {
        let mut path = Path::new();
        path.push_str(text);
        path
    }

    fn reply(status: Status, value: u64) -> Reply {
        Reply {
            number: 0,
            status,
            value,
        }
    }

    fn folders(storage: &MemoryStorage) -> Vec<&str> {
        storage.folders.iter().map(String::as_str).collect()
    }

    #[test]
    fn lists_every_file_under_a_folder_in_pages() {
        let (mut storage, ram) = (MemoryStorage::new(1_000), SampleRam::boxed());
        storage.put("samples/b.wav", vec![0; 3]);
        storage.put("samples/a/c.wav", vec![0; 300]);
        storage.put("samples/a.wav", vec![0; 1]);
        storage.put("tmp/1/d.wav", vec![0; 4]);
        // A record of "a.wav" takes 10 bytes and one of "a/c.wav" 12: no two fit.
        let mut io = [0xFF; 16];
        let mut list = |from| {
            let folder = path("samples");
            // SAFETY: a List touches no sample RAM.
            let reply =
                unsafe { storage.carry_out(&Request::List { folder, from }, &mut io, &ram) };
            (reply, io)
        };

        // "." sorts before "/".
        let (first, records) = list(0);
        assert_eq!(first, reply(Status::More, 1));
        assert_eq!(records[..10], *b"\x05a.wav\x01\0\0\0");
        let (second, records) = list(1);
        assert_eq!(second, reply(Status::More, 1));
        assert_eq!(records[..12], *b"\x07a/c.wav\x2C\x01\0\0");
        let (third, records) = list(2);
        assert_eq!(third, reply(Status::Done, 1));
        assert_eq!(records[..10], *b"\x05b.wav\x03\0\0\0");
        assert_eq!(list(3).0, reply(Status::Done, 0));
        let folder = path("loops");
        // SAFETY: as above.
        assert_eq!(
            unsafe { storage.carry_out(&Request::List { folder, from: 0 }, &mut io, &ram) },
            reply(Status::Missing, 0)
        );
    }

    #[test]
    fn a_replace_is_all_or_nothing() {
        let (mut storage, ram) = (MemoryStorage::new(1_000), SampleRam::boxed());
        let mut io = [0; 8];
        let kick = path("samples/drums/808/kick.wav");
        storage.put("samples/drums/808/kick.wav", vec![1, 2]);
        storage.put("samples/hat.wav", vec![9]);
        let mut carry_out = |request, io: &mut [u8; 8]| {
            // SAFETY: the test's own sample RAM, which nothing else touches meanwhile.
            unsafe { storage.carry_out(&request, io, &ram) }
        };

        assert_eq!(
            carry_out(Request::Commit, &mut io),
            reply(Status::Failed, 0)
        );
        let new = path("samples/loops/new/kick.wav");
        assert_eq!(
            carry_out(Request::Begin { file: new }, &mut io),
            reply(Status::Done, 0)
        );
        assert_eq!(
            carry_out(Request::Begin { file: kick }, &mut io),
            reply(Status::Done, 0)
        );
        io[..3].copy_from_slice(&[3, 4, 5]);
        let append = Request::Append {
            from: Memory::Io,
            offset: 1,
            length: 2,
        };
        assert_eq!(carry_out(append, &mut io), reply(Status::Done, 0));
        // SAFETY: the test's own sample RAM: nothing else reads it.
        unsafe { ram.bytes(2_048, 1) }.copy_from_slice(&[6]);
        let append = Request::Append {
            from: Memory::SampleRam,
            offset: 2_048,
            length: 1,
        };
        assert_eq!(carry_out(append, &mut io), reply(Status::Done, 0));
        let read = Request::Read {
            file: kick,
            at: 0,
            length: 8,
        };
        assert_eq!(carry_out(read, &mut io), reply(Status::Done, 2));
        assert_eq!(io[..2], [1, 2]);

        assert_eq!(carry_out(Request::Commit, &mut io), reply(Status::Done, 0));
        let load = Request::Load {
            file: kick,
            at: 1,
            length: 8,
            into: 4_096,
        };
        assert_eq!(carry_out(load, &mut io), reply(Status::Done, 2));
        // SAFETY: as above.
        assert_eq!(unsafe { ram.bytes(4_096, 3) }, [5, 6, 0]);
        assert_eq!(storage.files()["samples/drums/808/kick.wav"], [4, 5, 6]);
        // The first Begin made its folders and was never committed.
        assert_eq!(storage.files().len(), 2);
        assert_eq!(
            folders(&storage),
            [
                "samples",
                "samples/drums",
                "samples/drums/808",
                "samples/loops",
                "samples/loops/new"
            ]
        );
        let read = Request::Read {
            file: path("samples/snare.wav"),
            at: 0,
            length: 8,
        };
        // SAFETY: a Read touches no sample RAM.
        assert_eq!(
            unsafe { storage.carry_out(&read, &mut io, &ram) },
            reply(Status::Missing, 0)
        );
    }

    #[test]
    fn delete_takes_the_folders_it_empties_but_never_samples_or_tmp() {
        let (mut storage, ram) = (MemoryStorage::new(1_000), SampleRam::boxed());
        storage.put("samples/drums/808/kick.wav", vec![1]);
        storage.put("samples/drums/clap.wav", vec![2]);
        storage.put("tmp/1/drums/hat.wav", vec![3]);
        storage.put("tmp/2/snare.wav", vec![4]);
        let delete = |storage: &mut MemoryStorage, text| {
            let request = Request::Delete { path: path(text) };
            // SAFETY: a Delete touches no sample RAM.
            unsafe { storage.carry_out(&request, &mut [], &ram) }.status
        };

        assert_eq!(
            delete(&mut storage, "samples/drums/808/kick.wav"),
            Status::Done
        );
        assert_eq!(
            folders(&storage),
            [
                "samples",
                "samples/drums",
                "tmp",
                "tmp/1",
                "tmp/1/drums",
                "tmp/2"
            ]
        );
        assert_eq!(delete(&mut storage, "samples/drums/clap.wav"), Status::Done);
        assert_eq!(delete(&mut storage, "tmp/1"), Status::Done);
        assert_eq!(delete(&mut storage, "tmp/2/snare.wav"), Status::Done);
        assert_eq!(delete(&mut storage, "tmp/3"), Status::Missing);
        assert!(storage.files().is_empty());
        assert_eq!(folders(&storage), ["samples", "tmp"]);
        assert_eq!(delete(&mut storage, "tmp"), Status::Done);
        assert_eq!(folders(&storage), ["samples"]);
    }

    #[test]
    fn free_is_the_size_less_the_files() {
        let (mut storage, ram) = (MemoryStorage::new(10), SampleRam::boxed());
        storage.put("samples/a.wav", vec![0; 4]);
        storage.put("samples/b.wav", vec![0; 2]);
        let mut io = [0; 9];
        // SAFETY: none of these requests touches the sample RAM.
        let mut carry_out = |request| unsafe { storage.carry_out(&request, &mut io, &ram) };
        assert_eq!(carry_out(Request::Free), reply(Status::Done, 4));
        let file = path("samples/a.wav");
        let mut replace = |length| {
            carry_out(Request::Begin { file });
            carry_out(Request::Append {
                from: Memory::Io,
                offset: 0,
                length,
            });
            carry_out(Request::Commit)
        };

        // The old bytes of the file it replaces do not count.
        assert_eq!(replace(8), reply(Status::Done, 0));
        assert_eq!(replace(9), reply(Status::Full, 0));
        assert_eq!(carry_out(Request::Free), reply(Status::Done, 0));
        assert_eq!(storage.files()["samples/a.wav"].len(), 8);
    }
}
