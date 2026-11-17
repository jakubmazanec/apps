//! SAMPLES: the library by folder, listed and moved through as the sample picker does (Workflow A).

use super::Control;
use super::view::{Cursor, SamplesView, moved};
use crate::input::Button;
use crate::library::{Entry, File, FileId, FolderId, Library};
use crate::message::{MESSAGE_QUEUE, Message, MessageKind};
use crate::queue::Producer;

/// A row of SAMPLES.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Row {
    /// "..", the first row inside a folder.
    Up,
    Folder(FolderId),
    File(FileId),
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
    /// file plays it once through the preview player, which fades the file it played; moving onto
    /// anything else stops the preview (`stop_preview`). A move that leaves the cursor where it
    /// was does nothing.
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
            Some(Row::File(file)) if self.library.file(file).loaded => {
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
    /// and on ".." it goes up (`go_up`).
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
            Some(Row::File(_)) | None => {}
        }
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
