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
and how you move between them, how every parameter is reached with the encoders, how sounds are made
and put on pads, the effect slots, the mix and the volume, octave shift, projects, velocity and
pressure, and the actions and bindings behind all of it.

It does not decide transport, tempo, step entry, recording, patterns or what the STEP and ROLL
screens show (Workflow B); how screens are drawn, where controls sit on the panel or how mouse,
keyboard and MIDI map to controls (Look); or how any of it is stored (Project model). "Assumptions
about other specs" lists what this spec expects from them.

## Principles

**(owner's choice)**

- **Two routes, both shallow.** Buttons cover what you do while playing. The screens reach
  everything, including what also has a button.
- **No menu diving.** Every screen is two presses away from anywhere. A screen never opens another
  screen; the only second levels are a picker and a question, which close once you have answered.
- **The screen is the interface; the encoders are shortcuts.** Everything on a screen can be reached
  with the arrows and used with OK and CANCEL, and values change with − and +. The encoders are
  shortcuts for the four items in the strip.
- **No value is ever confirmed.** Turning an encoder or pressing − or + changes a value at once.

## Decisions at a glance

The sections below mark which points the owner chose.

| Topic         | Decision                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Selection     | Hitting a pad in PADS mode selects its sound; each track remembers its sound, pad mode and octave                               |
| KEYS mode     | Plays the selected sound; to change it, go back through PADS                                                                    |
| Screens       | STEP, ROLL, SOUND, FX, MIX, POOL, PROJECT and SETTINGS; MENU + step jumps to any of them                                        |
| Strip         | The encoders always edit the four parameters in the strip; under STEP and ROLL it is the selected sound                         |
| Pages         | PAGE + step picks a page, on every screen                                                                                       |
| Cursor        | The arrows move a cursor over everything on the screen; OK uses, CANCEL backs out, − and + change values                        |
| Encoders      | Shortcuts for the strip: a turn changes an item, a press is OK on it; push switches; fixed steps; SHIFT is finer                |
| Making sounds | From the pad: the PAD page's picker offers NEW SAMPLE, NEW SYNTH and the pool; ENGINE switches a sound between sample and synth |
| Variants      | COPY on the PAD page gives the pad its own copy of a shared sound                                                               |
| Names         | Automatic in part 1                                                                                                             |
| Sample picker | The highlighted sample plays                                                                                                    |
| POOL          | Overview and housekeeping; highlighting a sound selects it                                                                      |
| Effects       | A CHAIN page plus one page per slot                                                                                             |
| Mute          | SHIFT + T1–T4, from any screen                                                                                                  |
| Volume        | A dedicated fifth encoder: output volume after the soft clipper, a device setting                                               |
| Octave        | SHIFT + up or down in KEYS mode                                                                                                 |
| Projects      | Autosave, like the EP-133; NEW, OPEN, COPY and DELETE on PROJECT                                                                |
| Copying       | Projects on PROJECT; bars, patterns and notes are Workflow B's                                                                  |
| Velocity      | One switch: from how the pads are hit, or none                                                                                  |
| Pressure      | Stored in notes from part 1                                                                                                     |

## Controls

Panel D, with these changes:

- **Function buttons:** panel D's 16, unchanged: T1–T4; STEP, ROLL, PADS/KEYS, SHIFT; REC, PLAY,
  STOP, TEMPO; and four arrows.
- **MENU and PAGE,** two new buttons.
- **OK, CANCEL, − and + (owner's choice),** four new buttons next to the arrows. With MENU and PAGE
  there are 22 function buttons.
- **Four encoders with push switches (owner's choice).** The core sees each push switch as a button.
- **A fifth encoder for the volume (owner's choice),** without a push switch.
- **16 step buttons and 12 pads,** unchanged.

Where the new controls sit on the panel is the Look spec's job.

## Selection

- **Tracks.** T1–T4 select the current track. Each track remembers its own selected sound, its own
  pad mode and its own octave **(owner's choice)**.
- **PADS mode.** Hitting a pad plays its sound and selects both the pad and the sound **(owner's
  choice)**. Notes the sequencer plays never change the selection.
- **KEYS mode.** The pads play the selected sound chromatically. To play another sound, go back to
  PADS, hit its pad and switch to KEYS again **(owner's choice)**.
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
| 6           | POOL     | Every sound of the project, and the sample memory              |
| 7           | PROJECT  | The projects: NEW, OPEN, COPY and DELETE                       |
| 8           | SETTINGS | Device settings                                                |
| 9–16        |          | Free; Workflow B may add screens such as pattern settings here |

### Moving between them

- **MENU + step (owner's choice).** Hold MENU and the screen shows every screen as a numbered tile;
  press a step button to jump to that screen. Letting go of MENU without pressing a step does
  nothing.
- **Direct buttons.** STEP and ROLL keep their own buttons. No other screen gets one in part 1;
  giving one a button later is a small code change.
- **No hierarchy.** A screen never opens another screen. The only second levels are a picker, opened
  from an item and closed once you have picked, and a question, answered with OK or CANCEL.

### What every screen shows

- **A header:** track, sound, pad mode and octave, tempo, transport position, a recording indicator,
  muted tracks, and the name of the current screen and page.
- **A main area:** the screen's own content.
- **The parameter strip:** the four parameters the encoders edit. On STEP and ROLL it shows a page
  of the selected sound, whichever page was last open on SOUND, so you shape the sound while
  watching the pattern **(owner's choice)**. On FX and MIX it shows their own parameters.

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
- **CANCEL** backs out: it closes a picker, goes up a folder or answers "no" to a question.
- **− and +** change the value under the cursor by one click, at once. SHIFT + − or + moves 16 times
  finer, and holding repeats. They do exactly what one click of the item's encoder does, so on an
  item that opens a picker they do nothing.
- **The encoders are shortcuts for the strip.** Turning encoder _n_ changes strip item _n_; pressing
  it is OK on that item. Using an encoder moves the cursor to its item, so you see what you are
  changing.

### Pickers and questions

- **A picker** is the only thing on the screen while it is open, so the controls act on it: the
  arrows, − and + and turning encoder 1 move the highlight; OK or pressing encoder 1 chooses; CANCEL
  backs out. Encoders 2 to 4 do nothing. See "Sounds and pads" for the details.
- **A question,** such as "DELETE KICK?", is answered only with OK or CANCEL. The encoders, − and +
  do nothing there, so a stray press cannot confirm a delete.

### STEP and ROLL

The cursor on STEP and ROLL is Workflow B's, and so is what the arrows and − and + do there. The
strip there is a shortcut to the SOUND screen's current page, whose screen route is the SOUND screen
itself.

### Alternatives rejected

- **Encoders that move through lists and confirm,** with no OK and CANCEL: the owner wants the
  encoders for changing values, and confirming a delete by pressing the same encoder twice is
  fragile.
- **No push switches,** with OK doing everything: OK alone cannot tell which strip item is meant, so
  actions such as COPY would turn into picker entries.
- **Changing values without an encoder through an edit mode,** or by holding OK and pressing arrows:
  − and + are simpler and need no mode.
- **Encoders doing nothing in pickers:** inconsistent, since the highlight is the value being
  chosen.

## Pages and encoders

### Pages

- **PAGE + step (owner's choice).** Hold PAGE and the screen draws the current screen's page tabs;
  press step _n_ to go to page _n_. This works on every screen, STEP and ROLL included.
- **Page memory.** Each screen remembers its page. The strip under STEP and ROLL is the SOUND
  screen's page, so PAGE + step there changes SOUND's page.
- **SOUND's pages,** from the Sound spec's starting pages, with the PAD page first:

  | PAGE + step | Page                                    |
  | ----------- | --------------------------------------- |
  | 1           | PAD (see "Sounds and pads")             |
  | 2–3         | engine (different for sample and synth) |
  | 4–5         | filter                                  |
  | 6           | filter envelope                         |
  | 7–8         | volume envelope                         |
  | 9–10        | voice                                   |

  A page with fewer than four parameters leaves an encoder empty.

### Encoders

- **Turning moves in fixed steps (owner's choice).** Counted values (semitones, choke groups, named
  choices) move one unit per click. Smooth values move by the parameter's click size, a new field in
  Foundation's master-list entry: 128 clicks across the range by default, tuned by ear per
  parameter. Values stop at the ends of their range and never wrap round.
- **SHIFT + turn (owner's choice)** moves smooth values 16 times finer. Counted values still move
  one unit.
- **Press is OK on the strip item (owner's choice).** It opens the item's picker, flips a switch or
  runs an action such as COPY. On a smooth parameter it does nothing.
- **− and +** move a value by the same steps as one click.
- There is no acceleration, so the same turn always changes a value by the same amount, and nothing
  depends on how fast the encoder was turned.

### Alternatives rejected

- **Step buttons picking pages on SOUND, FX and MIX, with SHIFT + left/right elsewhere.** One press
  on SOUND, but two different mechanisms.
- **Left and right always flipping pages.** Simplest to explain, but it takes the arrows from STEP
  and ROLL, and page 9 is eight presses away.
- **Accelerated encoders, and press-and-turn for fine or coarse steps.** The owner wants a fixed
  feel, and the press for acting on parameters.

## Sounds and pads

### The PAD page

SOUND's first page works on the selected pad of the current track. Sounds are made and put on pads
from here **(owner's choice)**. Its items, each also on its encoder:

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
- **Item 4** is empty.
- When the sound was selected on POOL, there is no selected pad and the page shows only ENGINE.

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

- Up and down move one row; left and right jump a page. Turning encoder 1 or pressing − or + also
  moves one row **(owner's choice)**.
- OK, or pressing encoder 1, chooses the highlighted entry or enters a folder **(owner's choice)**.
  Encoders 2 to 4 do nothing while a picker is open.
- CANCEL goes up a folder, or closes the picker without choosing at the top level.
- NEW SAMPLE replaces the sound picker with the sample picker, so it stays one level deep.

### The sample picker

- Lists the samples in storage by folder, each with its length and its memory cost, and shows the
  time left in the sample budget.
- A sample that does not fit the budget is marked and cannot be chosen (Foundation).
- **The highlighted sample plays once (owner's choice),** dry and at a fixed level, straight to the
  master. Moving on stops it.
- The sample engine's sample parameter opens the same picker.

### POOL

- Lists every sound with its engine, the pads it sits on and its sample cost, above the sample
  memory meter. The list's first entry is REMOVE UNUSED.
- Highlighting a sound selects it (see "Selection").
- **OK on a sound** opens a picker with DELETE, which removes it. **OK on REMOVE UNUSED** removes
  every sound that no pad and no note uses. Both ask a question first, such as "DELETE KICK?".
- The strip has DELETE, for the highlighted sound, and REMOVE UNUSED as shortcuts.
- What happens to the notes and pads of a deleted sound that is in use is the Project model's
  question.

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

- **Page 1, CHAIN (owner's choice),** has two rows: the six slots in chain order, and the strip's
  TYPE and MOVE for the slot the cursor last stood on. Left and right move along a row; up and down
  switch rows.
  - **TYPE** (encoder 1): OK on a slot or on TYPE opens a picker with EMPTY, DELAY and REVERB.
    Choosing a new type clears the slot, as Sound decided, and starts the effect at its defaults;
    the old settings are gone.
  - **MOVE** (encoder 2) is a value: each click of the encoder, or each press of − or +, moves the
    slot one place along the chain. A moved effect keeps its settings and its sound, so a ringing
    tail does not break.
- **Pages 2–7** are the slots in chain order, each with its effect's four parameters. An empty
  slot's page is empty.
- Holding PAGE on FX shows the tabs CHAIN, then each slot's type, such as DELAY, REVERB and four
  dashes.

Rejected: slot pages only, with the type on encoder 1. Only three of an effect's parameters fit, so
effects need two pages each, and moving a slot needs a hidden gesture.

## Mix and volume

- **Mute (owner's choice).** SHIFT + T1–T4 flips that track's mute from any screen. Muted tracks are
  marked on their track buttons and in the header. Muting lets tails ring out (Sound).
- **MIX screen.**
  - Page 1: the four track levels on the four encoders. The main area shows each track's level and
    whether it is muted.
  - Page 2: Sound's master level, the mix's own setting before the soft clipper, saved with the
    project.
  - Mutes are shown on MIX but flipped only with SHIFT + T.
- **Volume (owner's choice).** A fifth encoder always sets the output volume, on every screen; pages
  never change it.
  - It is applied after the soft clipper, inside the core, so it never changes the sound's character
    and is part of the bit-identical output and the drift tests.
  - It is a device setting, not saved with projects, so loading a project never changes how loud you
    listen.
  - It has no push function.

Rejected: muting only on MIX (a screen change before every live mute) and a MUTE button (another new
button). Rejected for volume: the master level itself on the knob, which pushes into the clipper and
brings each project's own loudness back on load.

## Octave and projects

### Octave

- **SHIFT + up or down (owner's choice)** moves the pads one octave in KEYS mode. Pad 1 is always C.
- The header shows the octave (KEYS C4). Each track remembers its own.
- It starts at C4, the default root note of samples, so pad 1 plays a sample unchanged. The range is
  C0 to C8.
- In PADS mode, SHIFT + up or down does nothing.

### Projects

- **Autosave (owner's choice).** The open project saves itself shortly after every change; there is
  no SAVE. Starting up opens the last project, or a new empty one the first time.
- **PROJECT screen.** The list starts with NEW, then the projects, with the open one marked.
  - **OK on NEW** makes a new, empty project and opens it.
  - **OK on a project** opens a picker with OPEN, COPY and DELETE.
  - **COPY** keeps a copy of the highlighted project; you carry on in the project you have open.
  - **DELETE** asks a question first. The open project cannot be deleted.
  - The strip has NEW, COPY and DELETE as shortcuts, working on the highlighted project.
- **Names are automatic:** PROJECT 1, PROJECT 2, and a copy takes the next number.
- Projects refer to sample files (Foundation), so a copy shares the samples instead of duplicating
  them.

### Copying

- **Bars, patterns and a pad's notes** are copied often while composing and need a fast gesture.
  They are Workflow B's objects, so Workflow B designs their copy and paste, gesture included
  **(owner's choice)**.
- **Projects** are copied rarely and on purpose: menu only, with COPY on PROJECT and no clipboard
  **(owner's choice)**.
- **Sounds** need no clipboard: the sound picker shares a sound, and COPY on the PAD page makes it
  the pad's own.
- **Effect slots** are not copied in part 1.

Autosave saves a mistake the moment it is made, which makes undo more important; undo is Workflow
B's open question.

## Velocity and pressure

- **VELOCITY switch (owner's choice),** a device setting on the SETTINGS screen, its only setting in
  part 1.
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

| Control                | Action                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| T1–T4                  | Select the track                                                                                      |
| SHIFT + T1–T4          | Mute or unmute the track                                                                              |
| PADS/KEYS              | Switch the current track's pad mode                                                                   |
| STEP, ROLL             | Show that screen                                                                                      |
| MENU held + step _n_   | Show screen _n_                                                                                       |
| PAGE held + step _n_   | Show page _n_ of the current screen                                                                   |
| Arrows                 | Move the cursor; in pickers, up and down a row, left and right a page; on STEP and ROLL, Workflow B's |
| OK                     | Use the item under the cursor; in a picker, choose; in a question, yes                                |
| CANCEL                 | Back out: close a picker, go up a folder; in a question, no                                           |
| − and +                | Change the value under the cursor by one click; in a picker, move one row                             |
| SHIFT + − or +         | The same, 16 times finer for smooth values                                                            |
| SHIFT + up or down     | Octave down or up, in KEYS mode                                                                       |
| Encoders 1–4, turn     | Change the strip's four items; in a picker, encoder 1 moves one row                                   |
| SHIFT + encoder turn   | The same, 16 times finer for smooth values                                                            |
| Encoder press          | OK on that strip item; in a picker, encoder 1 chooses                                                 |
| Volume encoder         | Output volume                                                                                         |
| Pads                   | PADS mode: play and select; KEYS mode: play the selected sound                                        |
| Step buttons           | Workflow B's, unless MENU or PAGE is held                                                             |
| REC, PLAY, STOP, TEMPO | Workflow B's                                                                                          |

SHIFT + left or right, SHIFT + OK, SHIFT + CANCEL, SHIFT + step, SHIFT + pad and SHIFT + encoder
press are left free for Workflow B.

## Testing

On top of Foundation's testing:

- **Ordinary tests** for every action and rule: what each track remembers, page memory, the cursor
  and its repeats, OK, CANCEL, − and +, questions, values stopping at their ends, fine steps,
  pickers opening and closing, COPY and the count of pads using a sound, moving effect slots, mutes,
  octave limits, autosave requests.
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
  before the starting pages, which keep their order. Engines and effect types supply their pages and
  parameter names through their descriptions. Sample import gives each file a length and memory cost
  that the sample picker can show before loading.
- **Workflow B:** decides what STEP and ROLL show, how their cursor works, and what the arrows, −
  and +, the step buttons and the free SHIFT combinations do there and on other screens; copy and
  paste of bars, patterns and notes; undo; how pressure is recorded and edited, and what velocity
  and pressure a note entered by step gets; whether it needs screens 9–16. It keeps the selected
  sound as the target of step entry.
- **Project model:** stores the pool, each track's pad mapping and the notes with their pressure
  curves; decides whether each track's selected sound, pad mode and octave, and each screen's page,
  are saved with the project; decides what happens to the notes and pads of a deleted sound; keeps
  device settings apart from projects; supports autosave and the project list with automatic names.
- **Look:** places MENU, PAGE, OK, CANCEL, − and + and the volume encoder and draws the push
  switches; draws the header, the strip, the cursor, the MENU tiles, the page tabs, the pickers, the
  questions and every screen; maps mouse, keyboard and MIDI to controls, including velocity and
  aftertouch; marks muted tracks on their buttons.

## Research sources

- **EP-133 K.O. II:** [workflow](https://teenage.engineering/guides/ep-133/workflow) (projects);
  [modes](https://teenage.engineering/guides/ep-133/modes) (switching projects, saving sound edits);
  [play and record](https://teenage.engineering/guides/ep-133/play-and-record) (copy and paste,
  erase and undo).
