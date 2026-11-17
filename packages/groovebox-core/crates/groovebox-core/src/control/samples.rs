//! SAMPLES: the library by folder, listed and moved through as the sample picker does (Workflow A).

use super::view::{Cursor, Picker, SamplesView, moved};
use super::{Control, HeaderMessage};
use crate::input::Button;
use crate::label::Label;
use crate::library::{Entry, File, FileId, FolderId, Library};
use crate::message::{MESSAGE_QUEUE, Message, MessageKind};
use crate::palette::RECORD;
use crate::queue::Producer;
use crate::sample_ram::Tables;
use crate::storage::Status;

/// A row of SAMPLES.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Row {
    /// "..", the first row inside a folder.
    Up,
    Folder(FolderId),
    File(FileId),
}

/// What the delete's job waits for.
#[derive(Clone, Copy)]
pub(super) enum Deleting {
    /// The applied report of the file's `ForgetSample`.
    LetGo,
    /// Its turn to send the file's `Delete`: the reply to the import's request that is out.
    Turn,
    /// The reply to the file's `Delete`.
    Reply,
}

/// The rows of `folder`, or of the top level: inside a folder ".." first, then the folders and the
/// files it holds in the library's order.
pub fn rows(library: &Library, folder: Option<FolderId>) -> impl Iterator<Item = Row> + '_ {
    folder
        .map(|_| Row::Up)
        .into_iter()
        .chain(library.entries(folder).map(|entry| match entry {
            Entry::Folder(folder) => Row::Folder(folder),
            Entry::File(file) => Row::File(file),
        }))
}

impl Control {
    /// An arrow, - or + on SAMPLES moves the cursor as in a list (`moved`). Moving onto a loaded
    /// file plays it once through the preview player, which fades the file it played, unless it
    /// is being deleted; moving onto anything else stops the preview (`stop_preview`). A move that
    /// leaves the cursor where it was does nothing.
    pub(super) fn move_in_samples(
        &mut self,
        button: Button,
        sample: u64,
        messages: &mut Producer<'_, Message, MESSAGE_QUEUE>,
    ) {
        let samples = self.view.samples;
        let last = rows(&self.library, samples.folder)
            .count()
            .saturating_sub(1);
        let item = moved(button, samples.cursor.item, last, samples.fit());
        if item == samples.cursor.item {
            return;
        }
        let on = rows(&self.library, samples.folder).nth(item);
        self.view.samples.land(item, on);
        match on {
            Some(Row::File(file))
                if self.library.file(file).loaded
                    && self.delete.is_none_or(|(deleted, _)| deleted != file) =>
            {
                let File {
                    frames, channels, ..
                } = *self.library.file(file);
                self.previewing = true;
                self.send(
                    sample,
                    MessageKind::Preview {
                        file,
                        frames,
                        stereo: channels == 2,
                    },
                    messages,
                );
            }
            _ => self.stop_preview(sample, messages),
        }
    }

    /// OK on SAMPLES stops the preview. On a folder it shows that folder with the cursor on "..",
    /// on ".." it goes up (`go_up`) and on a file it opens the file's Delete picker, unless a
    /// delete runs: deletes run one at a time.
    pub(super) fn ok_in_samples(
        &mut self,
        sample: u64,
        messages: &mut Producer<'_, Message, MESSAGE_QUEUE>,
    ) {
        self.stop_preview(sample, messages);
        match self.view.samples.on {
            Some(Row::Folder(folder)) => {
                self.view.samples = SamplesView {
                    folder: Some(folder),
                    cursor: Cursor { item: 0, scroll: 0 },
                    on: Some(Row::Up),
                };
            }
            Some(Row::Up) => self.go_up(),
            Some(Row::File(file)) if self.delete.is_none() => {
                self.view.highlight(Picker::Delete(file), 0);
                self.end_held_repeats();
            }
            Some(Row::File(_)) | None => {}
        }
    }

