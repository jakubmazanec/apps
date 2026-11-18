//! New sample, the sample picker, the notes of sample sounds, ENGINE, the Sample page and a used
//! file that is deleted or replaced.

use super::library::{converted_with, row};
use super::sound::{names, pad_page, set_param, sound_header};
use super::*;
use crate::library::wav::{self, Encoding, Ours};
use crate::library::{FileId, FolderId};
use crate::message::SampleFile;
use crate::palette::NOTE_MID;
use crate::param::{
    END, LOOP, LOOP_END, LOOP_START, ONE_SHOT, REVERSE, ROOT_NOTE, START, SUPERSAW, TRIGGER, WAVE,
};
use crate::project::pool::{Engine, Sample};
use crate::storage::Path;
use crate::ui::list::{Row, draw_rows};
use crate::ui::question::draw_question;
use crate::ui::text;
use samples::Row as Line;
use view::{Cursor, Pick, Picker, SamplesView};

/// At the top level bass.wav, a second of stereo with a loop of its own and root note 36. In drums/
/// kick.wav (a tenth of a second of mono with root note 48) and snare.wav; in drums/808/ boom.wav.
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
/// row `cursor.scroll` with the cursor on row `cursor.item`; the strip is empty.
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
            &[sound("kick"), copy("on 1 pad"), engine("Sample")],
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

/// A file as the device converts it: `channels` channels of the interleaved `samples`, with the
/// fingerprint `[fingerprint; 16]`.
fn audio(channels: u8, samples: &[i16], fingerprint: u8) -> Vec<u8> {
    let mut file = std::vec![0; 512];
    let ours = Ours {
        fingerprint: [fingerprint; 16],
        original: Label::new(),
    };
    let frames = samples.len() as u32 / u32::from(channels);
    let head = wav::write_header(&mut file, channels, frames, 60, None, &ours);
    file.truncate(head);
    file.extend(samples.iter().flat_map(|sample| sample.to_le_bytes()));
    file
}

/// The Engine picker over SOUND's Pad page of the sound `name`, its cursor on row `cursor`: Sample,
/// then Synth. The strip is empty.
fn engine_picker(name: &str, cursor: usize) -> Screen {
    drawn(
        &sound_header((name, TEXT)),
        None,
        |screen| {
            draw_rows(
                screen,
                17,
                16,
                &[row("Sample", None), row("Synth", None)],
                0,
                Some(cursor),
                0,
            );
        },
        &[None; 4],
    )
}

/// An item of the Sample page, on encoder `encoder` where one holds it.
fn item<'a>(encoder: Option<u8>, name: &'a str, value: &'a str, bar: Bar) -> ItemView<'a> {
    ItemView {
        encoder,
        name,
        value,
        bar,
    }
}

/// The frame entry `id` as an item no encoder holds.
fn point(id: ParamId) -> ItemDef {
    ItemDef {
        kind: ItemKind::Param(id),
        encoder: None,
    }
}

#[test]
fn the_pad_page_shows_engine_on_encoder_3() {
    let queue = Queue::new();
    let mut rig = Rig::with_files(&queue, &library());
    rig.open();
    sample_on(&mut rig, 0, KICK.file);
    rig.synth_on(1);
    rig.menu(10, 2);
    rig.step(20);

    assert!(shows(
        &rig.control,
        &pad_page(
            &sound_header(("kick", TEXT)),
            None,
            &[sound("kick"), copy("on 1 pad"), engine("Sample")],
            0,
            names(&[(0, "kick"), (1, "Syn 1")]),
            0,
        )
    ));

    rig.hit(30, 1, 100);
    rig.release(40, 1);
    rig.step(50);
    assert!(shows(
        &rig.control,
        &pad_page(
            &sound_header(("Syn 1", TEXT)),
            None,
            &[sound("Syn 1"), copy("on 1 pad"), engine("Synth")],
            0,
            names(&[(0, "kick"), (1, "Syn 1")]),
            1,
        )
    ));
}

#[test]
fn engine_opens_a_picker_on_the_current_engine() {
    let queue = Queue::new();
    let mut rig = Rig::with_files(&queue, &library());
    rig.open();
    let syn = rig.synth_on(0);
    rig.menu(10, 2);

    // OK with the cursor on Engine opens it on Synth.
    rig.tap(20, Button::Down);
    rig.tap(30, Button::Down);
    rig.tap(40, Button::Ok);
    rig.step(50);
    assert_eq!(
        rig.control.view.picker,
        Some((Picker::Engine, Cursor { item: 1, scroll: 0 }))
    );
    assert!(shows(&rig.control, &engine_picker("Syn 1", 1)));

    // The current engine changes nothing.
    rig.tap(60, Button::Ok);
    rig.step(70);
    assert_eq!(rig.control.view.picker, None);
    assert_eq!(rig.sent(), []);
    assert_eq!(
        rig.control.project.pool.get(syn).unwrap().engine,
        Engine::Synth
    );

    // The push of encoder 3 opens it on a sample sound's Sample.
    sample_on(&mut rig, 1, KICK.file);
    rig.hit(100, 1, 100);
    rig.release(110, 1);
    rig.tap(120, Button::Push(2));
    rig.step(130);
    assert_eq!(
        rig.control.view.picker,
        Some((Picker::Engine, Cursor { item: 0, scroll: 0 }))
    );
    assert!(shows(&rig.control, &engine_picker("kick", 0)));
}

