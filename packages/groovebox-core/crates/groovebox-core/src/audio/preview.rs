use super::CHUNK;
use super::voice::{add_fading, level_gain, pan_gains};
use crate::library::FileId;
use crate::message::SampleFile;
use crate::param;
use crate::sample_ram::Reader;

/// A file the preview player plays.
#[derive(Clone, Copy)]
struct Playing {
    file: FileId,
    frames: u32,
    stereo: bool,
    /// The gain on the left and on the right: a default sound's at velocity 127, so that a
    /// preview sounds as loud as the pad will.
    gains: [f32; 2],
    /// The frame it reads next; 0 until its first chunk.
    frame: u32,
    /// The chunk that `render` adds next, read a chunk ahead: a stop fades it out without reading
    /// the file again, so the audio part lets go of the file in the chunk the stop applies at.
    next: [[f32; CHUNK]; 2],
}

impl Playing {
    /// The next chunk of the file at its gains; silent past the file's end.
    fn read(&mut self, reader: &Reader<'_>) -> [[f32; CHUNK]; 2] {
        // After a `UseTable` the file's slice lies elsewhere: it is looked up in the table in use.
        let slice = reader.slice(self.file);
        let mut chunk = [[0.0; CHUNK]; 2];
        let [lefts, rights] = &mut chunk;
        for ((left, right), frame) in lefts.iter_mut().zip(rights).zip(self.frame..self.frames) {
            let (from_left, from_right) = reader.frame(slice, self.stereo, frame);
            *left = f32::from(from_left) / 32_768.0 * self.gains[0];
            *right = f32::from(from_right) / 32_768.0 * self.gains[1];
        }
        self.frame = self.frames.min(self.frame + CHUNK as u32);
        chunk
    }
}

/// The preview player beside the voices: it plays a library file once, dry, and is never one of
/// the voices. A stop fades it out within one chunk, as a taken voice does.
pub struct Preview {
    playing: Option<Playing>,
    /// The next chunk of a file that stopped, which `render` adds fading out.
    fading: Option<[[f32; CHUNK]; 2]>,
}

impl Preview {
    pub const fn new() -> Self {
        Self {
            playing: None,
            fading: None,
        }
    }

    /// Plays `sample` from its first frame; the file it played stops.
    pub fn start(&mut self, sample: SampleFile) {
        let SampleFile {
            file,
            frames,
            stereo,
        } = sample;
        self.stop();
        let default = |id| param::entry(id).default;
        let gain = level_gain(default, 127);
        let (to_left, to_right) = pan_gains(default);
        self.playing = Some(Playing {
            file,
            frames,
            stereo,
            gains: [gain * to_left, gain * to_right],
            frame: 0,
            next: [[0.0; CHUNK]; 2],
        });
    }

    /// Fades the file it plays out in the next chunk. A file that has not sounded yet stops at
    /// once, so that two files overlap for one chunk at most.
    pub fn stop(&mut self) {
        if let Some(playing) = self.playing.take()
            && playing.frame > 0
        {
            self.fading = Some(playing.next);
        }
    }

    /// Stops when it plays `file`.
    pub fn forget(&mut self, file: FileId) {
        if self.playing.is_some_and(|playing| playing.file == file) {
            self.stop();
        }
    }

    /// Adds one chunk to `out`: the fade of a file that stopped and the file it plays, which it
    /// reads through `reader`.
    pub fn render(&mut self, reader: &Reader<'_>, out: &mut [[f32; CHUNK]; 2]) {
        if let Some(fading) = self.fading.take() {
            add_fading(out, fading);
        }
        let Some(playing) = &mut self.playing else {
            return;
        };
        if playing.frame == 0 {
            playing.next = playing.read(reader);
        }
        for (out, next) in out.iter_mut().zip(playing.next) {
            for (out, x) in out.iter_mut().zip(next) {
                *out += x;
            }
        }
        if playing.frame == playing.frames {
            self.playing = None;
        } else {
            playing.next = playing.read(reader);
        }
    }
}

impl Default for Preview {
    fn default() -> Self {
        Self::new()
    }
}