    /// Starts deleting `file`: the audio part first lets go of a loaded file (`ForgetSample`),
    /// and one that is not loaded goes straight to the storage (`put_request`).
    pub(super) fn delete_file(
        &mut self,
        file: FileId,
        sample: u64,
        messages: &mut Producer<'_, Message, MESSAGE_QUEUE>,
    ) {
        if self.library.file(file).loaded {
            self.send(sample, MessageKind::ForgetSample { file }, messages);
            self.delete = Some((file, Deleting::LetGo));
        } else {
            self.delete = Some((file, Deleting::Turn));
            self.put_request();
        }
    }

    /// The storage's reply to the `Delete` of `file`, which ends the delete. Once the storage no
    /// longer holds the file, SAMPLES leaves each folder that holds nothing but the file, as CANCEL
    /// does, and the library unlists the file and those folders and frees its blocks: the cursor
    /// then moves from the row that is gone to the row above (`keep_samples_cursor`). Otherwise
    /// the file stays, in the sample RAM too, and the header says in red "clap.wav not deleted".
    #[allow(unsafe_code)]
    pub(super) fn deleted(&mut self, file: FileId, status: Status, tables: &Tables) {
        self.delete = None;
        // A file the storage no longer holds is gone all the same.
        if matches!(status, Status::Done | Status::Missing) {
            while self.view.samples.folder.is_some_and(|shown| {
                self.library
                    .emptied_by(file)
                    .any(|emptied| emptied == shown)
            }) {
                self.go_up();
            }
            // SAFETY: the applied report of the file's `ForgetSample` came back, or the file is
            // not loaded, so the audio part was never told about it.
            unsafe { self.library.remove(file, tables) };
        } else {
            let mut text = Label::new();
            text.push_str(self.library.file(file).name.as_str());
            let name = (0, text.as_str().len());
            text.push_str(" not deleted");
            self.message = Some(HeaderMessage {
                text,
                color: RECORD,
                name,
            });
        }
        self.put_request();
    }

    /// A tap of CANCEL on SAMPLES stops the preview and goes up (`go_up`).
    pub(super) fn cancel_in_samples(
        &mut self,
        sample: u64,
        messages: &mut Producer<'_, Message, MESSAGE_QUEUE>,
    ) {
        self.stop_preview(sample, messages);
        self.go_up();
    }

    /// Shows the folder that holds the one shown, with the cursor on the folder left. At the top
    /// level it does nothing.
    fn go_up(&mut self) {
        let Some(left) = self.view.samples.folder else {
            return;
        };
        let folder = self.library.folder(left).parent;
        let item = rows(&self.library, folder)
            .position(|row| row == Row::Folder(left))
            .expect("a folder is a row of the folder that holds it");
        let mut up = SamplesView {
            folder,
            cursor: Cursor { item: 0, scroll: 0 },
            on: None,
        };
        up.land(item, Some(Row::Folder(left)));
        self.view.samples = up;
    }

    /// Fades the preview out when one was started since the last stop.
    pub(super) fn stop_preview(
        &mut self,
        sample: u64,
        messages: &mut Producer<'_, Message, MESSAGE_QUEUE>,
    ) {
        if core::mem::take(&mut self.previewing) {
            self.send(sample, MessageKind::StopPreview, messages);
        }
    }

    /// Keeps SAMPLES' cursor on its row while rows come or go above it. When its row is gone the
    /// cursor moves to the nearest row above, and while the folder had no rows it goes on the
    /// first one that comes.
    pub(super) fn keep_samples_cursor(&mut self) {
        let samples = self.view.samples;
        let listed = || rows(&self.library, samples.folder);
        let item = match samples.on {
            Some(on) => listed()
                .position(|row| row == on)
                .unwrap_or(samples.cursor.item.saturating_sub(1)),
            None => 0,
        };
        let item = item.min(listed().count().saturating_sub(1));
        self.view.samples.land(item, listed().nth(item));
    }
}