#[test]
fn switching_to_synth_resets_the_synths_values_and_keeps_the_chain() {
    let queue = Queue::new();
    let mut rig = Rig::with_files(&queue, &library());
    rig.open();
    let syn = rig.synth_on(0);
    let audio = *rig.control.library.file(KICK.file);
    let sound = rig.control.project.pool.get_mut(syn).unwrap();
    sound.set(WAVE.id, SUPERSAW);
    sound.set(CUTOFF.id, 1_000);
    sound.set(TRIGGER.id, ONE_SHOT);
    sound.start_sample(KICK.file, &audio);
    let sampled = sound.values;
    rig.menu(10, 2);

    // Engine's picker opens on Sample; down onto Synth and OK.
    rig.tap(20, Button::Push(2));
    rig.tap(30, Button::Down);
    rig.tap(40, Button::Ok);
    rig.step(50);

    assert_eq!(
        rig.sent(),
        [message(0, 40, set_param(syn, WAVE.id, WAVE.default))]
    );
    let sound = rig.control.project.pool.get(syn).unwrap();
    assert_eq!(sound.engine, Engine::Synth);
    assert_eq!(sound.value(CUTOFF.id), 1_000);
    assert_eq!(sound.value(TRIGGER.id), ONE_SHOT);
    // The sample engine's values are never read again, so they stay until it comes back.
    assert_eq!(
        sound.values[Sound::place(START.id)..],
        sampled[Sound::place(START.id)..]
    );
    assert_eq!(
        pages(view::Screen::Sound, rig.control.selected())[1].name,
        "Synth"
    );
}

#[test]
fn switching_to_sample_happens_only_when_a_file_is_chosen() {
    let queue = Queue::new();
    let mut rig = Rig::with_files(&queue, &library());
    rig.open();
    let syn = rig.synth_on(0);
    rig.menu(10, 2);

    // Sample in Engine's picker opens the sample picker at once, where it was last, on its first
    // row.
    rig.tap(20, Button::Push(2));
    rig.tap(30, Button::Up);
    rig.tap(40, Button::Ok);
    rig.step(50);
    assert_eq!(
        rig.control.view.picker.map(|(picker, _)| picker),
        Some(Picker::Sample(Pick::Switch))
    );
    assert_eq!(
        rig.control.view.sample_picker,
        picker_at(None, 0, Line::Folder(FolderId(0)))
    );

    // CANCEL leaves a synth and sends nothing.
    rig.tap(60, Button::Cancel);
    rig.step(70);
    assert_eq!(rig.control.view.picker, None);
    assert_eq!(rig.sent(), []);
    assert_eq!(
        rig.control.project.pool.get(syn).unwrap().engine,
        Engine::Synth
    );

    // bass.wav makes it a sample sound with the sample engine's values, and the rest stays.
    rig.tap(100, Button::Ok);
    rig.tap(110, Button::Up);
    rig.tap(120, Button::Ok);
    rig.tap(130, Button::Down);
    rig.tap(140, Button::Ok);
    rig.step(150);
    assert_eq!(
        rig.sent(),
        [
            message(0, 130, preview(BASS)),
            message(1, 140, MessageKind::StopPreview),
            message(2, 140, set_param(syn, END.id, 47_999)),
            message(3, 140, set_param(syn, LOOP.id, 1)),
            message(4, 140, set_param(syn, LOOP_START.id, 1_000)),
            message(5, 140, set_param(syn, LOOP_END.id, 39_999)),
            message(6, 140, set_param(syn, ROOT_NOTE.id, 36)),
        ]
    );
    let sound = rig.control.project.pool.get(syn).unwrap();
    assert_eq!(sound.engine, Engine::Sample(Sample::File(BASS.file)));
    assert_eq!(sound.name.as_str(), "Syn 1");
    assert_eq!(sound.value(TRIGGER.id), TRIGGER.default);
}

#[test]
fn a_switch_to_sample_waits_for_room_for_its_eight_messages() {
    let queue = Queue::new();
    let mut rig = Rig::with_files(&queue, &library());
    rig.open();
    let syn = rig.synth_on(0);
    // Every sample entry away from what bass.wav gives it.
    let sound = rig.control.project.pool.get_mut(syn).unwrap();
    for (id, value) in [
        (START.id, 5),
        (END.id, 6),
        (LOOP.id, 0),
        (LOOP_START.id, 7),
        (LOOP_END.id, 8),
        (REVERSE.id, 1),
        (ROOT_NOTE.id, 9),
    ] {
        sound.set(id, value);
    }
    rig.menu(10, 2);
    rig.tap(20, Button::Push(2));
    rig.tap(30, Button::Up);
    rig.tap(40, Button::Ok);
    rig.tap(50, Button::Down);
    rig.step(60);
    rig.sent();
    rig.fill_the_message_queue();

    rig.tap(100, Button::Ok);
    assert!(!rig.step(200));
    rig.consumer.pop();
    assert!(rig.step(200));

    let sent = rig.sent();
    assert_eq!(
        sent[sent.len() - 8..],
        [
            message(1, 100, MessageKind::StopPreview),
            message(2, 100, set_param(syn, START.id, 0)),
            message(3, 100, set_param(syn, END.id, 47_999)),
            message(4, 100, set_param(syn, LOOP.id, 1)),
            message(5, 100, set_param(syn, LOOP_START.id, 1_000)),
            message(6, 100, set_param(syn, LOOP_END.id, 39_999)),
            message(7, 100, set_param(syn, REVERSE.id, 0)),
            message(8, 100, set_param(syn, ROOT_NOTE.id, 36)),
        ]
    );
}

#[test]
fn a_turn_on_engine_or_the_sample_item_does_nothing() {
    let queue = Queue::new();
    let mut rig = Rig::with_files(&queue, &library());
    rig.open();
    let kick = sample_on(&mut rig, 0, KICK.file);
    let before = *rig.control.project.pool.get(kick).unwrap();
    rig.menu(10, 2);

    // Encoder 3 holds Engine, and its turn puts the cursor there for - and +.
    rig.turn(20, 2, 3);
    rig.tap(30, Button::Minus);
    rig.tap(40, Button::Plus);
    rig.page(50, 1);
    rig.turn(60, 0, -2);
    rig.tap(70, Button::Minus);
    rig.tap(80, Button::Plus);
    rig.step(90);

    assert_eq!(rig.sent(), []);
    assert_eq!(rig.control.view.picker, None);
    assert_eq!(*rig.control.project.pool.get(kick).unwrap(), before);
}

