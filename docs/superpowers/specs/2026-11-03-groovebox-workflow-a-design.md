# Groovebox part 1 – Workflow A: playing and sounds

Status: design, approved by the owner. The third of six subpart specs of part 1; see
[the part 1 overview](./2026-10-26-groovebox-core-browser-design.md) for the intent, the goals and
the decision register, [Foundation](./2026-11-02-groovebox-foundation-design.md) for the ground
rules and [Sound](./2026-11-03-groovebox-sound-design.md) for the engines, the voice chain and the
effects this spec makes playable.

**Nothing here is final.** The workflow is what part 1 exists to find out, and it will change as the
owner plays. This spec records the starting point. Bindings, pages and screens are code, changed by
editing code (Foundation).

Every section of this spec was presented to the owner and approved. Points where the owner chose
between options are marked **(owner's choice)**.

## What Workflow A decides

How the device is played and how sounds are made, reached and shaped: what is selected, the screens
and how you move between them, how every parameter is reached on the screen and which ones the
encoders hold, how sounds are made and put on pads, the effect slots, the mix and the volume, octave
shift, projects, velocity and pressure, and the actions and bindings behind all of it.

It does not decide transport, tempo, step entry, recording, patterns or what the STEP and ROLL
screens show (Workflow B); how screens are drawn, where controls sit on the panel or how mouse,
keyboard and MIDI map to controls (Look); or how any of it is stored (Project model). "Assumptions
about other specs" lists what this spec expects from them.

## Principles

**(owner's choice)**

- **Two routes, both shallow.** Buttons cover what you do while playing. The screens reach
  everything, including what also has a button.
- **No menu diving.** Every screen is two presses away from anywhere. A screen never opens another
  screen; the only second levels are a picker and a question, which close once you have answered,
  and Workflow B's NOTE panel.
- **The screen is the interface; the encoders are shortcuts.** Everything on a screen can be reached
  with the arrows and used with OK and CANCEL, and values change with − and +. The encoders are
  shortcuts for up to four items of the page, named in code; the strip shows those items and nothing
  else.
- **No value is ever confirmed.** Turning an encoder or pressing − or + changes a value at once.

## Decisions at a glance

The sections below mark which points the owner chose.

| Topic         | Decision                                                                                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Selection     | Hitting a pad in PADS mode selects its sound; each track remembers its sound, pad mode and octave                                                                         |
| KEYS mode     | Plays the selected sound; to change it, go back through PADS                                                                                                              |
| Screens       | STEP, ROLL, SOUND, FX, MIX, POOL, PROJECT, SETTINGS, Workflow B's PATTERN and the Project model's SAMPLES; MENU + step jumps to any of them                               |
| Strip         | Shows exactly what the encoders hold, up to four items of the page, and nothing else; empty where they hold nothing; under STEP and ROLL it is the selected sound's page  |
| Pages         | A group of related settings, of any number, scrolling when it does not fit; PAGE + step picks a page, on every screen                                                     |
| Cursor        | The arrows move a cursor over everything on the screen; OK uses, CANCEL backs out, − and + change values                                                                  |
| Encoders      | Shortcuts for items of the page, named in code: a turn changes an item, a press is OK on it; nothing in pickers and questions; push switches; fixed steps; SHIFT is finer |
| Making sounds | From the pad: the PAD page's picker offers NEW SAMPLE, NEW SYNTH and the pool; ENGINE switches a sound between sample and synth                                           |
| Variants      | COPY on the PAD page gives the pad its own copy of a shared sound                                                                                                         |
| Names         | Automatic in part 1                                                                                                                                                       |
| Sample picker | The highlighted sample plays from RAM through the preview player; nothing loads, nothing is refused; the library meter at the top                                         |
| POOL          | Overview and housekeeping, with the library meter; highlighting a sound selects it; its actions are in its list and pickers, the strip is empty                           |
| Effects       | A CHAIN page plus one page per slot, holding all of its effect's settings                                                                                                 |
| Mute          | SHIFT + T1–T4, from any screen                                                                                                                                            |
| Volume        | A dedicated fifth encoder: output volume after the soft clipper, a device setting                                                                                         |
| Octave        | PADS/KEYS held + up or down in KEYS mode                                                                                                                                  |
| Projects      | Autosave, like the EP-133; NEW in PROJECT's list, OPEN, COPY and DELETE in a project's picker; the strip is empty                                                         |
| Copying       | Projects on PROJECT; bars, patterns and notes are Workflow B's                                                                                                            |
| Velocity      | One switch: from how the pads are hit, or none                                                                                                                            |
| Pressure      | Stored in notes from part 1                                                                                                                                               |

## Controls

The panel has these controls:

- **Function buttons:** 15 of them: T1–T4; ROLL, PADS/KEYS, SHIFT; REC, PLAY, STOP, TEMPO; and four
  arrows. There is no STEP button: STEP is MENU + 1 (Look).
- **MENU, PAGE and COPY,** three more. COPY is Workflow B's.
- **OK, CANCEL, − and + (owner's choice),** four buttons next to the arrows. That makes 22 function
  buttons.
- **Four encoders with push switches (owner's choice).** The core sees each push switch as a button.
- **A fifth encoder for the volume (owner's choice),** without a push switch.
- **16 step buttons and 12 pads.**

Where the controls sit on the panel is the Look spec's job.

## Selection

- **Tracks.** T1–T4 select the current track. Each track remembers its own selected sound, its own
  pad mode and its own octave **(owner's choice)**. In a new project every track starts in PADS
  mode.
- **PADS mode.** Hitting a pad plays its sound and selects both the pad and the sound **(owner's
  choice)**. While a step is held the pad sounds but does not select; while CANCEL or COPY is held
  it neither sounds nor selects and only points at its sound (Workflow B). Hitting an empty pad
  selects it too, with the same exceptions. Nothing sounds, and the track then has no selected sound
  **(owner's choice)**; see "The PAD page". A new project starts with pad 1 selected on every track.
  Notes the sequencer plays never change the selection.
- **KEYS mode.** The pads play the selected sound chromatically, and nothing while there is none. To
  play another sound, go back to PADS, hit its pad and switch to KEYS again **(owner's choice)**.
- **POOL.** Highlighting a sound on the POOL screen selects it too, including a sound that is on no
  pad of the track **(owner's choice)**. It also selects the first pad of the current track that
  holds the sound, pad 1 for Kick on pads 1 and 12; only a sound on none of the track's pads leaves
  no pad selected **(owner's choice)**. Nothing sounds. Highlighting REMOVE UNUSED selects nothing
  and the selection stays as it was.
  - **The cursor follows the selection (owner's choice).** POOL opens with its cursor on the current
    track's selected sound, or on REMOVE UNUSED while an empty pad is selected. After that, whenever
    the current track or its selected sound changes by anything but a move on POOL, such as a pad
    hit or T1 to T4, the cursor lands on the new selection's row, so the cursor and the header
    agree. A cursor on REMOVE UNUSED stays there while only the cursor moves; a pad hit that selects
    a pad, T1 to T4 or MENU + 6 lands it on the selection again, also when the selection did not
    change.
- **What follows the selection.** The encoders on sound pages edit the selected sound, and the step
  buttons enter its notes (how is Workflow B's).

## Screens and moving between them

### The screens

| MENU + step | Screen   | What it is for                                                 |
| ----------- | -------- | -------------------------------------------------------------- |
| 1           | STEP     | The pattern in steps (Workflow B)                              |
| 2           | ROLL     | The pattern as a piano roll (Workflow B)                       |
| 3           | SOUND    | The selected sound's pages, with room for pictures             |
| 4           | FX       | The current track's six effect slots                           |
| 5           | MIX      | Track levels and mutes, and the master level                   |
| 6           | POOL     | Every sound of the project, and how full the library is        |
| 7           | PROJECT  | The projects: NEW, OPEN, COPY and DELETE                       |
| 8           | SETTINGS | Device settings and the Dev page (Look)                        |
| 9           | PATTERN  | Timing, bars and the pattern list (Workflow B)                 |
| 10          | SAMPLES  | The sample library by folder; deleting samples (Project model) |
| 11–16       |          | Free                                                           |

### Moving between them

- **MENU + step (owner's choice).** Hold MENU and the screen shows every screen as a numbered tile;
  press a step button to jump to that screen. Letting go of MENU without pressing a step does
  nothing.
- **Direct buttons.** ROLL keeps its own button. STEP has none and is MENU + 1 (Look). No other
  screen gets one in part 1; giving one a button later is a small code change.
- **No hierarchy.** A screen never opens another screen. The only second levels are a picker, opened
  from an item and closed once you have picked, a question, answered with OK or CANCEL, and Workflow
  B's NOTE panel, opened with OK from a cell with notes on STEP or ROLL.

### What every screen shows

- **A header:** track, sound, pad mode and octave, tempo, transport position, a recording indicator,
  muted tracks, and the name of the current screen and page. The sound's name is marked MISSING when
  its sample is not in the library (Project model).
- **A main area:** the screen's own content.
- **The strip:** the items the encoders hold, up to four, and nothing else; empty where they hold
  nothing. On STEP and ROLL it shows the encoders' items of the selected sound's page, whichever
  page was last open on SOUND, so you shape the sound while watching the pattern **(owner's
  choice)**. While a step or TEMPO is held there, the strip is Workflow B's instead; see "STEP and
  ROLL". On FX and MIX it shows their own pages' items. The cursor never goes to the strip
  **(owner's choice)**: every item lives in a main area, and the strip only repeats the ones the
  encoders hold (Workflow B).

### Alternatives rejected

- **A map moved with SHIFT + arrows,** like the M8. No new button, but distant screens take three or
  four presses.
- **A MENU list moved with the arrows.** Familiar, but the slowest route and the closest to menu
  diving.
- **Encoders on STEP and ROLL doing view controls only.** Clean, but you would leave the pattern
  every time you tweak a sound. Workflow B can still let "hold a step + turn" edit that step's note,
  as Elektron devices do.

## The cursor and the shortcuts

**(owner's choice)**

### On every screen

- **The cursor.** Every screen has one. The arrows move it over everything on the screen:
  parameters, actions, effect slots and list entries. Holding an arrow repeats it; the core times
  the repeats, so replays match.
- **How the cursor moves (owner's choice).** Up and down move it one item and stop at the ends. Left
  and right do nothing on a page of one column and move along a row of tiles. In a picker, up, down,
  − and + move one row, and left and right move one picker page of 16 rows, or 15 under the sample
  picker's top line, stopping at the ends. SHIFT + the arrows do nothing outside STEP and ROLL.
- **Each page remembers its cursor (owner's choice)** until the project closes; it is not saved. An
  item that vanishes moves the cursor to the nearest item above it, where it stays.
- **OK** uses the item under the cursor: it opens the item's picker, flips a switch, runs an action
  or chooses a list entry.
- **CANCEL** backs out: it closes a picker, goes up a folder or answers "no" to a question. On STEP
  and ROLL cells it removes notes; held with a pad, a key or a track button it erases and clears;
  SHIFT + CANCEL undoes (Workflow B).
- **− and +** change the value under the cursor by one click, at once. SHIFT + − or + moves 16 times
  finer, and holding repeats. A click is the item's click size, the same step an encoder makes,
  whether or not an encoder holds the item; on an item that opens a picker they do nothing.
- **The encoders are shortcuts for items of the page.** Each page names in code which of its items
  the four encoders hold, up to four; an encoder can hold only an item that is on the page, and the
  strip shows exactly those items. Turning encoder _n_ changes its item; pressing it is OK on that
  item. Using an encoder moves the cursor to its item, scrolling the page if needed, so you see what
  you are changing. Where a page holds nothing for an encoder, such as a list, the encoder does
  nothing and its strip cell is empty.

### Pickers and questions

- **A picker** is the only thing on the screen while it is open, so the controls act on it: the
  arrows and − and + move the highlight; OK chooses; CANCEL backs out. The encoders do nothing and
  the strip is empty: a picker is a list, and a list holds nothing for them. See "Sounds and pads"
  for the details.
- **A question,** such as "DELETE KICK?", is answered only with OK or CANCEL. Encoders 1 to 4 do
  nothing there, and neither do − and +; the strip is empty, so a stray press cannot confirm a
  delete. The volume encoder still sets the output volume **(owner's choice)**.
- **While a picker or a question is open the music carries on and you can keep playing (owner's
  choice);** controls that would leave it or change something else wait. Pads and keys sound, and
  are recorded when recording, but do not select: a new selection would change what the picker is
  for. PLAY, STOP and REC work, SHIFT + T1–T4 mutes and unmutes, and the volume encoder sets the
  output volume. Every other control does nothing until the picker or question is closed: T1–T4 on
  their own, MENU, PAGE, ROLL, PADS/KEYS, TEMPO, COPY, the step buttons and every other combination.
  They do not close the picker and do not answer the question.

Rejected: buttons that lead elsewhere closing the picker the way CANCEL does (a stray press would
throw the choice away, and would answer a question "no" without saying so) and pads and keys going
silent (playing would stop the moment a list opens).

### STEP and ROLL

The cursor on STEP and ROLL is Workflow B's, and so is what the arrows and − and + do there. The
strip there shows the encoders' items of the SOUND screen's current page, whose screen route is the
SOUND screen itself. While a step is held the strip is Workflow B's NOTE strip instead, and while
TEMPO is held its timing strip; their screen routes are the NOTE panel and PATTERN's TIMING page.

### Alternatives rejected

- **Encoders that move through lists and confirm,** with no OK and CANCEL: the owner wants the
  encoders for changing values, and confirming a delete by pressing the same encoder twice is
  fragile.
- **No push switches,** with OK doing everything: OK alone cannot tell which strip item is meant, so
  actions such as COPY would turn into picker entries.
- **Changing values without an encoder through an edit mode,** or by holding OK and pressing arrows:
  − and + are simpler and need no mode.
- **Encoder 1 moving the highlight and choosing in pickers,** the first design: the highlight is the
  value being chosen, so an encoder on it seemed consistent. Reversed when pages became groups: an
  encoder holds only an item that is on the page, a picker is a list that holds nothing, and the
  arrows and − and + already move the highlight. The encoders now do nothing in pickers, which this
  spec first rejected.

## Pages and encoders

### Pages

- **A page is a group of related settings (owner's choice),** of any number. The screen shows the
  whole page; when it does not fit, the page scrolls like a list. Pages group related things and
  never split a group to fit the encoders. Every item on a page is reached with the cursor, used
  with OK and changed with − and +.
- **PAGE + step (owner's choice).** Hold PAGE and the screen draws the current screen's page tabs;
  press step _n_ to go to page _n_. This works on every screen, STEP and ROLL included.
- **Page memory.** Each screen remembers its page. The strip under STEP and ROLL shows the encoders'
  items of the SOUND screen's page, so PAGE + step there changes SOUND's page.
- **SOUND's pages,** from the Sound spec's starting pages, with the PAD page first:

  | PAGE + step | Page                                    |
  | ----------- | --------------------------------------- |
  | 1           | PAD (see "Sounds and pads")             |
  | 2           | engine (different for sample and synth) |
  | 3           | filter                                  |
  | 4           | filter envelope                         |
  | 5           | volume envelope                         |
  | 6           | voice                                   |

  Each page names in code which of its items the encoders hold, up to four; Sound lists the starting
  choices. A page with fewer than four such items leaves an encoder, and its strip cell, empty.

### Encoders

- **Turning moves in fixed steps (owner's choice).** Counted values (semitones, choke groups, named
  choices) move one unit per click. Smooth values move by the parameter's click size, a new field in
  Foundation's master-list entry: 128 clicks across the range by default, tuned by ear per
  parameter. A smooth entry's click size must divide by 16, which the core checks when it is built.
  Values stop at the ends of their range and never wrap round.
- **SHIFT + turn (owner's choice)** moves smooth values 16 times finer: a fine click is a sixteenth
  of the click size. Counted values still move one unit. The volume encoder ignores SHIFT.
- **Press is OK on the encoder's item (owner's choice).** It opens the item's picker, flips a switch
  or runs an action such as COPY. On a smooth parameter it does nothing.
- **On STEP the encoders act in full (owner's choice).** A turn changes the value and moves the
  remembered cursor of SOUND's page to the item, and STEP's own cursor stays. A press is OK on the
  item, so a picker opens over STEP's main area and COPY runs.
- **− and +** move a value by the same steps as one click.
- There is no acceleration, so the same turn always changes a value by the same amount, and nothing
  depends on how fast the encoder was turned.

### Alternatives rejected

- **Step buttons picking pages on SOUND, FX and MIX, with SHIFT + left/right elsewhere.** One press
  on SOUND, but two different mechanisms.
- **Left and right always flipping pages.** Simplest to explain, but it takes the arrows from STEP
  and ROLL, and the last page is several presses away.
- **Accelerated encoders, and press-and-turn for fine or coarse steps.** The owner wants a fixed
  feel, and the press for acting on parameters.

## Sounds and pads

### The PAD page

SOUND's first page works on the selected pad of the current track. Sounds are made and put on pads
from here **(owner's choice)**. Its items, held by encoders 1 to 3:

- **Item 1: the pad's sound.** OK opens the sound picker: EMPTY, NEW SAMPLE, NEW SYNTH, then every
  sound in the pool. Turning its encoder or pressing − or + does nothing, so a stray turn cannot
  swap or create a sound.
- **Item 2: COPY.** It shows how many pads use the sound. OK gives this pad its own copy of the
  sound, so further edits stay on this pad **(owner's choice)**.
- **Item 3: ENGINE (owner's choice),** "Sample" or "Synth", as Look's Pad page shows it. OK opens a
  picker of two rows, "Sample" then "Synth", on the current one; turning or − and + do nothing, so a
  stray turn cannot reset a sound's engine. Choosing the current engine changes nothing.
  - Changing it keeps the shared chain (filter, envelopes, level and pan, tuning, voice) and starts
    the new engine at its defaults. "Synth" does this at once. "Sample" replaces the picker with the
    sample picker at once, and the switch happens only when a file is chosen, so CANCEL leaves a
    synth as it was and a sound never becomes a sample sound without its sample (Project model).
  - If the new engine does not allow the current play mode, the sound takes that engine's default.
    Both engines allow every play mode, so the mode stays.
  - Switching back does not restore the old engine's settings; a sound holds one engine's settings.
    The old engine's entries are never read again and are reset when that engine comes back.
- Encoder 4 holds nothing, so its strip cell is empty.
- When the sound was selected on POOL and sits on none of the track's pads, there is no selected pad
  and the page shows only ENGINE, still on encoder 3.
- **An empty pad (owner's choice).** While the selected pad is empty there is no selected sound.
  SOUND shows only the PAD page, and the page only item 1, which reads EMPTY; OK on it opens the
  sound picker as above. COPY and ENGINE are not shown, and encoders 2 and 3 hold nothing. PAGE
  shows one tile. Each screen still remembers its page: once a pad with a sound is selected, SOUND
  shows the remembered page again, so a stray hit on an empty pad never loses the page. Until the
  pad has a sound, no note lights on the step buttons (the step under the music still does while
  playing) and they do nothing, the strip under STEP and ROLL is empty and KEYS mode plays nothing.

Rejected: keeping the previously selected sound under the encoders and the step buttons while an
empty pad is selected. The PAD page would show one pad while the rest of SOUND and the step buttons
edited another pad's sound.

### Making sounds

- New projects start empty: no sounds, no samples, every pad empty.
- **NEW SYNTH** puts a virtual-analog sound with default settings on the pad.
- **NEW SAMPLE** opens the sample picker; choosing a sample puts a sample sound on the pad. It has
  every default, then Start is the file's first frame and End its last; Loop start and Loop end are
  the file's own loop, or the whole file when it has none; Root note is the file's; Loop and trigger
  follow the file's loop, as Sound says.
- **A pool sound** chosen in the picker goes on the pad as the same sound, shared with every other
  pad that uses it.
- **EMPTY** clears the pad.
- **The pool holds 1,024 sounds per project (owner's choice),** in working memory (Foundation's
  budget profile). When it is full, NEW SYNTH, NEW SAMPLE and COPY change nothing: the picker closes
  as on any choice, no sound number is used up (Project model) and the header shows "Pool full" in
  red. NEW SAMPLE is refused at once **(owner's choice)**: OK on it closes the picker, and the
  sample picker never opens.
- **Names are automatic (owner's choice).** A name is a base plus a number. The base of a synth is
  "Syn"; the base of a sample is the file's name without ".wav"; a trailing space and digits count
  as the number. A synth always carries a number (Syn 1), the first sound of a file none (Kick).
  Every later sound of a base, a copy included, takes the highest number of that base in the pool,
  plus one, and an unnumbered name counts as 1 (a copy of Kick is Kick 2). The base is shortened at
  a character boundary so that the name fits 64 bytes. Nothing extra is stored. Typing names comes
  later.

### Two ways to change what a pad plays

Each note stores which sound it plays, so:

- **Changing the sample,** with the Sample item on the sample engine's page, changes the sound
  itself. Every pad and every note that uses the sound hears the new sample. Every other setting
  stays, Loop and trigger too; only the start, end, loop points and root note come from the new
  file, as for a new sound. This is how a kick is swapped for a better one.
  - **The Sample page** is "Sample" (header "Sound Sample", tile "2 Sample"): Sample, Start, End and
    Loop on encoders 1 to 4, then Loop start, Loop end, Reverse and Root note (Sound; Look's Sample
    page). The Sample item shows the file's stored name with ".wav"; OK on it, or its push, opens
    the sample picker; turns, − and + do nothing, as on the Pad page's Sound and ENGINE.
- **Putting another sound on the pad,** with the PAD page's picker, changes only what the pad plays
  from now on. Notes recorded earlier keep their sound, which stays in the pool and can be reached
  on POOL.

### Pickers

All pickers work the same way:

- Up and down move one row; left and right jump a page. − and + also move one row **(owner's
  choice)**.
- OK chooses the highlighted entry or enters a folder.
- The encoders do nothing while a picker is open, and the strip is empty **(owner's choice)**.
- CANCEL goes up a folder, or closes the picker without choosing at the top level.
- NEW SAMPLE replaces the sound picker with the sample picker, so it stays one level deep.

### The sample picker

- Lists the library by folder, each file with its length and its size. A dim line at the top names
  the folder and shows the library meter, how full the library is, the same number as on POOL and
  SAMPLES: "drums/ Library 41.2 of 64 MB" in a folder, "Library 41.2 of 64 MB" at the top. Under it
  are 15 rows at every level. SAMPLES lists the library the same way, with its meter above the strip
  (Look), and the rules below hold on both.
- **Order (owner's choice).** Folders first, then files, each A to Z ignoring case, with a run of
  digits compared by its value, so kick 1.wav, kick 2.wav and kick 10.wav come in that order and
  kick.wav comes before kick 2.wav. An accented letter sorts with its plain letter, so déšť.wav
  comes between clap.wav and hat-closed.wav. A new import lands in its place by name.
- **Inside a folder (owner's choice)** the dim line names the folder, before the meter in the
  picker, and the first row is "..": OK on it goes up, and so does CANCEL. At the top level the
  folder and ".." are left out, and the picker's line keeps its meter. A folder too long for its
  place in the line is cut at its start, "…808 collection/long names/", so the folder you are in
  always shows.
- Every file can be chosen. The whole library is in RAM (Foundation), so picking loads nothing and
  nothing is ever "no room" here; the only refusal is at import (Sound). A file that start-up could
  not load is listed in red with "not loaded", as on SAMPLES, and is never previewed, but it can be
  chosen: the sound is then MISSING (Project model).
- **The highlighted sample plays once (owner's choice),** from RAM through Sound's preview player
  beside the 32 voices: dry, at a fixed level, after the tracks and before the soft clipper, so it
  never takes a voice from the music. It plays only when the arrows or − and + move the highlight
  onto a file. Moving the highlight stops the preview playing, and onto a file the new file's
  starts; a folder row and ".." play nothing. Nothing else starts it: not opening the list; not
  coming back to it from the picker with DELETE or from a question; not a delete that moves the
  cursor; not moving onto the file being deleted while its delete runs. OK or CANCEL stops it; STOP
  while stopped silences it too (Workflow B). Leaving SAMPLES fades a preview still playing out, as
  OK and CANCEL do; holding MENU or PAGE without choosing a screen does not stop it. Previewing
  while the music plays is allowed.
- **Where it opens.** From NEW SAMPLE and ENGINE it opens in the folder it was last in, on its first
  row. From the Sample item of the sample engine's page it opens in the folder of the sound's file,
  on the file, or as from NEW SAMPLE when the file is missing. Opening plays nothing. The folder is
  kept while the project is open (Project model: "the sample picker's folder"); a folder that is
  gone gives the top level.

Rejected: a memory cost per file, the time left in a budget and a "no room" mark, the first design.
They belonged to the per-project budget, which Foundation replaced with one library in RAM.

### POOL

- Lists every sound in number order with its engine, the pads it sits on and its sample's size,
  above the library meter, the same number as on SAMPLES and in the picker **(owner's choice)**. The
  list's first entry is REMOVE UNUSED, with no label.
- **Moving.** Up, down, − and + move the cursor one row and left and right 15, stopping at the ends,
  as on SAMPLES. SHIFT with them does nothing, and CANCEL does nothing, since POOL has no folders.
- **The pads** a row lists are the current track's pads that hold the sound, in pad order, as the
  PAD page and STEP's lanes show them: "pad 2" or "pads 1, 12", and "no pad" when none does
  **(owner's choice)**. A sound that nothing uses, on no pad of any track and in no note, reads "no
  pad, no notes", which is what REMOVE UNUSED removes.
- A sound whose sample is not in the library, or was not loaded, is marked MISSING, with the file's
  name: its row is red, with the file's name in place of the size, and a long name is shortened with
  "…" so that the label takes at most half the row **(owner's choice)**. It plays silence until its
  sample parameter picks a file (Project model).
- Highlighting a sound selects it (see "Selection").
- **OK on a sound** opens a picker of one row, "Delete", as SAMPLES' file picker does; OK on it
  opens the question, and CANCEL closes either. **OK on REMOVE UNUSED** removes every sound that no
  pad and no note uses, a sound selected on POOL that sits on no pad included. Both tidy the pool
  only: a sample stays in the library, and in RAM, until it is deleted on the SAMPLES screen
  (Project model), so neither frees sample RAM **(owner's choice)**. Both ask a question first:
  - DELETE's reads "Delete Kick?", then, dim, how many pads and notes use the sound, counting every
    track, such as "On 2 pads, 24 notes", with "On 1 pad" for one, then, dim, "OK deletes, Cancel
    keeps". For a sound nothing uses the count line is left out, as SAMPLES' question leaves out its
    count when no sound uses the file **(owner's choice)**.
  - REMOVE UNUSED's reads "Remove 3 unused sounds?" or "Remove 1 unused sound?", then, dim, "OK
    removes, Cancel keeps". The count is taken when the question is drawn and the sounds when OK is
    pressed. With no unused sound there is no question: the header says "No unused sounds" in the
    accent until the next button press **(owner's choice)**.
- POOL is a list, so the encoders hold nothing and the strip is empty. DELETE is reached only
  through the sound's picker, REMOVE UNUSED only as the list's first entry.
- Deleting a sound that is in use removes its notes and empties its pads too. A sound is used when
  it is on any pad of any track or played by any note of any pattern (Project model).
- **What a delete does.** The sound leaves the pool, and its number is never reused. Every pad that
  holds it, on every track, goes empty. A track that had selected it on no pad selects pad 1, its
  default (Project model). Its voices fade within one 32-sample chunk, as a deleted file's voices
  do. The library and the sample RAM stay as they are.
- **The cursor after a delete.** After DELETE it moves to the row above, as on SAMPLES, and that
  sound is selected as by any move onto it; when the row above is REMOVE UNUSED, the selection stays
  as the delete left it. After REMOVE UNUSED it stays on REMOVE UNUSED. After either, a delete that
  changed the current track's selection moves the cursor as anywhere else (see "Selection"): a sound
  selected on no pad leaves pad 1 selected, and the cursor lands on pad 1's sound.

### Alternatives rejected

- **Making sounds on POOL** and assigning them by hitting pads while POOL is open: making and
  placing become separate steps, and the pads mean something else on one screen.
- **A KIT screen** with the track's 12 pads: a clear overview, but a screen to visit for every
  change.
- **Choosing a copy when placing** (SHIFT + press in the picker): a hidden gesture.
- **Hitting the pad to audition samples:** the owner prefers hearing each sample as it is
  highlighted.

## Effect slots

The FX screen shows the current track's six slots.

- **Page 1, CHAIN (owner's choice),** has three rows: the six slots in chain order, then TYPE, then
  MOVE, both for the slot the cursor last stood on; the chain's cursor stays on that slot when the
  track changes, until the project closes. Encoders 1 and 2 hold TYPE and MOVE, so the strip shows
  them; encoders 3 and 4 hold nothing. Up and down move between the rows; left and right move along
  the slots and stop at the first and the last; on TYPE and MOVE they do nothing.
  - **TYPE** (encoder 1): OK on a slot or on TYPE opens a picker with EMPTY, DELAY and REVERB, on
    the slot's type. Choosing the type the slot holds changes nothing; choosing another clears the
    slot, as Sound decided, and starts the effect at its defaults; the old settings are gone.
    Turning encoder 1 and pressing − or + do nothing on TYPE or on the slots, as on any item that
    opens a picker.
  - **MOVE** (encoder 2) is a value reading the slot's place, 1 to 6: each click of the encoder, or
    each press of − or +, moves the slot one place along the chain, stopping at the ends; the
    cursor's slot goes with it. A moved effect keeps its settings and its sound, so a ringing tail
    does not break. The two slots swap their settings and memory together in one step (Sound).
- **Pages 2–7** are the slots in chain order, each holding all of its effect's settings: five for
  the delay, four for the reverb. The effect names which of them the encoders hold (Sound). An empty
  slot's page is empty, and so is its strip.
- Holding PAGE on FX shows the tabs "Chain", then each slot's effect, such as "Delay", "Reverb" and
  four dashes, an en dash "–" for each empty slot, as the strip's ranges use; the header names the
  page the same way.

Rejected: slot pages only, with the type as the first item of each slot's page. The chain has no
overview, and moving a slot needs a hidden gesture.

## Mix and volume

- **Mute (owner's choice).** SHIFT + T1–T4 flips that track's mute from any screen, at the press,
  with a picker or a question open, under MENU or PAGE and while steps are held; the current track
  does not change. Muted tracks are marked on their track buttons and in the header. Muting lets
  tails ring out (Sound): a note sounding at the mute keeps its end and plays its release, and notes
  that come due while muted are not caught up after the unmute. Pads and keys you play on a muted
  track still sound and are recorded as usual; only the pattern is silenced **(owner's choice)**.
- **MIX screen,** one page with no name **(owner's choice)**, so the header reads "Mix" and PAGE
  shows one tile, "1": the four track levels, then Sound's master level, the mix's own setting
  before the soft clipper, saved with the project. The encoders hold the four track levels, 1 to 4;
  the master level is reached with the cursor and has no encoder. A level moves by the usual click,
  128 across its range, and SHIFT by a sixteenth of that; OK does nothing on it. A muted track's
  item reads "Track 3 muted" with its name in red (Look). Mutes are shown on MIX but flipped only
  with SHIFT + T.
- **Volume (owner's choice).** A fifth encoder always sets the output volume, on every screen; pages
  never change it.
  - It is applied after the soft clipper, inside the core, so it never changes the sound's character
    and is part of the bit-identical output and the drift tests.
  - It is a device setting, not saved with projects, so loading a project never changes how loud you
    listen.
  - At the first start it is at a moderate level, picked by ear while building and kept as a named
    constant; no number is set now.
  - It has no push function.

Rejected: muting only on MIX (a screen change before every live mute) and a MUTE button (another new
button). Rejected for volume: the master level itself on the knob, which pushes into the clipper and
brings each project's own loudness back on load.

## Octave and projects

### Octave

- **PADS/KEYS held with up or down (owner's choice)** moves the pads one octave in KEYS mode
  (Workflow B). Pad 1 is always C.
- The header shows the octave (KEYS C4). Each track remembers its own.
- It starts at C4, the default root note of samples, so pad 1 plays a sample unchanged. The range is
  C0 to C8, so with pad 1 on C8 the pads reach B8, the highest note. C4 is MIDI note 60, middle C,
  so KEYS C4 in the header means pad 1 plays note 60.
- In PADS mode it does nothing. SHIFT + up or down is Workflow B's: it jumps the cursor 12 rows on
  STEP and ROLL.

### Projects

- **Autosave (owner's choice).** The open project saves itself shortly after every change; there is
  no SAVE. Starting up opens the last project, or a new empty one the first time.
- **PROJECT screen.** The list starts with NEW, then the projects, with the open one marked.
  - **OK on NEW** makes a new, empty project and opens it.
  - **OK on a project** opens a picker with OPEN, COPY and DELETE.
  - **COPY** keeps a copy of the highlighted project; you carry on in the project you have open.
  - **DELETE** asks a question first. The open project cannot be deleted.
  - PROJECT is a list, so the encoders hold nothing and the strip is empty. OPEN, COPY and DELETE
    are reached only through the project's picker, NEW only as the list's first entry.
- **Names are automatic:** PROJECT 1, PROJECT 2; NEW and COPY take the next number, and a number is
  never reused (Project model).
- Projects refer to samples in the library (Foundation), so a copy shares them and costs no sample
  RAM.

### Copying

- **Bars, patterns and a pad's notes** are copied often while composing and need a fast gesture.
  They are Workflow B's: its COPY button copies a bar or a pad's notes, SHIFT + COPY pastes and
  whole patterns are copied on the PATTERN screen **(owner's choice)**.
- **Projects** are copied rarely and on purpose: menu only, with COPY on PROJECT and no clipboard
  **(owner's choice)**.
- **Sounds** need no clipboard: the sound picker shares a sound, and COPY on the PAD page makes it
  the pad's own.
- **Effect slots** are not copied in part 1.

Autosave saves a mistake the moment it is made, which makes undo more important; Workflow B gives
one level of undo and redo, SHIFT + CANCEL.

## Velocity and pressure

- **VELOCITY switch (owner's choice),** a device setting on the SETTINGS screen, beside Workflow B's
  METRONOME, METRONOME LEVEL and COUNT-IN and the Look spec's Dev page. It starts ON.
  - ON: notes take their velocity from how hard the pads are hit.
  - OFF: every hit plays at full velocity, so a sound plays exactly as set and its velocity amounts
    have no effect.
- **Inputs without velocity,** such as the mouse and computer keys, play at full velocity whatever
  the switch says. How each input device is mapped is the Look spec's job.
- **Pressure (owner's choice).** Pads and MIDI deliver each pad's pressure as it changes, and a note
  keeps its pressure curve, recorded with the note. Nothing in part 1 plays it yet; it waits for
  modulation. MIDI channel aftertouch, one value for the whole keyboard, applies to every held pad.
  Pressure is recorded whatever the VELOCITY switch says.

## Actions and bindings

The starting bindings, written in code (Foundation) and expected to change:

| Control                     | Action                                                                                                          |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| T1–T4                       | Select the track                                                                                                |
| SHIFT + T1–T4               | Mute or unmute the track                                                                                        |
| PADS/KEYS                   | Switch the current track's pad mode, when you let go                                                            |
| ROLL                        | Show that screen                                                                                                |
| MENU held + step _n_        | Show screen _n_                                                                                                 |
| PAGE held + step _n_        | Show page _n_ of the current screen                                                                             |
| Arrows                      | Move the cursor; in pickers, up and down a row, left and right a page; on STEP and ROLL, Workflow B's           |
| OK                          | Use the item under the cursor; in a picker, choose; in a question, yes                                          |
| CANCEL                      | Back out: close a picker, go up a folder; in a question, no; on STEP and ROLL, Workflow B's                     |
| − and +                     | Change the value under the cursor by one click; in a picker, move one row                                       |
| SHIFT + − or +              | The same, 16 times finer for smooth values                                                                      |
| PADS/KEYS held + up or down | Octave up or down, in KEYS mode                                                                                 |
| SHIFT + up or down          | On STEP and ROLL, Workflow B's                                                                                  |
| Encoders 1–4, turn          | Change the items they hold on the page, shown in the strip; nothing in a picker or a question                   |
| SHIFT + encoder turn        | The same, 16 times finer for smooth values                                                                      |
| Encoder press               | OK on the item it holds; nothing in a picker or a question                                                      |
| Volume encoder              | Output volume                                                                                                   |
| Pads                        | PADS mode: play and select; KEYS mode: play the selected sound; under a held step, CANCEL or COPY, Workflow B's |
| Step buttons                | Workflow B's, unless MENU or PAGE is held                                                                       |
| REC, PLAY, STOP, TEMPO      | Workflow B's                                                                                                    |

Workflow B uses SHIFT + left or right to jump a page, SHIFT + CANCEL to undo, SHIFT + step to switch
patterns and SHIFT + COPY to paste. SHIFT + OK, SHIFT + pad and SHIFT + encoder press stay free:
SHIFT + OK and SHIFT + an encoder press do nothing, and a pad hit with SHIFT held plays like any
other, since pads always play (Workflow B).

A button that also does something while held acts as a tap only when you let go, and only if the
press was short and no other control was used meanwhile: CANCEL, COPY, TEMPO, PADS/KEYS and the step
buttons (Workflow B).

**When a combination acts (owner's choice).**

- A combination acts when its second control goes down. That control's release does nothing.
- Letting go of the modifier only ends it: MENU and PAGE hide their tiles, PADS/KEYS does not switch
  the mode and SHIFT does nothing.
- The combination repeats while the modifier stays down. An arrow under PADS/KEYS does not repeat.
- PADS/KEYS + up or down in PADS mode does nothing, but still counts as another control used.

**Other controls under MENU or PAGE (owner's choice).**

- Steps switch to their screen or page. A dark step does nothing, and neither does its release.
- Pads play and select. T1–T4, SHIFT + T1–T4, PLAY, STOP, REC, TEMPO and the volume act as usual.
- The arrows, OK, CANCEL, − and +, encoders 1–4 (turn and push), ROLL, PADS/KEYS and COPY are
  dropped, press and release alike.
- Of MENU and PAGE the first one pressed counts; the other works only after its own release and a
  new press.
- A screen without pages shows 16 empty tiles under PAGE with no step lit, and every step does
  nothing. A screen with one page shows one tile.

While a picker or a question is open, only the arrows, OK, CANCEL, − and +, the pads, PLAY, STOP,
REC, SHIFT + T1–T4 and the volume encoder do anything, and the pads do not select; see "Pickers and
questions".

## Testing

On top of Foundation's testing:

- **Ordinary tests** for every action and rule: what each track remembers, page memory, which items
  each encoder holds on every page and the empty strip on lists, in pickers and in questions, pages
  scrolling, the cursor and its repeats, OK, CANCEL, − and +, questions, values stopping at their
  ends, fine steps, pickers opening and closing, the preview following the highlight in the sample
  picker and stopping on OK, CANCEL and a folder row, COPY and the count of pads using a sound,
  moving effect slots, mutes, octave limits, autosave requests. A picker or a question open while
  playing: pads sound and do not select, PLAY, STOP and REC work, MENU does nothing. Hitting an
  empty pad: it is selected, SOUND shows only the PAD page with EMPTY, the step buttons do nothing.
- **Drift scenes** that drive the panel only: from an empty project, NEW SYNTH on a pad, NEW SAMPLE
  through the sample picker, page changes, effect types and slot moves, mutes, the volume encoder
  and octave shifts, with frames captured at fixed points.
- **The screen gallery** shows every screen, the MENU tiles, the page tabs and every picker in fixed
  states.

## Changes to the part 1 overview

Applied to the overview together with this spec:

- The Workflow A part of the decision register points to this spec; its open questions are answered
  here. The earlier idea of making sounds on the sound list is replaced: sounds are made from the
  pad, and POOL is for overview and housekeeping.
- The Look part of the register gains the new controls: MENU, PAGE, OK, CANCEL, − and +, push
  switches on the four encoders and a fifth encoder for the volume.
- The Workflow B part gains: copy and paste of bars, patterns and notes; undo weighing more under
  autosave; recording and editing pressure; what the step buttons do on each screen; screens 9–16.
- The Project model part gains: pressure curves in the note store; autosave and the project list;
  the device settings so far (volume and the VELOCITY switch).
- Milestone 5 becomes autosave, NEW, OPEN and COPY.
- Typing names for sounds and projects joins the non-goals.
- The glossary gains screen, page, strip, cursor, picker, selected sound and output volume.

## Assumptions about other specs

- **Foundation:** the master-list entry gains a click size for smooth parameters. The abstract
  controls gain "pad _n_ released" (already implied by gate notes) and "pad _n_ pressure _p_"; the
  push switches are buttons, and the volume knob is a fifth encoder. Device settings (volume,
  VELOCITY) are kept apart from the project. Autosave and the project list use storage requests.
  These changes are applied to Foundation in the consistency pass.
- **Sound:** the master path gains the output volume after the soft clipper. The PAD page comes
  before the starting pages, which keep their order and each hold a whole group. Engines and effect
  types supply their page, its items' names and which items the encoders hold through their
  descriptions. Sample import gives each file a length and size that the sample picker, POOL and
  SAMPLES show; the preview player beside the voices plays the highlighted file from RAM. Moving a
  slot swaps the two slots' settings and memory together in one step.
- **Workflow B:** decides what STEP and ROLL show, how their cursor works, and what the arrows, −
  and +, the step buttons and the free SHIFT combinations do there and on other screens; copy and
  paste of bars, patterns and notes; undo; how pressure is recorded and edited, and what velocity
  and pressure a note entered by step gets; whether it needs screens 9–16. It keeps the selected
  sound as the target of step entry.
- **Project model:** stores the pool, each track's pad mapping and the notes with their pressure
  curves; decides whether each track's selected sound, pad mode and octave, and each screen's page,
  are saved with the project; decides what happens to the notes and pads of a deleted sound; keeps
  device settings apart from projects; supports autosave and the project list with automatic names;
  keeps the library in RAM and gives the library meter its number.
- **Look:** places MENU, PAGE, OK, CANCEL, − and + and the volume encoder and draws the push
  switches; draws the header, the strip, empty where the encoders hold nothing, the cursor, the MENU
  tiles, the page tabs, the pickers with the library meter, the questions and every screen, with
  pages that scroll and a mark on the items the encoders hold; maps mouse, keyboard and MIDI to
  controls, including velocity and aftertouch; marks muted tracks on their buttons.

## Research sources

- **EP-133 K.O. II:** [workflow](https://teenage.engineering/guides/ep-133/workflow) (projects);
  [modes](https://teenage.engineering/guides/ep-133/modes) (switching projects, saving sound edits);
  [play and record](https://teenage.engineering/guides/ep-133/play-and-record) (copy and paste,
  erase and undo).
