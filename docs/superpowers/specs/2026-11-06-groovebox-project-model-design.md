# Groovebox part 1 – Project model and saving

Status: design, approved by the owner. The fifth of six subpart specs of part 1; see
[the part 1 overview](./2026-10-26-groovebox-core-browser-design.md) for the intent, the goals and
the decision register, [Foundation](./2026-11-02-groovebox-foundation-design.md) for the ground
rules, [Sound](./2026-11-03-groovebox-sound-design.md) for the engines and sample import,
[Workflow A](./2026-11-03-groovebox-workflow-a-design.md) for sounds, pads and projects as they are
used, and [Workflow B](./2026-11-05-groovebox-workflow-b-design.md) for patterns, notes, recording
and undo.

**Nothing here is final.** The data model follows how the device is used, and that is what part 1
exists to find out. This spec records the starting point. Format changes in part 1 are clean breaks:
old projects are not migrated (see "The files and their format").

Every section of this spec was presented to the owner and approved. Points where the owner chose
between options are marked **(owner's choice)**. Details settled while writing the spec, which the
owner has not confirmed, are marked **(my call)**. The note store and the file format were each
reviewed by an independent researcher before approval; what they changed is folded in.

## What the Project model decides

What a project is made of and how its parts refer to each other; what happens to the pads and notes
of a deleted sound; what a project remembers when it is opened again; what happens when a sample
file is missing; where samples and projects live and how they move; the note store, which part of
the core writes to it and how edits reach the part that plays; pressure curves; how undo and the
clipboard are kept and what happens when note memory runs out; the files, their format and how they
are saved safely; and how projects and the library behave in use.

It does not decide how any of it is drawn (Look), nor the companion's transfer and backup (part 2).
"Changes to Workflow A", "Changes to Workflow B", "Changes to Foundation" and "Changes to Sound"
list what this spec alters in the earlier specs; "Assumptions about other specs" lists what it
expects from the rest.

## Two memories

Every device of this kind has two memories, and this spec always names them:

- **Storage** keeps files when the power is off: the library, the projects, the settings. Big and
  slow. In the browser it is the browser's private storage for the site.
- **RAM** is what the sound engine reads while playing. Fast, and empty at power-on. In the browser
  it is the program's memory.

Foundation decided that in part 1 samples play from RAM: opening a project copies the samples its
sounds use from storage into RAM, within the 64 MB budget per project. The library on storage can be
far bigger than that; the budget limits what one project can have loaded at once.

## Decisions at a glance

| Topic                    | Decision                                                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Deleting a used sound    | After a question that counts its pads and notes, the sound, its notes and its pads all go (owner's choice)                               |
| What a project remembers | Where you were: current pattern, track and screen, each screen's page, the cursor and view, following (owner's choice)                   |
| A missing sample         | The project opens; the sound keeps its settings, plays silence, is marked MISSING and is repaired from the sound (owner's choice)        |
| Storage                  | Internal, nothing removable, as on the EP-133: one sample library shared by all projects, the projects beside it (owner's choice)        |
| Moving things            | Samples in by dropping files on the shell now; projects out, backup and restore are the companion's job in part 2 (owner's choice)       |
| Deleting samples         | A SAMPLES screen (MENU + 10) with DELETE after a question, like POOL and PROJECT (owner's choice)                                        |
| Note store               | The screen side owns the notes in copy-on-write blocks; the sound side plays published versions and switches at a recorded moment        |
| Note memory              | One pool of half-kilobyte blocks, provisionally 8 MB (about 500,000 notes); pattern length costs nothing                                 |
| Undo                     | A kept-back version; an undo budget decides "too big"; a recording pass drops its undo first when memory runs out                        |
| Clipboard                | Keeps hold of blocks, never copies; never taken away                                                                                     |
| Files                    | One binary chunk format with a version number and a checksum per chunk; a project is a folder of small files                             |
| Saving                   | All-or-nothing replace through the storage interface; pattern files first, then the project; a previous copy of the project and settings |
| Versions                 | One format version; a file of another version is OLD and can only be deleted; no migrations in part 1                                    |
| Sample files             | WAV at 48 kHz and 16 bits with a private chunk: original name and a 128-bit fingerprint of the audio                                     |

## The project and its parts

**The project** holds, as the earlier specs decided: the pool of sounds; four tracks; the patterns;
the tempo, time signature, GRID, SWING and QUANTIZE; the master level; and where you were (see "What
a project remembers").

**A track** holds its 12 pads, its selected sound, pad mode and octave, its six effect slots (each a
type and its parameters), its level and its mute.

**A sound** has a number that is unique within the project and never reused while the project lives,
even after a delete **(my call)**, so a number in any file or on any screen only ever meant one
sound. It carries its automatic name, its engine, and its parameters as "ID = number" pairs,
addressed by layer and engine as Sound decided. A sample sound also carries which library file it
plays: the file's path in the library plus the fingerprint of the file's audio (see "Sample files").

**Pads, notes and the selected sound refer to sounds by number.** "Deleting a sound in use" means a
number that appears anywhere always points at a sound that exists; a file that breaks this rule
(hand-edited or damaged) has the stray notes dropped on opening, with a count shown.

**Patterns** are shown by position, 1, 2, 3 and so on, since Workflow B renumbers the ones after a
deleted pattern, and carry an internal number that never changes and is never reused, so a message
in flight or a file name is never confused by a renumbering. Each holds its length in bars, whether
it has ever been changed (set once a length was chosen or a note added; CLEAR keeps it), its note
count and the notes of the four tracks.

**A note:** its bar, its place in the bar in ticks, its length in ticks, its pitch (0 to 127, MIDI's
range, with KEYS mode's C0 to C8 inside it), its velocity (0 to 127, what pads and MIDI deliver
**(my call)**), its sound's number, and its pressure curve or none. A few spare bits are reserved
for the features that come later (hidden notes, conditions, micro-timing), so adding them changes no
note's size. Storing bar and place rather than a tick from the pattern's start is what Workflow B
asks for hidden notes, and it means a signature change moves no note.

**Samples** belong to the library, never to a project. A project only points at them, and a copy of
a project points at the same files.

**Used.** A sample is used by a project when any sound of that project plays it. A sound is used
when it is on any pad of any track or played by any note of any pattern. This one definition serves
the DELETE question, REMOVE UNUSED and the count on POOL.

**Device settings** are not part of any project: output volume, VELOCITY, metronome on or off,
metronome level, count-in, and which project was open last.

## Deleting a sound in use

**(owner's choice)**

DELETE on a sound shows a question that counts every pad on every track and every note in every
pattern that use it, such as "DELETE KICK? ON 2 PADS, 24 NOTES". OK removes all of it: the pads go
empty and the notes are gone. The project therefore never contains a note whose sound does not
exist, STEP never needs a lane for a sound that is gone, and nothing can play silence by mistake.
The sample file stays in the library for other projects. Undo does not cover it; the question is the
safeguard, as Workflow B decided for sounds.

Of the nine devices researched, none refuses to delete an in-use sound; the MPC lists the tracks
that use a sample before asking, the Deluge guidebook says it "will not notify you", and all leave
the notes pointing at nothing, lit but silent. Deleting the notes with the sound is a stronger
promise than any of them makes.

Rejected: refusing while in use (clearing a sound's notes on three tracks first takes six steps),
and keeping the notes silent (a lit step that plays nothing looks like a bug, and the project would
hold notes pointing at nothing).

## What a project remembers

**(owner's choice)** The project remembers where you were, like the Deluge, whose song file saves
the open view, scroll, zoom, the open clip and each clip's keyboard mode and octave, and the OP-XY,
which promises "everything will still be there, exactly as you left it":

- the current pattern, by internal number;
- the current track;
- each track's selected sound, pad mode and octave;
- the current screen and each screen's page;
- the STEP and ROLL cursor (bar, step, and each screen's row) and view, and whether the view follows
  the music;
- the sample picker's folder.

Reopen a project, or restart the browser, and you see what you left: the same screen, bar and sound
under the encoders. A copied project carries it too. Never saved: playback (a project always opens
stopped and disarmed), the clipboard, the undo step and any held button. Each remembered item names
things by number and falls back to its default when its target is gone.

Which project was open last is a device setting, so starting up opens it (Workflow A).

## A missing sample

**(owner's choice)** The project opens and plays. A sound whose file is gone keeps every setting and
plays silence. On opening, one line reports the total, such as "2 SAMPLES MISSING"; on POOL the
sound is marked MISSING with the file's name, and so are its lane on STEP and its name in the
header. The repair is what Workflow A already has: the sample parameter on the sound's engine page
opens the sample picker, and choosing a file fixes the sound everywhere it is used. The reference is
kept, so if the file comes back the sound works again. A sample that cannot be loaded because it
would overflow the RAM budget is treated the same way, marked NO ROOM instead of MISSING.

Every device researched that points at files (Deluge, Digitakt II, M8, OP-XY) opens the project and
plays silence; the Deluge keeps the broken reference and writes it back on save, and the M8 offers a
per-instrument browse. Rejected: stopping to ask for each missing file before opening, which no
device does, and saying nothing, which makes the silence look like a broken sound.

## Where things live and how they move

**(owner's choice)**, in the shape of the EP-133: everything is inside the device, nothing is
removable, the user never sees files.

- **Internal storage** holds one sample library shared by every project, arranged in folders, with
  the projects and the device settings beside it.
- **Samples get in now, in part 1:** drop WAV files or folders onto the browser shell and they land
  in the library, converted on import as Sound decided. Later, recording adds samples on the device
  alone, and the companion (part 2) moves samples to and from a computer, like the EP sample tool.
- **Projects out, backup and restore** over USB are the companion's job in part 2, like the EP
  sample tool's backup. The device itself never shows files to move.
- **Deleting samples works like deleting everything else.** A SAMPLES screen (MENU + 10) lists the
  library the way the sample picker does: by folder, each file with its length and size, the
  highlighted file playing once, with a meter of how full the storage is. OK on a file opens a
  picker with DELETE; a question comes first, "DELETE KICK.WAV?", with "2 SOUNDS USE IT" added when
  the open project uses the file. The strip has DELETE as a shortcut, as on POOL and PROJECT. Sounds
  that used the file, in this or any other project, show as MISSING afterwards.
- **In the browser,** how the device's storage is imitated is an implementation choice inside
  Foundation's storage interface: the browser's private storage for the site, which the shell asks
  to keep permanently. Nothing else about the browser shows through, and no browser feature shapes
  any of this.

## The note store

The core has two halves (Foundation): the **sound side** (the audio part: makes audio, hard
deadline) and the **screen side** (the control part: controls, display, saving, soft deadline).
Notes are read by both: the sound side plays them, the screen side draws, edits, saves and undoes
them. An independent review compared three designs on concrete cases (one note during recording, a
10,000-note paste, a clear, a 1,000-bar pattern, autosave, undo, drawing, bit-identical replay,
memory); a second review attacked the chosen one. This is the result.

### One pool of equal blocks

All note data lives in one pool of fixed half-kilobyte blocks **(my call)**: blocks of notes, the
index blocks that order them, pressure-curve blocks, pattern records and the clipboard's holdings.
The pool's size is a budget-profile number, provisionally **8 MB, about 500,000 notes** **(my
call)**: 300 bars of all four tracks playing twelve sounds on every sixteenth, with room over. It is
read a few blocks at a time, so on a device it can live in slow external RAM, like the samples.
Pattern length costs nothing: an empty 1,000-bar pattern uses no block, patterns 1 to 16 together
use half a block while empty, and a bar number runs to 65,535 (about 36 hours at 120 BPM in 4/4).

### How notes are arranged

Each track of each pattern keeps its notes in a balanced tree of blocks, ordered by bar, then place
in the bar, then sound, then pitch. A note block holds about thirty notes; with 500,000 notes any
note is four block reads away. Sparse and dense bars pack alike, so "one hat per bar for 1,000 bars"
costs 4,000 notes, not 4,000 blocks. Everything the screen does (the lanes of STEP, the rows of
ROLL, the step buttons' bar, a tap on a step) reads one bar at a time. The order of notes is total
and identical in every build, so two notes at the same tick always trigger in the same order. Blocks
left less than a quarter full by deletions are merged when next copied.

### Who writes

The screen side is the only writer. The sound side holds, per track, which version it plays, and
never writes a note. Blocks are never changed in place once the sound side can see them: an edit
copies the blocks on the path to the note it touches (about 2.5 KB), changes the copies and
publishes a version: "track T of pattern P becomes this version from this moment". The sound side
switches at the first 32-sample chunk boundary at or after the moment, moves its cursor into the new
version and reports back; only after that report may the old blocks be reused. Undo, redo and the
clipboard simply keep hold of older versions, and unchanged blocks are shared between versions.
Reference counts are kept by the screen side alone.

Rejected: the sound side owning the notes and applying edits sent as messages (the Deluge's way,
which works there only because the Deluge has no separate audio thread; here the screen would draw,
save and snapshot while the sound side shuffled notes about, and undo would need a log kept on the
side with the hard deadline); and publishing a complete copy of the pattern after every edit (the
DAW approach: two full copies at all times, and recording into a long pattern slows with every
note).

### One version per edit, at its own moment

The moment is computed from the timestamp of the input that caused the edit, plus a fixed lead, a
budget-profile number measured in Foundation's spike. Every message is numbered; the sound side
records the sample at which it applied each one, and these records belong to the session log, so a
replay applies every edit at the same sample as the live session, late ones included. This is
Foundation's own rule ("the delay used is recorded with the input") applied to edits; without it, a
late browser would make a live session differ from its replay.

The screen side never decides anything about notes from what the sound side reports: which pattern
was playing when a pad was hit, which pass, which tempo anchor all come from its own transport
model, a pure function of the inputs. Reports only drive the playhead on screen and the reuse of
memory. Versions are not sent for a pattern the sound side neither plays nor has queued; queueing a
pattern sends its versions. If the version queue is full, the screen side stops taking inputs until
there is room; the sound side never waits.

In the browser, the sound side's per-batch wake-up paces the screen side, so "a step" means "all
inputs stamped before this batch", a pure function of the log.

### Recording

The screen side turns the pad's press and release timestamps into ticks with Foundation's formula
and the tempo anchor in effect at the hit, quantizes if QUANTIZE is on and inserts the note when the
pad is released. A note with the same track, sound, pitch, bar and place replaces the old one, so
two quantized hits in one cell within a pass become one. A hit that quantize snaps forward has
already sounded live; its version's moment is set just after the snapped start, so the sequencer
never plays it in the same pass, and nothing is stored or cleared on the sound side. A note pressed
in one pattern and released after a switch belongs to the pattern it was pressed in; STOP or REC off
while a pad is held ends the note there; a note can never be longer than its pattern.

### Erasing while playing

From the press of CANCEL + pad the sound side stops triggering that sound (that pitch in KEYS mode),
and at the release one edit removes the notes between the two timestamps, split at the loop point if
the hold crossed it; a hold longer than a pass removes them all. Notes already sounding keep
ringing.

### Big edits

A paste or a copy of a bar, a sound's notes, a track or a whole pattern builds nothing it can share:
a whole-pattern or track paste is a version that points at the clipboard's blocks; a bar paste
copies one bar's blocks; pasting a sound's notes onto another sound copies every note it moves,
since each note's sound number changes. A clear publishes an empty version.

**A length or signature change publishes only a new pattern record.** Notes past a bar's new end or
past the pattern's new end are skipped by the sound side, not drawn and not saved, so to the user
they are deleted; their blocks are reclaimed in the background once undo has moved on. Copying every
block instead would need old and new to fit at once, so a pattern over half the pool could never be
changed. This is also the substrate Workflow B's later hidden notes need. The new signature takes
hold at the next bar line, so the bar being played never changes under the playhead, and a playhead
past a new shorter length wraps to bar 1 at the next bar line **(my call)**.

Notes already sounding keep their own end, copied at the moment they start: versions decide only
when notes start.

## Pressure curves

- **One block per note, at most.** A note that has pressure points at its curve block; a note with
  none (every step-entered note, and any hit whose pressure never changed) stores nothing, so
  pressure costs nothing where it is not played.
- **A point is "ticks since the last point, value 0 to 127".** The first point is the pressure at
  the hit. About 160 points fit in a block.
- **Recording keeps a point only when it says something new:** the value has moved by at least 2, or
  a 1/32 beat has passed since the last kept point **(my call)**. When the block fills, every second
  point is dropped and the minimum spacing doubles, so a long expressive hold ends with a complete
  but coarser curve. Both rules are whole-number arithmetic on timestamps and values, so they replay
  identically.
- **While a pad is held,** its points go into a block nobody else can see yet; the curve joins the
  note's version at release, and from then on the block is never changed, shared by copies, undo and
  the clipboard like any other block. MIDI channel aftertouch, one value for the whole keyboard
  (Workflow A), gives every held note the same point.
- **If no block is free,** the note is kept without its curve, never dropped for its curve's sake.
- **Later,** when modulation plays pressure, the sound side walks the points with the same
  tick-to-sample formula the sequencer uses; automation lanes can use this block kind with a lane
  header instead of a note.

In part 1 only a MIDI controller with aftertouch fills a curve; the mouse, the computer keyboard and
the on-screen pads have none.

## Undo, the clipboard and running out of memory

**Undo is a kept-back version.** Before an action, the current version of each track it touches is
kept; SHIFT + CANCEL publishes the kept version again, and a second press publishes the one it
replaced. One level means one kept action. Keeping costs only the blocks the old and new versions do
not share: a few blocks for a note edit, about one block per bar recorded into for a recording pass,
the replaced bar's blocks for a bar paste, and everything removed for a clear, which is the one case
that can be big. Undoing a length or signature change is just the old pattern record; the notes it
hid are still there, because background reclaiming waits until undo has moved on.

**An undo budget decides "too big".** Undo may hold at most a budget-profile number of blocks,
provisionally a quarter of the pool **(my call)**. Before a clear, a paste or a length or signature
change, the screen side counts what its undo would hold; if that exceeds the budget it asks "CAN'T
UNDO. CLEAR?" and, on OK, runs without an undo entry. The count depends only on the notes, so it is
the same in every build. A recording pass cannot ask mid-pass: it stays undoable as long as it fits,
and if memory runs out during the pass its undo is dropped first and the header shows UNDO LOST.

**The clipboard keeps hold, it does not copy.** COPY makes the clipboard point at the blocks of what
was copied, so copying a whole pattern costs nothing until the original is edited. One clipboard,
replaced by the next copy, never saved.

**Counting memory.** Decisions use what is free once the sound side has let go of superseded
versions, even if the report has not arrived yet, so they depend only on the inputs; the actual
reuse of a block waits for the report, with a small reserve for versions in flight. Everything in
the pool is one of: the live versions, versions on their way to the sound side, the undo and redo
versions, the clipboard, the autosave snapshot and free blocks.

**When an action does not fit,** things give way in this order, each shown in the header: the redo
version; then the undo version, with the question for a deliberate action and UNDO LOST during
recording; then the action is refused: step entry and paste say NOT ENOUGH MEMORY, a paste being all
or nothing; recording keeps the pad sounding but stores nothing and shows FULL for the rest of the
pass; a pressure curve that does not fit is dropped before its note. **The clipboard is never taken
away.** Length and signature changes only ever free memory.

## The files and their format

### No migrations in part 1

**(owner's choice)** One build runs in one place and projects are experiments, so a format change is
a clean break: a file whose format version is not the current one is OLD, shown on the PROJECT list
and deletable, never opened. The library survives every change, since WAV files are WAV files and a
change to our private chunk is rewritten at the next import. Everything needed for two versions to
read the same files waits for part 2; see "Later, with the companion". What stays is what protects
today's work: a version number so new code never misreads an old file, checksums so damage is
detected, all-or-nothing saves so a crash never destroys the project being worked on, and a previous
copy of the small files.

### Layout of the internal storage

```
groovebox                       a one-line marker with the format version
settings, settings.prev         the device settings and their previous good copy
samples/<folder>/<name>.wav     the library
projects/<n>/project            everything but the notes and the view
projects/<n>/project.prev       its previous good copy
projects/<n>/view               where you were, saved lazily
projects/<n>/pattern-<k>        one file per pattern that has notes, named by internal number
tmp/                            half-written files, emptied at start-up
```

Project numbers are never reused: NEW and COPY take the highest number so far plus one, Workflow A's
"next number", and the number is written inside the project file too. The project file holds the
pool, the pads, each track's effects and mix, tempo, signature, GRID, SWING, QUANTIZE, the master
level and each pattern's record: internal number, position, length, "changed" and note count. It is
a few kilobytes; a pattern file is 16 bytes per note plus its curves. The PROJECT screen is drawn
from the folder names alone; a name chunk is reserved for typed names later.

### Saving

The core asks the platform to "replace file X with these parts, all or nothing". The browser does it
with the file system's open, write and close, which swaps a finished file in; a device does it with
a temp file and a rename on a file system that renames atomically and levels wear, a requirement for
part 3. A saved file may still be lost to a power cut before the browser flushes it; accepted in
part 1.

Autosave runs 2 seconds after the last change and at least every 10 seconds while changes continue,
recording included **(my call)**: every save is of a consistent snapshot (a set of versions the
screen side keeps hold of while it writes), so a save mid-pass is simply an earlier consistent
state. Only files whose contents changed are written, pattern files first, then the project file,
then deletions, so the only mismatch a crash can leave is a pattern file newer than its project. The
view file waits 10 seconds and is also saved when you switch projects. Settings follow the same
rule, so the volume knob does not rewrite them per click.

If storage is full, the old file is untouched and the screen says "STORAGE FULL. NOT SAVED";
importing a sample checks the space first and keeps a reserve so a project file always fits.

### Opening

The loader has a rule for everything it can meet:

- a project or settings file that fails its check is replaced by its `.prev` copy, with "RESTORED
  FROM LAST SAVE";
- a pattern file that fails is renamed `.damaged`, kept for a later tool, and shown as "PATTERN 3
  DAMAGED";
- a pattern whose record says it has notes but whose file is gone shows "PATTERN 5 MISSING"; no
  record and no file is simply empty;
- notes whose sound is not in the pool are dropped with "N NOTES OF A MISSING SOUND DROPPED";
- pattern files no record mentions are deleted;
- the view file names things by number and falls back to defaults for anything that is gone;
- a file with another format version is OLD: listed, deletable, not opened.

### Chunks

A file is a header (a magic word, the format version, the chunk count) and chunks: a tag, a length,
the content padded to four bytes and a CRC-32 of its own. A damaged or unknown chunk is skipped with
one warning and takes its default, so a broken view chunk never empties a pattern.

Records are fixed-size and little-endian: a note is 16 bytes, bar and place 16-bit (a place runs to
65,535 ticks; a 16/4 bar needs 30,720), length 32-bit; pressure curves sit in their own chunk,
referenced from the note; strings are capped at 255 bytes for paths and 64 for names. Parameters are
"ID = number" pairs nested in a chunk per sound and per effect slot, so every pair's owner is
unambiguous; list choices are saved by a permanent key, never by the label, which stays free to
change (a Foundation clarification). Notes are written in key order, so a file depends on the notes
alone and the drift tests can fingerprint it.

One binary format for everything **(my call)**; the test build, which has a standard library, gets a
dump tool that prints any file as text for inspection and diffing. A text format for the small files
was considered and declined: one reader in the core is simpler, and the dump tool gives the
readability.

### Sample files

WAV at 48 kHz and 16 bits, channels kept, as Sound decided, with the sampler chunk rescaled to the
new rate (loop ends inclusive, as the WAV rules say; loop types other than forward are read as
forward) and one private chunk of our own before the audio data: the original file name and a
fingerprint of the converted audio, BLAKE3 cut to 128 bits with the channel count in front **(my
call)**, computed once at import and written into the sound that uses it too. In part 1 the
fingerprint only recognises a re-dropped file: identical audio reuses the existing file, different
audio under the same name gets a "-2". Names are reduced on import to letters, digits, space, dash,
underscore and dot, trimmed and capped, so they survive Windows, FAT and the browser alike; two
names differing only in case collide. The root note and loop points in the file are the defaults a
new sound takes; the sound's own values live in the project.

### Later, with the companion

In part 2 two builds will read the same files, and the format grows what part 1 leaves out, as the
independent review laid out: an "oldest version that can read it" number beside the writing version;
unknown chunks carried forward on save by the platform, which has the old file and can stream them
without a heap in the core; a "must not be lost" bit on chunks that makes an older reader open the
project read-only; migrations with one pre-migration copy per project; a library index and finding
moved files by fingerprint; chunk layouts that never change once shipped. The companion will read
and write files by running the same core, not a second parser, and part 2 decides how it and the
device avoid writing the same files at once; the format needs nothing for that beyond a sequence
number in the file header, which is reserved now.

## Projects and the library in use

**Starting up** opens the project named in the settings, or a new empty one if there is none or it
cannot be opened.

**Opening a project** reads its project, view and pattern files, then copies every sample its pool
uses from storage into RAM, in pool order, while the screen is already usable; a sound plays as soon
as its sample is in, since voices only ever play what is loaded (Foundation). A sample that is not
there makes its sound MISSING, one that would overflow the 64 MB budget makes it NO ROOM, and one
line reports the total. A project always opens stopped and disarmed, on the screen, page, bar and
sound the view file names.

**Switching projects.** OPEN stops playback, lets the current project's autosave finish, then opens
the other. NEW makes an empty project under the next number, in 4/4 at the default tempo. COPY
writes the highlighted project's files under the next number; the copy points at the same sample
files, so it costs kilobytes, and you stay where you are. DELETE removes the folder after its
question; the open project cannot be deleted (Workflow A).

**The library.** A WAV dropped on the shell is placed in `tmp/`; the core converts it in pieces
through the storage interface into `samples/`, in the folder it was dropped with, and the original
is removed. The picker and the SAMPLES screen read each file's header when listing a folder, which
gives the length, channels and RAM cost Workflow A shows. DELETE on the SAMPLES screen removes the
file: sounds of the open project that use it turn MISSING at once, other projects find out when they
are opened. REMOVE UNUSED on POOL removes sounds from the project and never touches a file.

**The RAM budget** counts the converted size of each distinct file the pool uses, once, however many
sounds share it. POOL's meter and the picker show what is left, and a file that would not fit cannot
be chosen, as Workflow A decided.

## Testing

On top of the other specs' testing:

- **Ordinary tests:** the note store against a plain reference model fed random edit sequences; the
  block accounting checked after every action (every block reachable or free, counts exact); the
  queue and the handover under a model checker that permutes interleavings; every loader rule with a
  damaged, missing, orphan or old file; the save order and a simulated crash between any two writes;
  "too big" counting; the give-way order; the replace rule, the forward-snap rule, erase across the
  loop point, a switch mid-pass; name sanitising and collisions; the fingerprint against known
  vectors.
- **Drift scenes:** autosave during recording; a project closed and reopened with its view intact; a
  1,000-bar sparse pattern and a dense bar; a paste of thousands of notes while playing; a clear
  with and without undo; a hit just before a grid line with quantize on; a signature change while
  playing; a deleted sound with notes; a missing sample. Saved files are fingerprinted like audio.
- **The screen gallery** shows the SAMPLES screen, the MISSING, NO ROOM and OLD marks, the delete
  questions, the notices and the header messages.

## Changes to the part 1 overview

Applied to the overview together with this spec:

- The Project model part of the decision register points to this spec; its open questions are
  answered here.
- The Look part gains the SAMPLES screen, the MISSING, NO ROOM and OLD marks, the header messages
  and a development meter for note memory.
- The non-goals gain migrations and files shared between versions, until part 2.
- The glossary gains storage, RAM, library, version, block, fingerprint and SAMPLES screen; sample
  memory becomes RAM.

## Changes to Workflow A

Applied to Workflow A in the consistency pass:

- A **SAMPLES screen** at MENU + 10 lists the library by folder with each file's length and size and
  a storage meter; the highlighted file plays once; OK opens a picker with DELETE, after a question
  that names the file and, when the open project uses it, counts its sounds; the strip has DELETE.
- **POOL's DELETE** question counts pads and notes ("DELETE KICK? ON 2 PADS, 24 NOTES") and removes
  them with the sound. "Used" has one definition (see "The project and its parts").
- **MISSING and NO ROOM** marks on POOL, on the STEP lane and in the header, with a one-line notice
  on opening.
- **The sample picker** lists lengths and sizes read from file headers.
- **NEW and COPY** take the next project number; numbers are never reused.
- **The sample budget** is RAM per project, and the spec says "RAM" where it said "sample memory".

## Changes to Workflow B

Applied to Workflow B in the consistency pass:

- The header messages UNDO LOST, FULL and NOT ENOUGH MEMORY, and the trigger of the "CAN'T UNDO"
  question: the undo budget.
- A new signature takes hold at the next bar line; a playhead past a shortened length wraps to bar 1
  at the next bar line.
- Two quantized hits in one cell within a pass become one note.
- A note pressed in one pattern and released after a switch belongs to the first; STOP or REC off
  while a pad is held ends the note.
- Patterns carry an internal number beside their position.

## Changes to Foundation

Applied to Foundation in the consistency pass:

- **No removable card.** The device has internal storage; "storage card" becomes "the device's
  storage". The browser's storage stays the site's private storage with persistence requested.
- **The two memories** are called storage and RAM; "sample memory" becomes "RAM".
- **"Recorded notes" leaves the sound-to-screen traffic:** the screen side records from timestamps
  with Foundation's formula.
- **The storage interface** gains "replace file, all or nothing, in parts", a free-space check and
  header reads for listings.
- **The budget profile** gains the note pool (8 MB), the undo budget (a quarter of it), the edit
  lead and the version queue's size.
- **The session log** gains the sample at which each edit was applied, so late edits replay exactly.
- **In the browser,** the sound side's per-batch wake-up paces the screen side.
- **List choices** get permanent keys separate from their labels, held in the master list entry.

## Changes to Sound

Applied to Sound in the consistency pass:

- The converted WAV carries a private chunk (original name, fingerprint) before the audio data and a
  rescaled sampler chunk with inclusive loop ends; loop types other than forward are read as
  forward.
- The root note and loop points in the file are the defaults a new sound takes; the sound's own
  values live in the project.
- Import sanitises file names and resolves collisions by fingerprint.

## Assumptions about other specs

- **Look:** draws the SAMPLES screen, the MISSING, NO ROOM and OLD marks, the notices and header
  messages (UNDO LOST, FULL, NOT ENOUGH MEMORY, STORAGE FULL. NOT SAVED, RESTORED FROM LAST SAVE,
  PATTERN n DAMAGED, PATTERN n MISSING), the delete questions, and a development meter for note
  memory; the browser shell's file drop puts files into `tmp/` for the core to import.
- **Part 2 (companion):** transfer and backup over USB; the format's growth listed under "Later,
  with the companion"; the companion runs the same core to read and write files.
- **Part 3 (hardware):** a file system with atomic rename and wear levelling; RAM for the note pool
  beside the samples; the two-slot save as the fallback where atomic rename is missing.

## Research sources

- **Devices:** [EP-133 K.O. II guide](https://teenage.engineering/guides/ep-133/modes) (storage,
  slots, erase);
  [EP sample tool](https://support.teenage.engineering/hc/en-us/articles/11639171890204-how-to-use-the-EP-sample-tool);
  [OP-XY project](https://teenage.engineering/guides/op-xy/project) and
  [sample](https://teenage.engineering/guides/op-xy/sample);
  [Digitakt II manual](https://www.elektron.se/wp-content/uploads/2026/10/Digitakt-2-User-Manual_ENG_OS1.17_260930.pdf)
  (hash-based samples, unload unused);
  [MPC 3.4 user guide](https://cdn.inmusicbrands.com/akai/MPC3-NI/MPC%20Standalone%20OS%20-%20User%20Guide%20-%20v3.4.pdf)
  (delete warning listing tracks);
  [M8 manual](https://cdn.shopify.com/s/files/1/0455/0485/6229/files/m8_operation_manual_v20260421.pdf)
  (missing samples, bundles); [Deluge firmware](https://github.com/SynthstromAudible/DelugeFirmware)
  (song view state, `ignoreNoteOnsBefore_`, NoteRow and ResizeableArray, ActionLogger, expression
  nodes, temp-file save) and
  [guidebook](https://synthstrom-audible-deluge.s3.us-east-2.amazonaws.com/Deluge-Guidebook-4p1-OLED.pdf);
  [Ableton Move manual](https://www.ableton.com/en/move/manual/) (autosave);
  [Westlicht Performer](https://github.com/westlicht/performer) (fixed-size model, versioned
  reader).
- **Real-time data exchange:**
  [Ardour RCU](https://github.com/Ardour/ardour/blob/master/libs/pbd/pbd/rcu.h) and
  [session events](https://github.com/Ardour/ardour/blob/master/libs/ardour/ardour/session_event.h);
  [farbot](https://github.com/hogliux/farbot);
  [Tracktion LockFreeObject](https://github.com/Tracktion/tracktion_engine/blob/develop/modules/tracktion_graph/utilities/tracktion_LockFreeObject.h);
  [Timur Doumler on locks in real-time audio](https://timur.audio/using-locks-in-real-time-audio-processing-safely);
  [Linux RCU](https://www.kernel.org/doc/html/latest/RCU/whatisRCU.html);
  [deterministic lockstep](https://gafferongames.com/post/deterministic_lockstep/);
  [WebAssembly threads](https://github.com/WebAssembly/threads/blob/main/proposals/threads/Overview.md);
  [HTML agents and blocking](https://html.spec.whatwg.org/multipage/webappapis.html);
  [Chrome audio worklet design pattern](https://developer.chrome.com/blog/audio-worklet-design-pattern/).
- **Structures and undo:** [B+ tree](https://en.wikipedia.org/wiki/B%2B_tree);
  [LMDB](https://en.wikipedia.org/wiki/Lightning_Memory-Mapped_Database);
  [im-rs](https://docs.rs/im/latest/im/); [heapless](https://docs.rs/heapless/latest/heapless/);
  [loom](https://github.com/tokio-rs/loom);
  [Emacs undo limits](https://www.gnu.org/software/emacs/manual/html_node/elisp/Maintaining-Undo.html);
  [Hapax MPE](https://squarp.net/hapax/manual/modempe/);
  [Live MPE editing](https://www.ableton.com/en/live-manual/12/editing-mpe/).
- **Files and formats:** [File System standard](https://fs.spec.whatwg.org/) (createWritable,
  close);
  [Chromium file writer](https://raw.githubusercontent.com/chromium/chromium/main/content/browser/file_system_access/file_system_access_file_writer_impl.cc);
  [littlefs](https://github.com/littlefs-project/littlefs/blob/master/README.md);
  [FatFs application note](http://elm-chan.org/fsw/ff/doc/appnote.html);
  [SQLite atomic commit](https://www.sqlite.org/atomiccommit.html);
  [Pillai et al., crash consistency](https://www.usenix.org/conference/osdi14/technical-sessions/presentation/pillai);
  [PNG chunk structure](https://libpng.org/pub/png/spec/1.2/PNG-Structure.html);
  [ext4 feature tiers](https://docs.kernel.org/filesystems/ext4/super.html);
  [Protocol Buffers unknown fields](https://protobuf.dev/programming-guides/proto3/);
  [RIFF chunk rules](https://www.tactilemedia.com/info/MCI_Control_Info.html);
  [WAV smpl chunk](https://www.recordingblogs.com/wiki/sample-chunk-of-a-wave-file);
  [libsndfile wav.c](https://raw.githubusercontent.com/libsndfile/libsndfile/master/src/wav.c);
  [Koopman CRC-32 tables](https://users.ece.cmu.edu/~koopman/crc/crc32.html);
  [BLAKE3](https://raw.githubusercontent.com/BLAKE3-team/BLAKE3/master/README.md);
  [Windows file names](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file);
  [Ardour sessions](https://manual.ardour.org/working-with-sessions/whats-in-a-session/);
  [Renoise doc_version](https://forum.renoise.com/t/rns-files-have-the-renoise-version-info/47530).