#[test]
fn the_sample_page_lists_its_eight_items() {
    let queue = Queue::new();
    let mut rig = Rig::with_files(&queue, &library());
    rig.open();
    sample_on(&mut rig, 0, KICK.file);
    rig.menu(10, 2);
    rig.page(20, 1);
    rig.step(30);

    let items = [
        item(Some(1), "Sample", "kick.wav", Bar::Track),
        item(Some(2), "Start", "0.0%", Bar::Fill(0, 4_799)),
        item(Some(3), "End", "100.0%", Bar::Fill(4_799, 4_799)),
        item(Some(4), "Loop", "Off", Bar::Track),
        item(None, "Loop start", "0.0%", Bar::Fill(0, 4_799)),
        item(None, "Loop end", "100.0%", Bar::Fill(4_799, 4_799)),
        item(None, "Reverse", "Off", Bar::Track),
        item(None, "Root note", "C3", Bar::Fill(48, 127)),
    ];
    assert!(shows(
        &rig.control,
        &drawn(
            &[
                ("Sound", ACCENT),
                ("Sample", TEXT),
                ("T1", TEXT),
                ("kick", TEXT),
                ("Pads", DIM)
            ],
            None,
            |screen| {
                for (row, item) in (0..).zip(&items) {
                    draw_item(screen, 2, 17 + 18 * row, 160, item, true, None);
                }
                draw_cursor(screen, 2, 17, 160, 17);
                // kick.wav is silent: the middle line, Start on the first column and End on the
                // last.
                screen.hline(164, 134, 315, FAINT);
                screen.vline(164, 16, 236, ACCENT);
                screen.vline(478, 16, 236, ACCENT);
            },
            &[
                Some(items[0]),
                Some(items[1]),
                Some(items[2]),
                Some(items[3])
            ],
        )
    ));
}

#[test]
fn start_moves_by_a_128th_of_the_file_and_stops_before_end() {
    let queue = Queue::new();
    let mut rig = Rig::with_files(&queue, &library());
    rig.open();
    let kick = sample_on(&mut rig, 0, KICK.file);
    rig.menu(10, 2);
    rig.page(20, 1);

    // A click of kick.wav's 4,800 frames is 37 frames, a fine one 2.
    rig.turn(30, 1, 1);
    rig.press(40, Button::Shift);
    rig.turn(50, 1, 1);
    rig.let_go(60, Button::Shift);
    rig.step(70);
    assert_eq!(
        rig.sent(),
        [
            message(0, 30, set_param(kick, START.id, 37)),
            message(1, 50, set_param(kick, START.id, 39)),
        ]
    );

    // Start stops a frame before End, where no frame is left to move to.
    rig.turn(100, 1, 127);
    rig.turn(110, 1, 127);
    rig.turn(120, 1, 1);
    rig.step(130);
    assert_eq!(
        rig.sent(),
        [
            message(2, 100, set_param(kick, START.id, 39 + 127 * 37)),
            message(3, 110, set_param(kick, START.id, 4_798)),
        ]
    );

    // End stops a frame after Start.
    rig.turn(200, 2, -1);
    rig.step(210);
    assert_eq!(rig.sent(), []);
    assert_eq!(rig.control.value(END.id), 4_799);
}

#[test]
fn loop_end_stops_after_loop_start() {
    let queue = Queue::new();
    let mut rig = Rig::with_files(&queue, &library());
    rig.open();
    let kick = sample_on(&mut rig, 0, KICK.file);
    rig.menu(10, 2);
    rig.page(20, 1);

    // The cursor down to Loop end, which - moves a click down.
    for at in 0..5 {
        rig.tap(30 + 10 * at, Button::Down);
    }
    rig.tap(100, Button::Minus);
    rig.step(110);
    assert_eq!(
        rig.sent(),
        [message(0, 100, set_param(kick, LOOP_END.id, 4_762))]
    );

    // Loop end stops a frame after Loop start, and Loop start then has no frame to move to.
    rig.control
        .change(point(LOOP_END.id), -200, 200, &mut rig.producer);
    rig.control
        .change(point(LOOP_START.id), 1, 210, &mut rig.producer);
    assert_eq!(
        rig.sent(),
        [message(1, 200, set_param(kick, LOOP_END.id, 1))]
    );

    // Once Loop end moves on, Loop start can follow it.
    rig.tap(300, Button::Plus);
    rig.tap(310, Button::Up);
    rig.tap(320, Button::Plus);
    rig.step(330);
    assert_eq!(
        rig.sent(),
        [
            message(2, 300, set_param(kick, LOOP_END.id, 38)),
            message(3, 320, set_param(kick, LOOP_START.id, 37)),
        ]
    );
}

