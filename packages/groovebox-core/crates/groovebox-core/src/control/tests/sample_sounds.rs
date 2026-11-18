//! New sample, the sample picker and the notes of sample sounds.

use super::library::{converted_with, row};
use super::sound::{names, pad_page, set_param, sound_header};
use super::*;
use crate::library::wav::{self, Encoding};
use crate::library::{FileId, FolderId};
use crate::message::SampleFile;
use crate::param::{END, LOOP, LOOP_END, LOOP_START, ONE_SHOT, ROOT_NOTE, TRIGGER};
use crate::project::pool::{Engine, Sample};
use crate::ui::list::{Row, draw_rows};
use crate::ui::text;
use samples::Row as Line;
use view::{Cursor, Pick, Picker, SamplesView};

/// At the top level bass.wav, a second of stereo with a loop of its own and root note 36. In drums/
/// kick.wav, a tenth of a second of mono with root note 48, and snare.wav; in drums/808/ boom.wav.
/// They are files 0 to 3 in the order of their paths, and drums/ and 808/ are folders 0 and 1.
fn library() -> [(&'static str, Vec<u8>); 4] {
    [
        (
            "samples/bass.wav",
            converted_with(48_000, 2, 36, Some((1_000, 39_999))),
        ),
        (
            "samples/drums/808/boom.wav",
            converted_with(2_400, 1, 60, None),
        ),
        ("samples/drums/kick.wav", converted_with(4_800, 1, 48, None)),
        (
            "samples/drums/snare.wav",
            converted_with(9_600, 1, 60, None),
        ),
    ]
}

const BASS: SampleFile = SampleFile {
    file: FileId(0),
    frames: 48_000,
    stereo: true,
};
const BOOM: SampleFile = SampleFile {
    file: FileId(1),
    frames: 2_400,
    stereo: false,
};
const KICK: SampleFile = SampleFile {
    file: FileId(2),
    frames: 4_800,
    stereo: false,
};
const SNARE: SampleFile = SampleFile {
    file: FileId(3),
    frames: 9_600,
    stereo: false,
};

const TOP: Cursor = Cursor { item: 0, scroll: 0 };

/// A rig whose library holds `library()`, with pad 1 selected on SOUND and the sample picker that
/// New sample opened, from sample 10 to 31.
fn picking(queue: &Queue<Message, MESSAGE_QUEUE>) -> Rig<'_> {
    let mut rig = Rig::with_files(queue, &library());
    rig.open();
    rig.menu(10, 2);
    rig.tap(20, Button::Ok);
    rig.tap(25, Button::Down);
    rig.tap(30, Button::Ok);
    rig.step(40);
    rig
}

/// The sample picker in `folder`, unscrolled, with its cursor on row `item`, which is `on`.
fn picker_at(folder: Option<FolderId>, item: usize, on: Line) -> SamplesView {
    SamplesView {
        folder,
        cursor: Cursor { item, scroll: 0 },
        on: Some(on),
        top_line: true,
    }
}

/// The sample picker over SOUND's Pad page of the empty pad 1: the dim `line`, then `rows` from
/// row `cursor.scroll` with the cursor on row `cursor.item`, and an empty strip.
fn sample_picker(line: &str, rows: &[Row], cursor: Cursor) -> Screen {
    drawn(
        &sound_header(("1", DIM)),
        None,
        |screen| {
            text::draw(screen, 5, 17, line, DIM);
            draw_rows(screen, 31, 15, rows, cursor.scroll, Some(cursor.item), 0);
        },
        &[None; 4],
    )
}

fn preview(sample: SampleFile) -> MessageKind {
    MessageKind::Preview { sample }
}

/// A note of `sound` on track 1 at `pitch`, playing `sample`.
fn sample_note(
    note: u32,
    sound: SoundNumber,
    pitch: u8,
    sample: Option<SampleFile>,
) -> MessageKind {
    MessageKind::NoteOn {
        note: NoteId(note),
        track: 0,
        sound,
        pitch,
        velocity: 100,
        engine: NoteEngine::Sample(sample),
    }
}

