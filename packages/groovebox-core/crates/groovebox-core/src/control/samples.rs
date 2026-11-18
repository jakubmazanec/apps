//! SAMPLES and the sample picker: the library by folder, listed and moved through alike (Workflow
//! A).

use super::view::{Cursor, Pick, Picker, SamplesView, moved};
use super::{Control, HeaderMessage};
use crate::input::Button;
use crate::label::Label;
use crate::library::{Entry, FileId, FolderId, Library};
use crate::message::{MESSAGE_QUEUE, Message, MessageKind};
use crate::palette::RECORD;
use crate::project::pool::SOUND_DEFAULTS;
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
    /// An arrow, - or + on SAMPLES or in the sample picker moves the cursor as in a list
    /// (`moved`). Moving onto a file that the audio part may read (`playable`) plays it once
    /// through the preview player, which fades the file it played; moving onto anything else stops
    /// the preview (`stop_preview`). A move that leaves the cursor where it was does nothing.
    pub(super) fn move_in_samples(
        &mut self,
        button: Button,
        sample: u64,
        messages: &mut Producer<'_, Message, MESSAGE_QUEUE>,
    ) {
        let list = *self.view.list();
        let last = rows(&self.library, list.folder).count().saturating_sub(1);
        let item = moved(button, list.cursor.item, last, list.fit());
        if item == list.cursor.item {
            return;
        }
        let on = rows(&self.library, list.folder).nth(item);
        self.view.list().land(item, on);
        if let Some(Row::File(file)) = on
            && let Some(played) = self.playable(file)
        {
            self.previewing = true;
            self.send(sample, MessageKind::Preview { sample: played }, messages);
        } else {
            self.stop_preview(sample, messages);
        }
    }

    /// OK on SAMPLES or in the sample picker stops the preview. On a folder it shows that folder
    /// with the cursor on ".." and on ".." it goes up (`go_up`). On a file the sample picker
    /// closes and chooses it as its `Pick` says: New sample makes a sample sound of it (`NewSound`
    /// and then its values that differ from every default) and puts it on the selected pad, the
    /// Sample item gives the selected sound the file (`take_file`) and ENGINE switches the selected
    /// sound to the sample engine with it (`start_sample`), each sending the values it changed. On
    /// SAMPLES a file opens its Delete picker, unless a delete runs or the import replaces a file:
    /// deletes run one at a time, and never with a replace.
    pub(super) fn ok_in_samples(
        &mut self,
        sample: u64,
        messages: &mut Producer<'_, Message, MESSAGE_QUEUE>,
    ) {
        self.stop_preview(sample, messages);
        let list = self.view.list();
        match list.on {
            Some(Row::Folder(folder)) => {
                *list = SamplesView {
                    folder: Some(folder),
                    cursor: Cursor { item: 0, scroll: 0 },
                    on: Some(Row::Up),
                    ..*list
                };
            }
            Some(Row::Up) => go_up(&self.library, list),
            Some(Row::File(file)) => match self.view.picker {
                Some((Picker::Sample(pick), _)) => {
                    self.view.picker = None;
                    self.end_held_repeats();
                    let audio = *self.library.file(file);
                    let (sound, before) = match pick {
                        Pick::NewSound => {
                            let sound = self.project.pool.new_sample(file, &audio).expect(
                                "New sample opens the sample picker only while the pool has room",
                            );
                            self.send(sample, MessageKind::NewSound { sound }, messages);
                            let pad = self
                                .track()
                                .selected_pad
                                .expect("New sample belongs to the selected pad");
                            self.project.put(pad, Some(sound));
                            (sound, SOUND_DEFAULTS)
                        }
                        Pick::Change | Pick::Switch => {
                            let number = self
                                .track()
                                .selected_sound
                                .expect("the Sample item and ENGINE belong to the selected sound");
                            let sound = self
                                .project
                                .pool
                                .get_mut(number)
                                .expect("a selected sound is in the pool");
                            let before = sound.values;
                            if pick == Pick::Change {
                                sound.take_file(file, &audio);
                            } else {
                                sound.start_sample(file, &audio);
                            }
                            (number, before)
                        }
                    };
                    self.send_values(sound, &before, sample, messages);
                }
                _ if self.delete.is_none() && self.import.replacing().is_none() => {
                    self.view.highlight(Picker::Delete(file), 0);
                    self.end_held_repeats();
                }
                _ => {}
            },
            None => {}
        }
    }

    /// Opens the sample picker for `pick` (S13): on the row of `on` in its folder, or without a
    /// file on the first row of the folder it was last in. Opening plays nothing.
    pub(super) fn open_sample_picker(&mut self, pick: Pick, on: Option<FileId>) {
        let folder = on.map_or(self.view.sample_picker.folder, |file| {
            self.library.file(file).folder
        });
        let item = on.map_or(0, |file| {
            rows(&self.library, folder)
                .position(|row| row == Row::File(file))
                .expect("a file is a row of its folder")
        });
        self.view.sample_picker = SamplesView {
            folder,
            ..SamplesView::top(true)
        };
        self.view
            .sample_picker
            .land(item, rows(&self.library, folder).nth(item));
        self.view.picker = Some((Picker::Sample(pick), Cursor { item: 0, scroll: 0 }));
        self.end_held_repeats();
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
    /// then moves from the row that is gone to the row above (`keep_samples_cursor`). The sample
    /// picker goes to the top level when its folder is one of those folders. Otherwise the file
    /// stays, in the sample RAM too, and the header says in red "clap.wav not deleted".
    #[allow(unsafe_code)]
    pub(super) fn deleted(&mut self, file: FileId, status: Status, tables: &Tables) {
        self.delete = None;
        // A file the storage no longer holds is gone all the same.
        if matches!(status, Status::Done | Status::Missing) {
            let emptied = |shown| {
                self.library
                    .emptied_by(file)
                    .any(|emptied| emptied == shown)
            };
            while self.view.samples.folder.is_some_and(emptied) {
                go_up(&self.library, &mut self.view.samples);
            }
            // A folder that is gone gives the sample picker the top level (S13).
            if self.view.sample_picker.folder.is_some_and(emptied) {
                self.view.sample_picker = SamplesView::top(true);
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

    /// A tap of CANCEL on SAMPLES or in the sample picker stops the preview and goes up (`go_up`).
    /// At the top level it closes the sample picker without choosing.
    pub(super) fn cancel_in_samples(
        &mut self,
        sample: u64,
        messages: &mut Producer<'_, Message, MESSAGE_QUEUE>,
    ) {
        self.stop_preview(sample, messages);
        if self.view.picker.is_some() && self.view.sample_picker.folder.is_none() {
            self.view.picker = None;
            self.end_held_repeats();
        } else {
            go_up(&self.library, self.view.list());
        }
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

    /// Keeps the cursors of SAMPLES and of the sample picker on their rows while rows come or go
    /// above them. When its row is gone a cursor moves to the nearest row above, and while the
    /// folder had no rows it goes on the first one that comes.
    pub(super) fn keep_samples_cursor(&mut self) {
        for list in [&mut self.view.samples, &mut self.view.sample_picker] {
            let folder = list.folder;
            let listed = || rows(&self.library, folder);
            let item = match list.on {
                Some(on) => listed()
                    .position(|row| row == on)
                    .unwrap_or(list.cursor.item.saturating_sub(1)),
                None => 0,
            };
            let item = item.min(listed().count().saturating_sub(1));
            list.land(item, listed().nth(item));
        }
    }
}

/// Shows in `list` the folder that holds the one it shows, with the cursor on the folder left. At
/// the top level it does nothing.
fn go_up(library: &Library, list: &mut SamplesView) {
    let Some(left) = list.folder else {
        return;
    };
    let folder = library.folder(left).parent;
    let item = rows(library, folder)
        .position(|row| row == Row::Folder(left))
        .expect("a folder is a row of the folder that holds it");
    *list = SamplesView {
        folder,
        cursor: Cursor { item: 0, scroll: 0 },
        on: None,
        ..*list
    };
    list.land(item, Some(Row::Folder(left)));
}