#[test]
fn the_sample_item_changes_the_file_and_keeps_the_other_values() {
    let queue = Queue::new();
    let mut rig = Rig::with_files(&queue, &library());
    rig.open();
    let kick = sample_on(&mut rig, 0, KICK.file);
    let sound = rig.control.project.pool.get_mut(kick).unwrap();
    for (id, value) in [
        (START.id, 37),
        (LOOP.id, 1),
        (REVERSE.id, 1),
        (CUTOFF.id, 1_000),
    ] {
        sound.set(id, value);
    }
    rig.menu(10, 2);
    rig.page(20, 1);

    // OK on the Sample item, down onto snare.wav and OK.
    rig.tap(30, Button::Ok);
    rig.tap(40, Button::Down);
    rig.tap(50, Button::Ok);
    rig.step(60);

    assert_eq!(
        rig.sent(),
        [
            message(0, 40, preview(SNARE)),
            message(1, 50, MessageKind::StopPreview),
            message(2, 50, set_param(kick, START.id, 0)),
            message(3, 50, set_param(kick, END.id, 9_599)),
            message(4, 50, set_param(kick, LOOP_END.id, 9_599)),
            message(5, 50, set_param(kick, ROOT_NOTE.id, 60)),
        ]
    );
    let sound = rig.control.project.pool.get(kick).unwrap();
    assert_eq!(sound.engine, Engine::Sample(Sample::File(SNARE.file)));
    assert_eq!(sound.name.as_str(), "kick");
    for (id, value) in [
        (LOOP.id, 1),
        (REVERSE.id, 1),
        (CUTOFF.id, 1_000),
        (TRIGGER.id, ONE_SHOT),
    ] {
        assert_eq!(sound.value(id), value);
    }
}

#[test]
fn ok_on_the_sounds_own_file_in_the_sample_item_closes_the_picker_and_changes_nothing() {
    let queue = Queue::new();
    let mut rig = Rig::with_files(&queue, &library());
    rig.open();
    let kick = sample_on(&mut rig, 0, KICK.file);
    let sound = rig.control.project.pool.get_mut(kick).unwrap();
    sound.set(START.id, 37);
    sound.set(END.id, 4_000);
    let values = sound.values;
    rig.menu(10, 2);
    rig.page(20, 1);

    // OK on the Sample item opens the picker on kick.wav, and OK on kick.wav closes it.
    rig.tap(30, Button::Ok);
    rig.tap(40, Button::Ok);
    rig.step(50);

    assert!(rig.control.view.picker.is_none());
    let sound = rig.control.project.pool.get(kick).unwrap();
    assert_eq!(sound.values, values);
    assert_eq!(sound.engine, Engine::Sample(Sample::File(KICK.file)));
    assert_eq!(rig.sent(), []);
}

#[test]
fn the_picker_from_the_sample_item_opens_on_the_sounds_file() {
    let queue = Queue::new();
    let mut rig = Rig::with_files(&queue, &library());
    rig.open();
    let kick = sample_on(&mut rig, 0, KICK.file);
    rig.menu(10, 2);
    rig.page(20, 1);

    rig.tap(30, Button::Push(0));
    rig.step(40);
    assert_eq!(
        rig.control.view.picker.map(|(picker, _)| picker),
        Some(Picker::Sample(Pick::Change))
    );
    assert_eq!(
        rig.control.view.sample_picker,
        picker_at(Some(FolderId(0)), 2, Line::File(KICK.file))
    );
    assert_eq!(rig.sent(), []);

    // For a missing file it opens where it was last, at the top after two CANCELs, on its first
    // row.
    rig.tap(50, Button::Cancel);
    rig.tap(60, Button::Cancel);
    rig.step(70);
    let mut path = Path::new();
    path.push_str("samples/drums/kick.wav");
    rig.control.project.pool.get_mut(kick).unwrap().engine = Engine::Sample(Sample::Missing(path));
    rig.tap(100, Button::Ok);
    rig.step(110);
    assert_eq!(
        rig.control.view.sample_picker,
        picker_at(None, 0, Line::Folder(FolderId(0)))
    );
}

#[test]
fn the_waveform_shows_the_files_peaks_and_the_start_and_end_marks() {
    // Two frames a column: 316 frames of silence, then full scale. quiet.wav is all silence.
    let loud: Vec<i16> = (0..630)
        .map(|frame| if frame < 316 { 0 } else { i16::MIN })
        .collect();
    let queue = Queue::new();
    let mut rig = Rig::with_files(
        &queue,
        &[
            ("samples/loud.wav", audio(1, &loud, 1)),
            ("samples/quiet.wav", audio(1, &[0; 630], 2)),
        ],
    );
    rig.open();
    let sound = sample_on(&mut rig, 0, FileId(0));
    sample_on(&mut rig, 1, FileId(1));
    // Start and End on columns round(100 × 314 / 629) = 50 and round(500 × 314 / 629) = 250.
    let values = rig.control.project.pool.get_mut(sound).unwrap();
    values.set(START.id, 100);
    values.set(END.id, 500);
    rig.menu(10, 2);
    rig.page(20, 1);
    rig.step(30);

    let screen = picture(&rig.control);
    // Over the silence only the faint middle line, on row 16 + 236 / 2.
    assert!(filled(&screen, 164..=213, 134..=134, FAINT));
    assert!(filled(&screen, 215..=321, 134..=134, FAINT));
    assert!(filled(&screen, 164..=213, 16..=133, BACKGROUND));
    assert!(filled(&screen, 164..=213, 135..=251, BACKGROUND));
    // Over the loud part a line 116 pixels either side of it, 2 pixels inside the area's top.
    assert!(filled(&screen, 322..=413, 18..=250, NOTE_MID));
    assert!(filled(&screen, 415..=478, 18..=250, NOTE_MID));
    assert!(filled(&screen, 322..=413, 16..=17, BACKGROUND));
    assert!(filled(&screen, 415..=478, 16..=17, BACKGROUND));
    assert!(filled(&screen, 322..=413, 251..=251, BACKGROUND));
    assert!(filled(&screen, 415..=478, 251..=251, BACKGROUND));
    // The marks run the area's full height.
    assert!(filled(&screen, 214..=214, 16..=251, ACCENT));
    assert!(filled(&screen, 414..=414, 16..=251, ACCENT));

    // Another file's sound shows that file's peaks.
    rig.hit(100, 1, 100);
    rig.step(110);
    let screen = picture(&rig.control);
    assert!(filled(&screen, 165..=477, 134..=134, FAINT));
    assert!(filled(&screen, 165..=477, 16..=133, BACKGROUND));
}