/// Makes a sample sound of `file` and puts it on `pad` of the current track.
fn sample_on(rig: &mut Rig<'_>, pad: u8, file: FileId) -> SoundNumber {
    let audio = *rig.control.library.file(file);
    let sound = rig.control.project.pool.new_sample(file, &audio).unwrap();
    rig.control.project.put(pad, Some(sound));
    sound
}

#[test]
fn the_sound_picker_offers_new_sample_between_empty_and_new_synth() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);
    rig.menu(0, 2);
    rig.tap(10, Button::Ok);
    rig.step(20);

    // The pool starts on row 3, so the picker opens there on Syn 1.
    assert_eq!(
        rig.control.view.picker,
        Some((Picker::Sound, Cursor { item: 3, scroll: 0 }))
    );
    assert!(shows(
        &rig.control,
        &drawn(
            &sound_header(("Syn 1", TEXT)),
            None,
            |screen| {
                draw_rows(
                    screen,
                    17,
                    16,
                    &[
                        row("Empty", None),
                        row("New sample", None),
                        row("New synth", None),
                        row("Syn 1", Some("synth")),
                    ],
                    0,
                    Some(3),
                    0,
                );
            },
            &[None; 4],
        )
    ));

    // New synth is row 2.
    rig.tap(30, Button::Up);
    rig.tap(40, Button::Ok);
    rig.step(50);
    assert_eq!(
        rig.sent(),
        [message(
            0,
            40,
            MessageKind::NewSound {
                sound: SoundNumber(2)
            }
        )]
    );
    assert_eq!(rig.track().pads[0], Some(SoundNumber(2)));
}

#[test]
fn new_sample_opens_the_sample_picker_at_the_top_on_its_first_row_and_plays_nothing() {
    let queue = Queue::new();
    let mut rig = picking(&queue);

    assert_eq!(
        rig.control.view.picker.map(|(picker, _)| picker),
        Some(Picker::Sample(Pick::NewSound))
    );
    assert_eq!(
        rig.control.view.sample_picker,
        picker_at(None, 0, Line::Folder(FolderId(0)))
    );
    assert_eq!(rig.sent(), []);
    assert!(rig.control.project.pool.sounds().is_empty());
    assert_eq!(rig.track().pads[0], None);
}

#[test]
fn the_sample_picker_draws_its_top_line_and_the_librarys_rows() {
    let queue = Queue::new();
    let mut rig = picking(&queue);

    // At the top level the line holds the meter alone.
    assert!(shows(
        &rig.control,
        &sample_picker(
            "Library 0.2 of 64 MB",
            &[row("drums/", None), row("bass.wav", Some("1.0 s  192 KB"))],
            TOP
        )
    ));
    assert_eq!(rig.control.view.sample_picker.fit(), 15);

    // Inside a folder it names the folder first, and 15 rows still fit under it.
    rig.tap(100, Button::Ok);
    rig.step(110);
    assert!(shows(
        &rig.control,
        &sample_picker(
            "drums/  Library 0.2 of 64 MB",
            &[
                row("..", None),
                row("808/", None),
                row("kick.wav", Some("0.1 s  10 KB")),
                row("snare.wav", Some("0.2 s  19 KB")),
            ],
            TOP
        )
    ));
    assert_eq!(rig.control.view.sample_picker.fit(), 15);
}

#[test]
fn a_remembered_folder_that_is_gone_opens_the_top_level() {
    let queue = Queue::new();
    let mut rig = picking(&queue);
    // boom.wav from 808/ goes on pad 1, so the picker was last in 808/.
    rig.tap(100, Button::Ok);
    rig.tap(110, Button::Down);
    rig.tap(120, Button::Ok);
    rig.tap(130, Button::Down);
    rig.tap(140, Button::Ok);
    rig.step(150);
    assert_eq!(rig.control.view.sample_picker.folder, Some(FolderId(1)));

    // SAMPLES deletes boom.wav, and 808/ with it.
    rig.menu(200, 9);
    for (sample, button) in [
        (210, Button::Ok),
        (220, Button::Down),
        (230, Button::Ok),
        (240, Button::Down),
        (250, Button::Ok),
        (260, Button::Ok),
        (270, Button::Ok),
    ] {
        rig.tap(sample, button);
    }
    rig.step(280);
    let forget = rig.sent().pop().unwrap();
    assert_eq!(forget.kind, MessageKind::ForgetSample { file: FileId(1) });
    rig.control.applied(forget.number, 288);
    rig.settle(300);
    // SAMPLES left 808/, which is gone.
    assert_eq!(rig.control.view.samples.folder, Some(FolderId(0)));

    // New sample from pad 1's sound, row 3: up twice.
    rig.menu(400, 2);
    rig.tap(410, Button::Ok);
    rig.tap(420, Button::Up);
    rig.tap(430, Button::Up);
    rig.tap(440, Button::Ok);
    rig.step(450);
    assert_eq!(
        rig.control.view.picker.map(|(picker, _)| picker),
        Some(Picker::Sample(Pick::NewSound))
    );
    assert_eq!(
        rig.control.view.sample_picker,
        picker_at(None, 0, Line::Folder(FolderId(0)))
    );
}

