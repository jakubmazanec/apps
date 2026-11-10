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
  pad of the track **(owner's choice)**. There is then no selected pad.
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
- **A question,** such as "DELETE KICK?", is answered only with OK or CANCEL. The encoders, − and +
  do nothing there and the strip is empty, so a stray press cannot confirm a delete.
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
  parameter. Values stop at the ends of their range and never wrap round.
- **SHIFT + turn (owner's choice)** moves smooth values 16 times finer. Counted values still move
  one unit.
- **Press is OK on the encoder's item (owner's choice).** It opens the item's picker, flips a switch
  or runs an action such as COPY. On a smooth parameter it does nothing.
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
- **Item 3: ENGINE (owner's choice),** SAMPLE or SYNTH. OK opens a picker; turning or − and + do
  nothing, so a stray turn cannot reset a sound's engine.
  - Changing it keeps the shared chain (filter, envelopes, level and pan, tuning, voice) and starts
    the new engine at its defaults. Switching to SAMPLE opens the sample picker straight away.
  - If the new engine does not allow the current play mode, the sound takes that engine's default.
  - Switching back does not restore the old engine's settings; a sound holds one engine's settings.
- Encoder 4 holds nothing, so its strip cell is empty.
- When the sound was selected on POOL, there is no selected pad and the page shows only ENGINE,
  still on encoder 3.
- **An empty pad (owner's choice).** While the selected pad is empty there is no selected sound.
  SOUND shows only the PAD page, and the page only item 1, which reads EMPTY; OK on it opens the
  sound picker as above. COPY and ENGINE are not shown, and encoders 2 and 3 hold nothing. SOUND's
  other five pages are empty and so are their strips, like the page of an empty effect slot. Until
  the pad has a sound, the step buttons are dark and do nothing, the strip under STEP and ROLL is
  empty and KEYS mode plays nothing.

Rejected: keeping the previously selected sound under the encoders and the step buttons while an
empty pad is selected. The PAD page would show one pad while the rest of SOUND and the step buttons
edited another pad's sound.

### Making sounds

- New projects start empty: no sounds, no samples, every pad empty.
- **NEW SYNTH** puts a virtual-analog sound with default settings on the pad.
- **NEW SAMPLE** opens the sample picker; choosing a sample puts a sample sound on the pad.
- **A pool sound** chosen in the picker goes on the pad as the same sound, shared with every other
  pad that uses it.
- **EMPTY** clears the pad.
- **Names are automatic (owner's choice):** a sample sound takes the file's name, synth sounds are
  SYN 1, SYN 2 and so on, and a copy takes the next number (KICK 2). Typing names comes later.

### Two ways to change what a pad plays

Each note stores which sound it plays, so:

- **Changing the sample,** with the sample parameter on the sample engine's page, changes the sound
  itself. Every pad and every note that uses the sound hears the new sample. Every other setting
  stays; only the start, end, loop points and root note come from the new file. This is how a kick
  is swapped for a better one.
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

- Lists the library by folder, each file with its length and its size, and shows the library meter
  at the top: how full the library is, the same number as on POOL and SAMPLES.
- Every file can be chosen. The whole library is in RAM (Foundation), so picking loads nothing and
  nothing is ever "no room" here; the only refusal is at import (Sound).
- **The highlighted sample plays once (owner's choice),** from RAM through Sound's preview player
  beside the 32 voices: dry, at a fixed level, after the tracks and before the soft clipper, so it
  never takes a voice from the music. Moving the highlight stops it and starts the new file's; a
  folder row plays nothing; OK or CANCEL stops it; STOP while stopped silences it too (Workflow B).
  Previewing while the music plays is allowed.
- The sample engine's sample parameter opens the same picker.

Rejected: a memory cost per file, the time left in a budget and a "no room" mark, the first design.
They belonged to the per-project budget, which Foundation replaced with one library in RAM.

### POOL

- Lists every sound with its engine, the pads it sits on and its sample's size, above the library
  meter, the same number as on SAMPLES and in the picker **(owner's choice)**. The list's first
  entry is REMOVE UNUSED.
- A sound whose sample is not in the library is marked MISSING, with the file's name. It plays
  silence until its sample parameter picks a file (Project model).
- Highlighting a sound selects it (see "Selection").
- **OK on a sound** opens a picker with DELETE, which removes it. **OK on REMOVE UNUSED** removes
  every sound that no pad and no note uses. Both ask a question first; DELETE's counts the pads and
  notes that use the sound, such as "DELETE KICK? ON 2 PADS, 24 NOTES". Both tidy the pool only: a
  sample stays in the library, and in RAM, until it is deleted on the SAMPLES screen (Project
  model), so neither frees sample RAM **(owner's choice)**.
- POOL is a list, so the encoders hold nothing and the strip is empty. DELETE is reached only
  through the sound's picker, REMOVE UNUSED only as the list's first entry.
- Deleting a sound that is in use removes its notes and empties its pads too. A sound is used when
  it is on any pad of any track or played by any note of any pattern (Project model).

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

- **Page 1, CHAIN (owner's choice),** has two rows: the six slots in chain order, and TYPE and MOVE
  for the slot the cursor last stood on. Encoders 1 and 2 hold TYPE and MOVE, so the strip shows
  them; encoders 3 and 4 hold nothing. Left and right move along a row; up and down switch rows.
  - **TYPE** (encoder 1): OK on a slot or on TYPE opens a picker with EMPTY, DELAY and REVERB.
    Choosing a new type clears the slot, as Sound decided, and starts the effect at its defaults;
    the old settings are gone.
  - **MOVE** (encoder 2) is a value: each click of the encoder, or each press of − or +, moves the
    slot one place along the chain. A moved effect keeps its settings and its sound, so a ringing
    tail does not break. The two slots swap their settings and memory together in one step (Sound).
- **Pages 2–7** are the slots in chain order, each holding all of its effect's settings: five for
  the delay, four for the reverb. The effect names which of them the encoders hold (Sound). An empty
  slot's page is empty, and so is its strip.
- Holding PAGE on FX shows the tabs CHAIN, then each slot's type, such as DELAY, REVERB and four
  dashes.

Rejected: slot pages only, with the type as the first item of each slot's page. The chain has no
overview, and moving a slot needs a hidden gesture.

## Mix and volume

- **Mute (owner's choice).** SHIFT + T1–T4 flips that track's mute from any screen. Muted tracks are
  marked on their track buttons and in the header. Muting lets tails ring out (Sound). Pads and keys
  you play on a muted track still sound and are recorded as usual; only the pattern is silenced
  **(owner's choice)**.
- **MIX screen,** one page **(owner's choice)**: the four track levels, then Sound's master level,
  the mix's own setting before the soft clipper, saved with the project. The encoders hold the four
  track levels; the master level is reached with the cursor. Each track shows whether it is muted.
  Mutes are shown on MIX but flipped only with SHIFT + T.
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

Workflow B uses SHIFT + left or right to jump a bar, SHIFT + CANCEL to undo, SHIFT + step to switch
patterns and SHIFT + COPY to paste. SHIFT + OK, SHIFT + pad and SHIFT + encoder press stay free.

A button that also does something while held acts as a tap only when you let go, and only if the
press was short and no other control was used meanwhile: CANCEL, COPY, TEMPO, PADS/KEYS and the step
buttons (Workflow B).

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