#[test]
fn a_file_in_a_deleted_files_place_shows_its_own_waveform() {
    let queue = Queue::new();
    let mut rig = Rig::with_files(
        &queue,
        &[("samples/loud.wav", audio(1, &[i16::MAX; 630], 1))],
    );
    rig.open();
    sample_on(&mut rig, 0, FileId(0));
    rig.menu(10, 2);
    rig.page(20, 1);
    rig.step(30);
    assert!(filled(
        &picture(&rig.control),
        200..=200,
        18..=250,
        NOTE_MID
    ));

    // SAMPLES deletes loud.wav, and quiet.wav, all silence, takes its place.
    rig.menu(100, 9);
    rig.tap(110, Button::Ok);
    rig.tap(120, Button::Ok);
    rig.tap(130, Button::Ok);
    rig.step(140);
    let forget = rig.sent().pop().unwrap();
    assert_eq!(forget.kind, MessageKind::ForgetSample { file: FileId(0) });
    rig.control.applied(forget.number, 150);
    rig.settle(160);
    rig.drop_files(200, &[("tmp/1/quiet.wav", audio(1, &[0; 630], 2))]);
    rig.settle(210);
    assert_eq!(
        rig.control.library.file(FileId(0)).name.as_str(),
        "quiet.wav"
    );

    // A sound of quiet.wav shows its silence, not the peaks held for the place.
    sample_on(&mut rig, 0, FileId(0));
    rig.menu(300, 2);
    rig.step(310);
    let screen = picture(&rig.control);
    assert!(filled(&screen, 165..=477, 134..=134, FAINT));
    assert!(filled(&screen, 165..=477, 16..=133, BACKGROUND));
}

#[test]
fn a_file_that_is_not_loaded_shows_no_peaks_and_its_points_stay() {
    let plain = wav::sine(440.0, 0.5, 44_100, Encoding::Int16, 1);
    let queue = Queue::new();
    let mut rig = Rig::with_files(
        &queue,
        &[
            ("samples/loud.wav", audio(1, &[i16::MAX; 630], 1)),
            ("samples/plain.wav", plain),
        ],
    );
    rig.open();
    sample_on(&mut rig, 0, FileId(0));
    sample_on(&mut rig, 1, FileId(1));
    rig.menu(10, 2);
    rig.page(20, 1);
    rig.step(30);
    rig.hit(40, 1, 100);
    rig.turn(50, 1, 1);
    rig.turn(60, 2, -1);
    rig.step(70);

    // Only the note, which carries no file: the turns send nothing.
    assert_eq!(rig.sent().len(), 1);
    // Only the middle line and the marks, both on the first column of a file without frames.
    let screen = picture(&rig.control);
    assert!(filled(&screen, 165..=478, 134..=134, FAINT));
    assert!(filled(&screen, 165..=478, 16..=133, BACKGROUND));
    assert!(filled(&screen, 164..=164, 16..=251, ACCENT));
}

#[test]
fn peaks_read_at_most_64_frames_a_column() {
    // Odd frames at full scale: 64 frames spread over a column of 128 are all even, and a column of
    // 64 reads every frame. The right channel counts too, and a file shorter than the picture
    // gives each column the frame under it.
    let odd = |frames: i32| -> Vec<i16> {
        (0..frames)
            .map(|frame| if frame % 2 == 1 { i16::MAX } else { 0 })
            .collect()
    };
    let right: Vec<i16> = (0..315).flat_map(|_| [0, -1_000]).collect();
    let short: Vec<i16> = (0..100).collect();
    let queue = Queue::new();
    let mut rig = Rig::with_files(
        &queue,
        &[
            ("samples/a.wav", audio(1, &odd(315 * 128), 1)),
            ("samples/b.wav", audio(1, &odd(315 * 64), 2)),
            ("samples/c.wav", audio(2, &right, 3)),
            ("samples/d.wav", audio(1, &short, 4)),
        ],
    );
    rig.open();
    let peaks = |file| {
        rig.control
            .library
            .peaks(FileId(file), &rig.tables, &rig.ram)
    };

    assert_eq!(peaks(0), [0; 315]);
    assert_eq!(peaks(1), [32_767; 315]);
    assert_eq!(peaks(2), [1_000; 315]);
    assert_eq!(
        peaks(3),
        core::array::from_fn(|column| (column * 100 / 315) as u16)
    );
}

/// A dropped file of 480 frames of mono at 48 kHz, which the import keeps as it is.
fn short() -> Vec<u8> {
    wav::sine(100.0, 0.01, 48_000, Encoding::Int16, 1)
}

/// From `sample` on, shows SAMPLES, goes into drums/ and onto kick.wav, which previews it, and
/// asks to delete it: OK opens the Delete picker and OK on Delete the question, 10 samples apart.
fn ask_to_delete_kick(rig: &mut Rig<'_>, sample: u64) {
    rig.menu(sample, 9);
    for (after, button) in [
        (10, Button::Ok),
        (20, Button::Down),
        (30, Button::Down),
        (40, Button::Ok),
        (50, Button::Ok),
    ] {
        rig.tap(sample + after, button);
    }
    rig.step(sample + 60);
}

/// From `sample` on, asks to delete kick.wav and answers OK at `sample` + 60. Gives the
/// `ForgetSample` that the delete sent, after taking every message sent.
fn delete_kick(rig: &mut Rig<'_>, sample: u64) -> Message {
    ask_to_delete_kick(rig, sample);
    rig.tap(sample + 60, Button::Ok);
    rig.step(sample + 70);
    let forget = rig.sent().pop().unwrap();
    assert_eq!(forget.kind, MessageKind::ForgetSample { file: KICK.file });
    forget
}