#[test]
fn moving_onto_a_file_in_the_picker_previews_it_and_a_folder_stops_it() {
    let queue = Queue::new();
    let mut rig = picking(&queue);

    // Down onto bass.wav, up onto drums/, OK into it, right onto snare.wav, up onto kick.wav and
    // up onto 808/.
    for (sample, button) in [
        (100, Button::Down),
        (110, Button::Up),
        (120, Button::Ok),
        (130, Button::Right),
        (140, Button::Up),
        (150, Button::Up),
    ] {
        rig.tap(sample, button);
    }
    rig.step(160);

    assert_eq!(
        rig.sent(),
        [
            message(0, 100, preview(BASS)),
            message(1, 110, MessageKind::StopPreview),
            message(2, 130, preview(SNARE)),
            message(3, 140, preview(KICK)),
            message(4, 150, MessageKind::StopPreview),
        ]
    );
    assert_eq!(
        rig.control.view.sample_picker,
        picker_at(Some(FolderId(0)), 1, Line::Folder(FolderId(1)))
    );
}

#[test]
fn ok_on_a_file_puts_a_new_sample_sound_on_the_pad() {
    let queue = Queue::new();
    let mut rig = picking(&queue);
    rig.tap(100, Button::Ok);
    rig.tap(110, Button::Down);
    rig.tap(120, Button::Down);

    rig.tap(130, Button::Ok);
    rig.step(140);

    let kick = SoundNumber(1);
    assert_eq!(
        rig.sent(),
        [
            message(0, 120, preview(KICK)),
            message(1, 130, MessageKind::StopPreview),
            message(2, 130, MessageKind::NewSound { sound: kick }),
            message(3, 130, set_param(kick, TRIGGER.id, ONE_SHOT)),
            message(4, 130, set_param(kick, END.id, 4_799)),
            message(5, 130, set_param(kick, LOOP_END.id, 4_799)),
            message(6, 130, set_param(kick, ROOT_NOTE.id, 48)),
        ]
    );
    assert_eq!(rig.control.view.picker, None);
    assert_eq!(rig.track().pads[0], Some(kick));
    let made = rig.control.project.pool.get(kick).unwrap();
    assert_eq!(made.name.as_str(), "kick");
    assert_eq!(made.engine, Engine::Sample(Sample::File(KICK.file)));
    assert!(shows(
        &rig.control,
        &pad_page(
            &sound_header(("kick", TEXT)),
            None,
            &[sound("kick"), copy("on 1 pad")],
            0,
            names(&[(0, "kick")]),
            0,
        )
    ));
}

#[test]
fn a_new_sample_sound_waits_for_room_for_its_messages() {
    let queue = Queue::new();
    let mut rig = picking(&queue);
    rig.tap(100, Button::Down);
    rig.step(110);
    rig.sent();
    rig.fill_the_message_queue();
    assert_eq!(rig.producer.free(), 7);

    // OK on bass.wav sends seven messages, and an event waits for room for eight.
    rig.tap(200, Button::Ok);
    assert!(!rig.step(300));
    assert!(rig.control.view.picker.is_some());
    assert!(rig.control.project.pool.sounds().is_empty());

    rig.consumer.pop();
    assert!(rig.step(300));
    assert_eq!(rig.control.view.picker, None);
    let bass = SoundNumber(1);
    let sent = rig.sent();
    assert_eq!(
        sent[sent.len() - 7..],
        [
            message(1, 200, MessageKind::StopPreview),
            message(2, 200, MessageKind::NewSound { sound: bass }),
            message(3, 200, set_param(bass, END.id, 47_999)),
            message(4, 200, set_param(bass, LOOP.id, 1)),
            message(5, 200, set_param(bass, LOOP_START.id, 1_000)),
            message(6, 200, set_param(bass, LOOP_END.id, 39_999)),
            message(7, 200, set_param(bass, ROOT_NOTE.id, 36)),
        ]
    );
}