/// The engine of kick.wav's sounds once kick.wav is gone: missing, by its path.
fn missing_kick() -> Engine {
    let mut path = Path::new();
    path.push_str("samples/drums/kick.wav");
    Engine::Sample(Sample::Missing(path))
}

#[test]
fn the_delete_question_counts_the_sounds_that_use_the_file() {
    let queue = Queue::new();
    let mut rig = Rig::with_files(&queue, &library());
    rig.open();
    let kick = sample_on(&mut rig, 0, KICK.file);
    let copy = sample_on(&mut rig, 1, KICK.file);
    sample_on(&mut rig, 2, SNARE.file);
    ask_to_delete_kick(&mut rig, 10);
    let asked = |rig: &mut Rig<'_>, lines: &[(&str, Color)]| {
        let question = rig.control.view.question.take();
        let mut screen = picture(&rig.control);
        rig.control.view.question = question;
        draw_question(&mut screen, lines);
        shows(&rig.control, &screen)
    };

    assert!(asked(
        &mut rig,
        &[
            ("Delete kick.wav?", TEXT),
            ("2 sounds use it", DIM),
            ("OK deletes, Cancel keeps", DIM),
        ]
    ));

    rig.control
        .project
        .pool
        .get_mut(copy)
        .unwrap()
        .start_synth();
    assert!(asked(
        &mut rig,
        &[
            ("Delete kick.wav?", TEXT),
            ("1 sound uses it", DIM),
            ("OK deletes, Cancel keeps", DIM),
        ]
    ));

    rig.control
        .project
        .pool
        .get_mut(kick)
        .unwrap()
        .start_synth();
    assert!(asked(
        &mut rig,
        &[
            ("Delete kick.wav?", TEXT),
            ("OK deletes, Cancel keeps", DIM),
        ]
    ));
}

#[test]
fn deleting_a_used_file_fades_its_voices_and_leaves_its_sounds_missing() {
    let queue = Queue::new();
    let mut rig = Rig::with_files(&queue, &library());
    rig.open();
    let kick = sample_on(&mut rig, 0, KICK.file);

    // The `ForgetSample` fades every voice reading kick.wav.
    let forget = delete_kick(&mut rig, 10);
    rig.control.applied(forget.number, 90);
    rig.settle(100);

    assert_eq!(
        rig.control.project.pool.get(kick).unwrap().engine,
        missing_kick()
    );
    // The sound picker's row and the header's name in red.
    rig.menu(200, 2);
    rig.tap(210, Button::Ok);
    rig.step(220);
    assert!(shows(
        &rig.control,
        &drawn(
            &sound_header(("kick", RECORD)),
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
                        Row {
                            left: "kick",
                            right: Some("sample"),
                            alert: true,
                        },
                    ],
                    0,
                    Some(3),
                    0,
                );
            },
            &[None; 4],
        )
    ));

    // Its note carries no file.
    rig.hit(300, 0, 100);
    rig.step(310);
    assert_eq!(
        rig.sent(),
        [message(
            forget.number + 1,
            300,
            sample_note(0, kick, 48, None)
        )]
    );
}

#[test]
fn a_hit_during_a_delete_sends_no_file() {
    let queue = Queue::new();
    let mut rig = Rig::with_files(&queue, &library());
    rig.open();
    let kick = sample_on(&mut rig, 0, KICK.file);
    let forget = delete_kick(&mut rig, 10);

    // While the audio part lets go of kick.wav, and then while its `Delete` is out.
    rig.hit(100, 0, 100);
    rig.release(110, 0);
    rig.control.applied(forget.number, 120);
    rig.step(130);
    assert!(matches!(
        rig.control.take_request(),
        Some((_, Request::Delete { .. }))
    ));
    rig.hit(200, 0, 100);
    rig.step(210);

    let number = forget.number;
    assert_eq!(
        rig.sent(),
        [
            message(number + 1, 100, sample_note(0, kick, 48, None)),
            message(number + 2, 110, note_off(0)),
            message(number + 3, 200, sample_note(1, kick, 48, None)),
        ]
    );
}

#[test]
fn a_failed_delete_leaves_the_sounds_playing_the_file() {
    let queue = Queue::new();
    let mut rig = Rig::with_files(&queue, &library());
    rig.open();
    let kick = sample_on(&mut rig, 0, KICK.file);
    let forget = delete_kick(&mut rig, 10);
    rig.control.applied(forget.number, 90);
    rig.step(100);

    let (number, _) = rig.control.take_request().expect("a request is out");
    let failed = Reply {
        number,
        status: Status::Failed,
        value: 0,
    };
    assert_eq!(rig.control.queue_reply(100, failed), Ok(()));
    rig.hit(200, 0, 100);
    rig.step(210);

    assert_eq!(
        rig.control.project.pool.get(kick).unwrap().engine,
        Engine::Sample(Sample::File(KICK.file))
    );
    assert_eq!(
        rig.sent(),
        [message(
            forget.number + 1,
            200,
            sample_note(0, kick, 48, Some(KICK))
        )]
    );
}

#[test]
fn a_file_dropped_again_under_its_path_revives_its_sounds() {
    let queue = Queue::new();
    let mut rig = Rig::with_files(&queue, &library());
    rig.open();
    let kick = sample_on(&mut rig, 0, KICK.file);
    let forget = delete_kick(&mut rig, 10);
    rig.control.applied(forget.number, 90);
    rig.settle(100);

    // KICK.wav goes into drums/, kick.wav's path but for case, in kick.wav's place. The sound's
    // End and Loop end stop at its last frame.
    rig.drop_files(200, &[("tmp/1/drums/KICK.wav", short())]);
    rig.settle(210);
    rig.hit(300, 0, 100);
    rig.step(310);

    let new = SampleFile {
        file: FileId(2),
        frames: 480,
        stereo: false,
    };
    assert_eq!(rig.control.library.file(new.file).name.as_str(), "KICK.wav");
    assert_eq!(
        rig.control.project.pool.get(kick).unwrap().engine,
        Engine::Sample(Sample::File(new.file))
    );
    let number = forget.number;
    assert_eq!(
        rig.sent(),
        [
            message(number + 1, 210, set_param(kick, END.id, 479)),
            message(number + 2, 210, set_param(kick, LOOP_END.id, 479)),
            message(number + 3, 300, sample_note(0, kick, 48, Some(new))),
        ]
    );
}

#[test]
fn a_new_file_in_a_deleted_files_place_does_not_revive_its_sounds() {
    let queue = Queue::new();
    let mut rig = Rig::with_files(&queue, &library());
    rig.open();
    let kick = sample_on(&mut rig, 0, KICK.file);
    let forget = delete_kick(&mut rig, 10);
    rig.control.applied(forget.number, 90);
    rig.settle(100);

    // clap.wav takes kick.wav's place in the library.
    rig.drop_files(200, &[("tmp/1/drums/clap.wav", short())]);
    rig.settle(210);
    rig.hit(300, 0, 100);
    rig.step(310);

    assert_eq!(
        rig.control.library.file(KICK.file).name.as_str(),
        "clap.wav"
    );
    assert_eq!(
        rig.control.project.pool.get(kick).unwrap().engine,
        missing_kick()
    );
    assert_eq!(
        rig.sent(),
        [message(
            forget.number + 1,
            300,
            sample_note(0, kick, 48, None)
        )]
    );
}

#[test]
fn a_replaced_file_keeps_its_sounds_on_the_new_audio() {
    let queue = Queue::new();
    let mut rig = Rig::with_files(&queue, &library());
    rig.open();
    let kick = sample_on(&mut rig, 0, KICK.file);
    let copy = sample_on(&mut rig, 1, KICK.file);

    rig.drop_files(10, &[("tmp/1/drums/KICK.wav", short())]);
    rig.settle(20);
    let forget = rig.sent().pop().unwrap();
    assert_eq!(forget.kind, MessageKind::ForgetSample { file: KICK.file });
    rig.control.applied(forget.number, 30);
    rig.settle(40);
    rig.hit(100, 0, 100);
    rig.hit(110, 1, 100);
    rig.step(120);

    // KICK.wav took the first free place.
    let new = SampleFile {
        file: FileId(4),
        frames: 480,
        stereo: false,
    };
    for sound in [kick, copy] {
        assert_eq!(
            rig.control.project.pool.get(sound).unwrap().engine,
            Engine::Sample(Sample::File(new.file))
        );
    }
    let number = forget.number;
    assert_eq!(
        rig.sent(),
        [
            message(number + 1, 30, set_param(kick, END.id, 479)),
            message(number + 2, 30, set_param(kick, LOOP_END.id, 479)),
            message(number + 3, 30, set_param(copy, END.id, 479)),
            message(number + 4, 30, set_param(copy, LOOP_END.id, 479)),
            message(number + 5, 100, sample_note(0, kick, 48, Some(new))),
            message(number + 6, 110, sample_note(1, copy, 48, Some(new))),
        ]
    );
}

#[test]
fn a_hit_during_a_replace_sends_no_file() {
    let queue = Queue::new();
    let mut rig = Rig::with_files(&queue, &library());
    rig.open();
    let kick = sample_on(&mut rig, 0, KICK.file);
    rig.drop_files(10, &[("tmp/1/drums/kick.wav", short())]);
    rig.settle(20);
    let forget = rig.sent().pop().unwrap();
    assert_eq!(forget.kind, MessageKind::ForgetSample { file: KICK.file });

    rig.hit(100, 0, 100);
    rig.step(110);

    assert_eq!(
        rig.sent(),
        [message(
            forget.number + 1,
            100,
            sample_note(0, kick, 48, None)
        )]
    );
}

#[test]
fn a_missing_sound_plays_and_shows_without_its_file() {
    let queue = Queue::new();
    let mut rig = Rig::with_files(&queue, &library());
    rig.open();
    let kick = sample_on(&mut rig, 0, KICK.file);
    let forget = delete_kick(&mut rig, 10);
    rig.control.applied(forget.number, 90);
    rig.settle(100);

    rig.hit(200, 0, 100);
    rig.menu(210, 2);
    rig.page(220, 1);
    rig.step(230);
    assert_eq!(
        rig.sent(),
        [message(
            forget.number + 1,
            200,
            sample_note(0, kick, 48, None)
        )]
    );
    // The Sample item names the file, and the points show against no frames.
    let items = [
        item(Some(1), "Sample", "kick.wav", Bar::Track),
        item(Some(2), "Start", "0.0%", Bar::Track),
        item(Some(3), "End", "0.0%", Bar::Track),
        item(Some(4), "Loop", "Off", Bar::Track),
        item(None, "Loop start", "0.0%", Bar::Track),
        item(None, "Loop end", "0.0%", Bar::Track),
        item(None, "Reverse", "Off", Bar::Track),
        item(None, "Root note", "C3", Bar::Fill(48, 127)),
    ];
    let strip = [
        Some(items[0]),
        Some(items[1]),
        Some(items[2]),
        Some(items[3]),
    ];
    assert!(shows(
        &rig.control,
        &drawn(
            &[
                ("Sound", ACCENT),
                ("Sample", TEXT),
                ("T1", TEXT),
                ("kick", RECORD),
                ("Pads", DIM)
            ],
            None,
            |screen| {
                for (row, item) in (0..).zip(&items) {
                    draw_item(screen, 2, 17 + 18 * row, 160, item, true, None);
                }
                draw_cursor(screen, 2, 17, 160, 17);
                // Only the middle line and the marks, both on the first column.
                screen.hline(164, 134, 315, FAINT);
                screen.vline(164, 16, 236, ACCENT);
            },
            &strip,
        )
    ));

    // STEP's strip shows the Sample page's items.
    rig.menu(300, 0);
    rig.step(310);
    assert!(shows(
        &rig.control,
        &drawn(
            &[
                ("Step", ACCENT),
                ("T1", TEXT),
                ("kick", RECORD),
                ("Pads", DIM)
            ],
            None,
            |_| {},
            &strip,
        )
    ));
}