#[test]
fn cancel_goes_up_and_closes_at_the_top_without_choosing() {
    let queue = Queue::new();
    let mut rig = picking(&queue);
    let at_808 = picker_at(Some(FolderId(0)), 1, Line::Folder(FolderId(1)));
    let at_drums = picker_at(None, 0, Line::Folder(FolderId(0)));

    // Into 808/ and onto boom.wav, then CANCEL goes up onto 808/ and stops the preview.
    rig.tap(100, Button::Ok);
    rig.tap(110, Button::Down);
    rig.tap(120, Button::Ok);
    rig.tap(130, Button::Down);
    rig.tap(140, Button::Cancel);
    rig.step(150);
    assert_eq!(rig.control.view.sample_picker, at_808);
    assert!(rig.control.view.picker.is_some());

    rig.tap(200, Button::Cancel);
    rig.step(210);
    assert_eq!(rig.control.view.sample_picker, at_drums);
    assert!(rig.control.view.picker.is_some());

    // At the top level it closes without choosing.
    rig.tap(300, Button::Cancel);
    rig.step(310);
    assert_eq!(rig.control.view.picker, None);
    assert_eq!(
        rig.sent(),
        [
            message(0, 130, preview(BOOM)),
            message(1, 141, MessageKind::StopPreview)
        ]
    );
    assert!(rig.control.project.pool.sounds().is_empty());
    assert!(shows(
        &rig.control,
        &pad_page(
            &sound_header(("1", DIM)),
            None,
            &[sound("Empty")],
            0,
            names(&[]),
            0,
        )
    ));
}

#[test]
fn the_picker_reopens_in_the_folder_it_was_last_in() {
    let queue = Queue::new();
    let mut rig = picking(&queue);
    // snare.wav from drums/ goes on pad 1.
    rig.tap(100, Button::Ok);
    rig.tap(110, Button::Right);
    rig.tap(120, Button::Ok);
    rig.step(130);
    assert_eq!(rig.track().pads[0], Some(SoundNumber(1)));

    // New sample for pad 2 opens in drums/, on its first row, and plays nothing.
    rig.hit(200, 1, 100);
    rig.release(210, 1);
    rig.tap(220, Button::Ok);
    rig.tap(230, Button::Down);
    rig.tap(240, Button::Ok);
    rig.sent();
    rig.step(250);

    assert_eq!(
        rig.control.view.sample_picker,
        picker_at(Some(FolderId(0)), 0, Line::Up)
    );
    assert_eq!(rig.sent(), []);
}

#[test]
fn a_full_pool_refuses_new_sample_at_once() {
    let queue = Queue::new();
    let mut rig = Rig::with_files(&queue, &library());
    rig.open();
    for _ in 0..1_024 {
        rig.control.project.pool.new_synth().unwrap();
    }

    rig.menu(10, 2);
    rig.tap(20, Button::Ok);
    rig.tap(25, Button::Down);
    rig.tap(30, Button::Ok);
    rig.step(40);

    assert_eq!(rig.control.view.picker, None);
    assert_eq!(rig.sent(), []);
    assert_eq!(rig.track().pads[0], None);
    assert!(shows(
        &rig.control,
        &pad_page(
            &sound_header(("1", DIM)),
            Some(("Pool full", RECORD)),
            &[sound("Empty")],
            0,
            names(&[]),
            0,
        )
    ));
}