#[test]
fn a_sound_of_a_file_that_was_not_loaded_takes_the_new_files_points() {
    let plain = || wav::sine(440.0, 0.5, 44_100, Encoding::Int16, 1);
    let queue = Queue::new();
    let mut rig = Rig::with_files(
        &queue,
        &[
            ("samples/bass.wav", converted_with(48_000, 2, 36, None)),
            ("samples/other.wav", plain()),
            ("samples/plain.wav", plain()),
        ],
    );
    rig.open();
    // Sounds of files that are not loaded, so End is 0.
    let other = sample_on(&mut rig, 0, FileId(1));
    let plain_sound = sample_on(&mut rig, 1, FileId(2));
    // SAMPLES deletes other.wav, so its sound is missing.
    rig.menu(10, 9);
    rig.tap(20, Button::Down);
    for at in [30, 40, 50] {
        rig.tap(at, Button::Ok);
    }
    rig.settle(60);
    assert!(matches!(
        rig.control.project.pool.get(other).unwrap().engine,
        Engine::Sample(Sample::Missing(_))
    ));

    // plain.wav replaces its file, which the audio part never read, and takes other.wav's place;
    // then other.wav comes back in the place plain.wav left.
    rig.drop_files(
        100,
        &[("tmp/1/plain.wav", short()), ("tmp/2/other.wav", short())],
    );
    rig.settle(110);
    rig.hit(200, 0, 100);
    rig.hit(210, 1, 100);
    rig.step(220);

    let new_plain = SampleFile {
        file: FileId(1),
        frames: 480,
        stereo: false,
    };
    let new_other = SampleFile {
        file: FileId(2),
        ..new_plain
    };
    assert_eq!(
        rig.sent(),
        [
            message(0, 110, set_param(plain_sound, END.id, 479)),
            message(1, 110, set_param(plain_sound, LOOP_END.id, 479)),
            message(2, 110, set_param(plain_sound, ROOT_NOTE.id, 60)),
            message(3, 110, set_param(other, END.id, 479)),
            message(4, 110, set_param(other, LOOP_END.id, 479)),
            message(5, 110, set_param(other, ROOT_NOTE.id, 60)),
            message(6, 200, sample_note(0, other, 60, Some(new_other))),
            message(7, 210, sample_note(1, plain_sound, 60, Some(new_plain))),
        ]
    );
}

#[test]
fn a_replace_by_a_shorter_file_keeps_the_points_held_within_it() {
    let queue = Queue::new();
    let mut rig = Rig::with_files(&queue, &library());
    rig.open();
    let kick = sample_on(&mut rig, 0, KICK.file);
    let sound = rig.control.project.pool.get_mut(kick).unwrap();
    for (id, value) in [
        (START.id, 600),
        (END.id, 4_000),
        (LOOP_START.id, 200),
        (LOOP_END.id, 300),
    ] {
        sound.set(id, value);
    }

    // kick.wav of 480 frames replaces it: End stops at the last frame and Start before End.
    rig.drop_files(10, &[("tmp/1/drums/kick.wav", short())]);
    rig.settle(20);
    let forget = rig.sent().pop().unwrap();
    rig.control.applied(forget.number, 30);
    rig.settle(40);

    let number = forget.number;
    assert_eq!(
        rig.sent(),
        [
            message(number + 1, 30, set_param(kick, START.id, 478)),
            message(number + 2, 30, set_param(kick, END.id, 479)),
        ]
    );
    let sound = rig.control.project.pool.get(kick).unwrap();
    assert_eq!(sound.value(LOOP_START.id), 200);
    assert_eq!(sound.value(LOOP_END.id), 300);
    assert_eq!(sound.value(ROOT_NOTE.id), 48);
}

#[test]
fn a_relink_waits_for_room_for_each_sounds_values() {
    let queue = Queue::new();
    let mut rig = Rig::with_files(&queue, &library());
    rig.open();
    let kick = sample_on(&mut rig, 0, KICK.file);
    let copy = sample_on(&mut rig, 1, KICK.file);
    rig.drop_files(10, &[("tmp/1/drums/kick.wav", short())]);
    rig.settle(20);
    let forget = rig.sent().pop().unwrap();
    rig.fill_the_message_queue();
    rig.consumer.pop();

    // The report lists the new file with room for one event: the first sound takes it and sends
    // its two values, and the second waits, missing.
    rig.control.applied(forget.number, 30);
    rig.step(40);
    let engine = |rig: &Rig<'_>, sound| rig.control.project.pool.get(sound).unwrap().engine;
    assert_eq!(engine(&rig, kick), Engine::Sample(Sample::File(FileId(4))));
    assert!(matches!(
        engine(&rig, copy),
        Engine::Sample(Sample::Missing(_))
    ));
    let sent = rig.sent();
    assert_eq!(
        sent[sent.len() - 2..],
        [
            message(forget.number + 1, 30, set_param(kick, END.id, 479)),
            message(forget.number + 2, 30, set_param(kick, LOOP_END.id, 479)),
        ]
    );

    rig.step(40);
    assert_eq!(engine(&rig, copy), Engine::Sample(Sample::File(FileId(4))));
    assert_eq!(
        rig.sent(),
        [
            message(forget.number + 3, 30, set_param(copy, END.id, 479)),
            message(forget.number + 4, 30, set_param(copy, LOOP_END.id, 479)),
        ]
    );
}