#[test]
fn an_import_while_the_picker_is_open_keeps_its_cursor_on_its_row() {
    let queue = Queue::new();
    let mut rig = picking(&queue);
    rig.tap(100, Button::Down);
    rig.step(110);
    rig.sent();

    // arp.wav comes in above bass.wav: the cursor moves down with bass.wav and plays nothing.
    let short = || wav::sine(100.0, 0.01, 48_000, Encoding::Int16, 1);
    rig.drop_files(200, &[("tmp/1/arp.wav", short())]);
    rig.settle(210);
    assert_eq!(
        rig.control.view.sample_picker,
        picker_at(None, 2, Line::File(BASS.file))
    );
    assert_eq!(rig.sent(), []);

    // A drop of bass.wav replaces it, and the cursor stays on the new file.
    rig.drop_files(300, &[("tmp/2/bass.wav", short())]);
    rig.settle(310);
    let forget = rig.sent().pop().unwrap();
    assert_eq!(forget.kind, MessageKind::ForgetSample { file: BASS.file });
    rig.control.applied(forget.number, 320);
    rig.settle(400);
    assert_eq!(
        rig.control.view.sample_picker,
        picker_at(None, 2, Line::File(FileId(5)))
    );
    assert_eq!(
        rig.control.library.file(FileId(5)).name.as_str(),
        "bass.wav"
    );
}

#[test]
fn a_not_loaded_file_is_red_never_previewed_and_can_be_chosen() {
    let queue = Queue::new();
    let plain = wav::sine(440.0, 0.5, 44_100, Encoding::Int16, 1);
    let mut rig = Rig::with_files(
        &queue,
        &[
            ("samples/bass.wav", converted_with(48_000, 2, 36, None)),
            ("samples/plain.wav", plain),
        ],
    );
    rig.open();
    rig.menu(10, 2);
    rig.tap(20, Button::Ok);
    rig.tap(25, Button::Down);
    rig.tap(30, Button::Ok);

    // Down onto plain.wav plays nothing, up onto bass.wav plays it and down stops it.
    rig.tap(100, Button::Down);
    rig.tap(110, Button::Up);
    rig.tap(120, Button::Down);
    rig.step(130);
    assert!(shows(
        &rig.control,
        &sample_picker(
            "Library 0.2 of 64 MB",
            &[
                row("bass.wav", Some("1.0 s  192 KB")),
                Row {
                    left: "plain.wav",
                    right: Some("not loaded"),
                    alert: true
                }
            ],
            Cursor { item: 1, scroll: 0 }
        )
    ));
    assert_eq!(
        rig.sent(),
        [
            message(0, 110, preview(BASS)),
            message(1, 120, MessageKind::StopPreview)
        ]
    );

    // OK chooses it: a sample sound of a file that is not loaded, whose notes carry no file.
    rig.tap(200, Button::Ok);
    rig.hit(300, 0, 100);
    rig.step(310);
    let plain = SoundNumber(1);
    assert_eq!(
        rig.sent(),
        [
            message(2, 200, MessageKind::NewSound { sound: plain }),
            message(3, 200, set_param(plain, TRIGGER.id, ONE_SHOT)),
            message(4, 200, set_param(plain, ROOT_NOTE.id, 0)),
            message(5, 300, sample_note(0, plain, 0, None)),
        ]
    );
    let made = rig.control.project.pool.get(plain).unwrap();
    assert_eq!(made.name.as_str(), "plain");
    assert_eq!(made.engine, Engine::Sample(Sample::File(FileId(1))));
}

#[test]
fn pads_mode_plays_a_sample_sound_at_its_root() {
    let queue = Queue::new();
    let mut rig = Rig::with_files(&queue, &library());
    rig.open();
    let kick = sample_on(&mut rig, 0, KICK.file);
    let syn = rig.synth_on(1);

    rig.hit(100, 0, 100);
    rig.hit(110, 1, 100);
    rig.step(120);

    assert_eq!(
        rig.sent(),
        [
            message(0, 100, sample_note(0, kick, 48, Some(KICK))),
            message(1, 110, note_on(1, 0, syn, 60, 100)),
        ]
    );
}

#[test]
fn keys_mode_plays_a_sample_sound_at_the_keys_pitch() {
    let queue = Queue::new();
    let mut rig = Rig::with_files(&queue, &library());
    rig.open();
    let kick = sample_on(&mut rig, 0, KICK.file);
    rig.tap(10, Button::PadsKeys);

    rig.hit(100, 4, 100);
    rig.step(120);

    assert_eq!(
        rig.sent(),
        [message(0, 100, sample_note(0, kick, 64, Some(KICK)))]
    );
}
