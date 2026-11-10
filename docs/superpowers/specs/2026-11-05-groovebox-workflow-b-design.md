# Groovebox part 1 – Workflow B: sequencing and patterns

Status: design, approved by the owner. The fourth of six subpart specs of part 1; see
[the part 1 overview](./2026-10-26-groovebox-core-browser-design.md) for the intent, the goals and
the decision register, [Foundation](./2026-11-02-groovebox-foundation-design.md) for the ground
rules, [Sound](./2026-11-03-groovebox-sound-design.md) for the engines and effects, and
[Workflow A](./2026-11-03-groovebox-workflow-a-design.md) for the controls, screens and selection
this spec builds on.

**Nothing here is final.** The owner is not yet sure how patterns should work, and the workflow is
what part 1 exists to find out. This spec records the starting point. Bindings, pages and screens
are code, changed by editing code (Foundation).

Every section of this spec was presented to the owner and approved. Points where the owner chose
between options or proposed the design are marked **(owner's choice)**. Details settled while
writing the spec, which the owner has not confirmed, are marked **(my call)**.

## What Workflow B decides

How patterns are made and played: what belongs to a pattern and what to the project, bars, time
signatures and the grid, transport and tempo, the metronome and the count-in, what the STEP and ROLL
screens show and how their cursor works, entering and editing notes, live recording, undo, erasing,
clearing and copying, switching patterns, the PATTERN screen, and the actions and bindings behind
all of it. It also lists what comes after the first version.

It does not decide how screens are drawn or where controls sit on the panel (Look), or how patterns
and notes are stored (Project model). It changes a few of Workflow A's decisions; "Changes to
Workflow A" lists them. "Assumptions about other specs" lists what this spec expects from the
others.

## Principles

**(owner's choice)**

- **The step buttons are always one bar.** Each button is a sixteenth, and every bar starts on
  button 1.
- **One grid** decides where entered notes land and what recording snaps to, as the EP-133's note
  interval does.
- **STEP and ROLL work the same.** Only their rows differ: sounds on STEP, pitches on ROLL.
- **Everything acts on the selected sound,** on STEP and ROLL as on the step buttons.
- **The strip only shows what the encoders do,** and nothing else; it is empty where they hold
  nothing. The cursor never goes there, and every strip has a screen route somewhere else.
- **CANCEL removes and COPY copies.** A tap acts on the cursor's cell or bar; held with a pad or a
  track button, they act on that sound or track.
- **Big deletions ask, small ones don't,** and one level of undo catches the rest.
- **A button that also does something when held acts when you let go.** Every other button acts when
  pressed.

## Decisions at a glance

The sections below mark which points the owner chose.

| Topic          | Decision                                                                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| Version 1      | One shared length and a fixed loop; many features come later (see "Scope")                               |
| Pattern        | Its notes and its length; everything else belongs to the project                                         |
| Patterns       | Unlimited; 1–16 always exist and switch with SHIFT + step; a switch waits for the end of the pattern     |
| Time signature | 1 to 16 over 4 or 8, per project; a pattern is a whole number of bars                                    |
| Step buttons   | One bar of sixteenths for the selected sound; a long bar continues on a short second page                |
| Grid           | One setting for step entry, quantize and later note repeat and the arpeggiator; 1/16 in version 1        |
| Tempo          | Per project, 30 to 300 BPM; holding TEMPO shows the timing strip, a tap turns the metronome on or off    |
| STEP and ROLL  | One scrolling view at a fixed scale; rows are sounds on STEP and pitches on ROLL                         |
| Cursor         | A cell; OK adds a note or opens the NOTE panel, CANCEL removes                                           |
| Editing        | Hold a step for the NOTE strip: pitch, velocity, length and position                                     |
| Recording      | REC drops in and out while playing and arms when stopped; overdub; quantize to the nearest grid position |
| Undo           | One level of undo and redo with SHIFT + CANCEL                                                           |
| Erasing        | CANCEL held with a pad or a track button                                                                 |
| Copying        | A new COPY button; SHIFT + COPY pastes; whole patterns only on the PATTERN screen                        |
| PATTERN screen | MENU + 9: timing, bars and the pattern list                                                              |
| Buttons        | A button with a hold function acts when you let go; the others when pressed                              |

## Scope

### Version 1

- One length shared by the four tracks, and a fixed loop: the length is set by hand and recording
  wraps round at the end **(owner's choice)**.
- Everything else in this spec.

### Later

**(owner's choice)** Each of these comes after version 1. Version 1 builds none of them, but nothing
in it may get in their way.

- **Per-track lengths** (polymeter), as a setting.
- **Growing while recording,** as a setting that chooses between growing and a fixed loop. When a
  pattern grows and how growing ends is designed with it.
- **Swing,** a must. It is applied as the pattern plays and never written into notes.
- **Step extras:** probability or conditions, ratchets and micro-timing.
- **When a pattern switch happens:** at once or at the end of the pattern, as a choice.
- **Scales and chords** in KEYS mode.
- **A changeable grid** from 1/1 to 1/64, triplets included. Whether it belongs to the project or to
  each track is decided then.
- **Note repeat and an arpeggiator,** at the grid's rate.
- **Automation:** knob movements recorded into the pattern; see "Automation, later".
- **Randomization** of note values, applied as the pattern plays as deviations from the stored note.
  It takes its randomness from seeds (Foundation), so it plays the same every time, and it is never
  written back. The quantized notes are its starting point.
- **Hidden notes and CROP:** keeping notes that a shorter bar or pattern no longer plays; see
  "Changing the signature or the length".
- **Time signatures per pattern.**
- **Editing pressure,** once modulation makes it audible.
- **More than one level of undo.**

### Not doing

**(owner's choice)**

- **Quantizing on playback** while keeping the played timing. Notes are stored quantized.
- **Per-step parameter locks** in the Elektron style.
- **Pad mappings per pattern.** They belong to the project.

### Automation, later

Recorded knob movements would be stored in the pattern next to its notes, wherever the parameter's
home value lives. While the pattern plays they set the value through Foundation's single
parameter-read step; where the pattern has none, the home value applies, and automation never
changes the home value. Tempo automation is a series of tempo jumps, which Foundation's time maths
already handles. A lane on a shared sound moves that sound on every track that plays it. Which
parameters can be automated, how lanes are shown and cleared, what turning a knob does while its
lane plays and what a pattern switch does to an automated value are designed with it.

## Patterns and the project

**(owner's choice)**

- **A pattern** holds its notes and its length, nothing else.
- **The project** holds everything else: the pool, the pad mappings, the tempo, the time signature,
  the track effects, the track levels and mutes, and the master level. The four tracks behave like
  the channels of a mixer that stays the same whatever pattern plays, so switching patterns keeps
  the tempo, the mix and any echoes or reverb that are ringing.
- **Patterns are unlimited,** bounded only by memory. Patterns 1 to 16 always exist, empty to begin
  with, which costs almost nothing; they are the ones SHIFT + step reaches. NEW on the PATTERN
  screen adds 17, 18 and so on.
- **The time signature** belongs to the project, but the code always reads it as "this pattern's
  signature". Moving it to the pattern later is then a lossless migration: each pattern takes the
  project's signature, under a new parameter ID with a conversion rule (Foundation).

Rejected:

- **Tempo, effects or mix per pattern:** a pattern switch would make the tempo or the mix jump.
- **A time signature per pattern in version 1:** meter changes inside a piece are rare in this kind
  of music, and moving to it later is cheap.

## Bars, time signatures and the grid

### Time signatures and bars

- **Signatures** run from 1 to 16 over 4 or 8, one for the whole project **(owner's choice)**. A new
  project is in 4/4 **(my call)**.
- **A pattern's length** is a whole number of bars of the signature. Odd loop lengths come from the
  signature itself: a 7/8 bar is 14 sixteenths. A pattern that has never been given a length is 1
  bar long, as on the EP-133, in a new project and later; switching to it gives it the length of the
  pattern you came from (see "Switching patterns").
- **Tempo** is always counted in quarter notes, as on every device researched. A 6/8 groove is not
  shown in dotted quarters.

### The step buttons

**(owner's choice)**

- The 16 step buttons always show one bar, one sixteenth each, for the selected sound; with no
  selected sound they are all dark (Workflow A).
- Every bar starts on button 1. A bar shorter than 16 sixteenths leaves the buttons after its end
  dark: 3/4 uses 12.
- A bar longer than 16 sixteenths continues on a short second page: 5/4 is 16 + 4 and 12/8 is 16 +
  8; 16/4 takes four pages. Moving between pages works like moving between bars.
- They show the bar, or the page of a long bar, that the cursor is in (see "STEP and ROLL").

### The grid

**(owner's choice)**, like the EP-133's TIMING note interval.

- One setting, GRID, decides:
  - where a step-entered note lands: the first grid position inside the button's sixteenth;
  - what recording with quantize on snaps to;
  - how long a step-entered note is: one grid step;
  - later, the rate of note repeat and the arpeggiator, and what swing works on.
- Changing it never moves a stored note.
- Grid positions are counted from the start of each bar.
- Version 1 fixes it at 1/16. Later it ranges from 1/1 to 1/64, triplets included; every value is a
  whole number of ticks (1/16 is 480, 1/8 triplets 640, 1/64 120).
- Once it can change, buttons whose sixteenth holds no grid position are dark and do nothing: at 1/4
  only buttons 1, 5, 9 and 13 work, and at 1/8 triplets buttons 4, 8, 12 and 16 are dark. With a
  grid finer than 1/16 a button holds several positions. A press uses the first; the others are
  reached with the cursor, by recording, with POSITION or, later, with ratchets.

### Changing the signature or the length

**(owner's choice)**

- **Each note keeps its bar and its place in the bar.** A 4-bar groove in 4/4 switched to 3/4 stays
  4 bars, and every bar loses its fourth beat.
- **Notes that no longer fit are deleted:** notes past the end of a shorter bar, and notes in bars
  past the end of a shorter pattern.
- **LENGTH and SIGNATURE open a picker,** like ENGINE in Workflow A. Turning their encoder or
  pressing − or + does nothing, so a stray turn cannot delete notes.
- **A choice that would delete notes asks first,** such as "DELETE 24 NOTES?". A choice that deletes
  nothing applies at once. Shortening from 8 bars to 2 asks once, not once per click.
- **Lengthening adds empty bars.**
- **A note that starts inside a bar and lasts past its end** keeps its length and rings into the
  next bar.
- **While playing,** a new signature takes hold at the next bar line, so the bar being played never
  changes under the playhead, and a playhead past a new shorter length wraps to bar 1 at the next
  bar line **(the Project model's call)**.
- **Hidden notes come later.** Shrinking would then keep the notes that no longer fit, silent, and
  play them again when the bar or the pattern grows. A note hidden past a bar's end sits inside the
  pattern, where its tick time would overlap the next bar, so the note store would have to keep its
  place as a bar and an offset. Projects from before have no hidden notes and convert without loss.

### Alternatives rejected

- **Each note keeping its time while the bar lines move,** as DAWs and Move do. Whole bars force the
  length to round: 4 bars of 4/4 become 6 bars of 3/4, and switching back gives 5 bars of 4/4.
- **Hidden notes in version 1:** the owner does not want to deal with them yet.
- **Buttons covering eighths in long bars:** no device does it, and sixteenths could no longer be
  entered.
- **Continuous 16-step pages** (Elektron): bar starts drift across the pages, the weak spot Elektron
  users complain about.
- **A signature that only changes the metronome:** the fake that devices without signatures use.
- **A step size per pattern,** or a zoom that changes what a button covers: the owner wants the
  buttons to always be one bar.

## Transport and tempo

### PLAY and STOP

- **PLAY** starts the pattern from its first bar. While playing it never touches the music, so a
  stray press cannot restart or pause the loop; it only makes the view follow again (see "Following
  the music").
- **SHIFT + PLAY** starts from the beginning of the cursor's bar. While playing it jumps there at
  once.
- **STOP** stops playback and recording, and disarms recording. Sounding notes fade with their own
  release, and echoes and reverb ring out, as when muting. The next PLAY starts from the first bar.
- **STOP while stopped** silences everything at once, echoes, reverb and the sample preview
  included.

Rejected: PLAY while playing restarting from the first bar, and PLAY toggling pause. Both make a
stray press stop the music, and SHIFT + PLAY covers listening from a bar.

### Tempo

- **Per project,** from 30 to 300 BPM, stored in hundredths (Foundation). A new project starts at
  120 BPM. Down to about 31 BPM a tick stays shorter than a millisecond, so free-played notes keep
  their feel across the range.
- **The TEMPO item** moves 1 BPM per click and 0.1 BPM with SHIFT. Tempo is an exception to Workflow
  A's "16 times finer with SHIFT", since whole and tenth BPM steps are how tempos are written.
- **Changes take effect at once,** even while playing, as jumps (Foundation). The delay effect
  follows the new tempo at once, crossfading as Sound decided.

### The TEMPO button

**(owner's choice)**

- **Held:** the strip shows TEMPO, GRID, SWING and QUANTIZE, the PATTERN screen's TIMING page, from
  any screen. Letting go brings back the strip that was there. In version 1 GRID shows 1/16 and does
  nothing, and SWING is empty.
- **A tap** turns the metronome on or off. It acts when you let go, and only if the press was short
  and no encoder was turned while TEMPO was held.

Rejected:

- **Tap tempo.** The owner prefers the metronome on the tap.
- **A tap opening the TIMING page:** Workflow A gives a screen its own button only for ROLL, and
  MENU + 9 gets there in two presses.
- **Tempo changes waiting for the next beat or bar:** turning would feel sluggish.
- **SHIFT moving 1/16 or 1/100 BPM:** odd values such as 120.06, or 100 clicks per BPM.

### Metronome

**(owner's choice)**

- **On or off** is a device setting, like VELOCITY, so opening a project never switches it. A tap of
  TEMPO flips it, and SETTINGS shows it as the screen route. It starts off **(my call)**.
- **The click** is a short sound made by the core, at the METRONOME LEVEL set on SETTINGS. It joins
  the master after the master level and before the soft clipper, like the sample preview in Workflow
  A (Sound): track effects, mutes and the master level do not touch it, and the volume knob does.
  METRONOME LEVEL starts at a moderate level, picked by ear while building and kept as a named
  constant; no number is set now.
- **It clicks** whenever it is on and the pattern plays, on every beat as the signature counts them:
  every quarter note in x/4, every eighth note in x/8. The first beat of each bar clicks higher.
- **The header** shows when it is on.

Rejected:

- **Clicking only while recording:** a metronome that is on but silent looks broken, and you cannot
  practise along without recording.
- **Grouped beats in x/8,** such as 6/8 as two dotted quarters: groupings such as 2 + 3 in 5/8
  cannot be guessed and would need another setting.

### Count-in

- When recording starts from a stop, one bar of clicks plays first, even with the metronome off.
- COUNT-IN, OFF or 1 BAR, is a device setting on SETTINGS. It starts at 1 BAR **(my call)**.
- **REC during the count-in** only cancels the recording **(owner's choice)**: the clicks finish and
  the pattern starts on time without recording. REC again before the first beat puts recording back.
  So REC means the same during the count-in as while playing.
- **STOP during the count-in** ends it: nothing has played, nothing is recorded and recording is
  disarmed.
- **PLAY and SHIFT + PLAY during the count-in** change nothing: the count-in is not restarted and
  the start point is not moved.
- **Pads and keys hit during the count-in** sound but are not recorded. One exception: with quantize
  on, a hit just before the first beat, whose nearest grid position is the first step that plays,
  lands on that step, as a hit just before the loop restarts does (see "Recorded notes"), so a
  slightly early first note is not swallowed.

Rejected: REC during the count-in calling the whole start off. REC would then stop the transport in
this one case, which is STOP's job.

## STEP and ROLL

### One model

**(owner's choice)** STEP and ROLL differ only in their rows: STEP has one lane per sound, ROLL one
row per pitch. Everything else in this section works the same on both.

### The view

- **One long view that scrolls,** at a fixed scale: a sixteenth always takes the same width and
  every row has the same height. The view fills the screen's width with as many bars as fit, for
  example 1.5 bars.
- **A cell is one grid step wide,** so in version 1 a cell is a sixteenth. With a coarser grid later
  the cells get wider, with a finer one narrower.
- **The bar the step buttons show** is drawn slightly lighter.
- How many pixels a sixteenth takes, and so how much fits, is the Look spec's choice.

### The cursor

- **The cursor is a cell:** one row and one grid step.
- **Left and right** move one grid step.
- **Up and down** move one row. On STEP that is the next lane, which selects its sound as hitting
  its pad would; it is also how a lane whose sound is on no pad is reached. On ROLL it is one
  semitone.
- **SHIFT + left or right** jumps a whole bar, or a page of a long bar. **SHIFT + up or down** jumps
  12 rows: an octave on ROLL, and between the pad lanes and the extra lanes on STEP.
- **The cursor never leaves the screen.** When it lands on the last fully visible cell, the view
  moves one beat, or one row; moving back works the same way. The view stops at the pattern's ends,
  and the cursor does not wrap round.
- **The step buttons show the bar, or the page, the cursor is in.**
- **STEP and ROLL share the cursor's bar and step,** so switching between them keeps your place;
  each keeps its own row **(my call)**.
- **Using a control moves the cursor to what it acts on,** as using an encoder does in Workflow A.
  Pressing a step moves the cursor to that step, scrolling if needed. Hitting a pad in PADS mode
  moves the STEP cursor to its lane. Keys in KEYS mode do not move the ROLL cursor, since playing a
  melody would make the view jump about.
- **T1–T4** show that track. The cursor keeps its bar and step and moves to the new track's selected
  sound.
- **− and +** do nothing on a cell: a cell has no value that moves by a click, and OK and CANCEL are
  what act on it.

### Following the music

**(owner's choice)**

- **While playing, the view follows.** As the music reaches each new bar, the cursor jumps to the
  same spot in it, and the step buttons and the view go along.
- **Moving the cursor into another bar,** with the arrows or SHIFT + left or right, stops following.
- **Pressing PLAY while playing** follows again **(owner's choice)**: the cursor and view return to
  the bar that is playing and keep following, whatever screen is shown. The music, the playhead,
  recording and the count-in are untouched. Starting playback also follows.
- **When a queued pattern takes over** while following, the view moves to the new pattern.
- **The header** shows the bar the buttons show and the bar playing, such as "BAR 2/4 ▶3".

### Markings on both screens

- A vertical line that moves with the music.
- An outline on the cursor's cell.
- A thin line at each beat as the signature counts them: every 4 cells in 4/4, every 2 in 7/8.
- The bar the step buttons show, slightly lighter.
- Dark cells after the end of a bar shorter than 16 sixteenths, as on the buttons.

### Alternatives rejected

- **One lane plus a roll** (Elektron, Push drums, Circuit): the kit is invisible on STEP, and ROLL
  cannot take over the overview, since drums stack up on one row.
- **One merged roll** whose rows switch between sounds and pitches with PADS/KEYS, as the Deluge,
  Maschine and MPC switch them by track type: PADS/KEYS is how you play, not a track type, so
  switching to KEYS to play a bass line would hide the drums.
- **A grid plus a note list** (Digitone II, MC-707, M8): the least visual option.
- **A ROLL cursor that jumps from note to note** (Push, Maschine): ROLL would work differently from
  STEP.
- **Exactly one bar per screen,** or the bar stretched to the screen's width: space is wasted, or
  the scale changes with the signature.
- **Never following,** or always following while playing: the first loses the playhead, the second
  the chance to edit another bar while playing.
- **One gesture moving the cursor into the strip** on every screen: every screen would get two zones
  and a hop between them. The strip is never a cursor target instead (see "Changes to Workflow A").

## STEP

**(owner's choice)**

### Lanes

- **Always the 12 pad lanes** of the current track, in pad order. An empty pad is an empty lane, so
  lane 3 is always pad 3. On an empty lane OK and the step buttons do nothing; the PAD page can put
  a sound on the pad. While an empty pad is selected there is no selected sound (Workflow A), so the
  step buttons are dark and the strip under STEP and ROLL is empty.
- **Below them, an extra lane** for each sound that has notes on this track but sits on none of its
  pads, in pool order. That happens after a pad's sound is swapped, or when notes are entered for a
  sound selected on POOL. The extra lanes scroll into view.
- **A sound on two pads** of the same track shows its notes in the first of those lanes. The other
  lane is marked as a copy, such as "= PAD 3".
- **The selected sound's lane** is highlighted.
- **A sound whose sample is missing** has its lane marked MISSING; its notes stay and are silent
  (Project model).

### Cells

- **Empty:** no note starts here.
- **Filled:** a note starts here; the brighter, the louder.
- **A tail to the right:** the note keeps sounding over the next cells.
- **Drawn slightly off-centre:** the note was recorded a little before or after the grid position.
- **A small number:** more than one note starts here, such as a chord.
- **Pitch is not shown on STEP.** It is on ROLL, and in PITCH when a note is edited.

Rejected: lanes only for pads that have a sound, or only for sounds that have notes. Lanes would
move, or appear and disappear as notes are entered.

## ROLL

- **Every note of the current track,** each in its sound's colour. The selected sound's notes are
  bright and the others dim, there for context such as the bass against the kick. Adding, removing
  and editing only ever touch the selected sound's notes.
- **Rows:** one per semitone from C0 to B8, KEYS mode's full range **(owner's choice)**, with note
  names at the left edge. About an octave fits on screen.
- **Where the view opens:** opening ROLL or selecting another sound scrolls the view to the selected
  sound's notes, with the cursor at the middle of them. A sound with no notes yet opens at the pitch
  where it plays unchanged.
- **A note** is a bar from its exact start, as long as the note, brighter when louder. A chord is
  several bars stacked on different rows.
- **Drums** sit on one or two rows, since a drum hit plays at its unchanged pitch. Hits of different
  sounds on the same row overlap, with the selected sound on top. ROLL is not meant for drums; STEP
  is.

Notes can be edited on ROLL, which ends the overview's non-goal of a piano roll that is only shown.

## Entering and editing notes

### The step buttons

They work the same on STEP, ROLL and every other screen. They show the selected sound's sixteenths
in the bar, or page, of the STEP and ROLL cursor, so on other screens they keep the bar last used
there. A step is lit when the selected sound has a note starting in its sixteenth.

- **Tap an unlit step:** adds a note when you let go, if the press was short.
- **Short tap on a lit step:** removes the selected sound's notes in that sixteenth when you let go,
  if nothing changed while it was held. Holding longer, or changing anything, keeps the notes.
- **Hold a step:** the NOTE strip for the selected sound's notes on it, while held.
- **Hold a step and hit pads or keys (owner's choice).** In PADS mode each pad adds or removes its
  sound on the step, without changing the selected sound. In KEYS mode each key adds or removes that
  pitch of the selected sound, so chords need no extra mode. The pad or key sounds, so you hear what
  you add, but it does not select or move the cursor, and it is not recorded. Precedent: OP-XY,
  Move, Circuit Tracks and MC-707.
- **Hold several steps:** the encoders change all their notes together.
- The core decides whether a press was short from the times of press and release in its recorded
  input (Foundation), so replays come out the same.

### What a step-entered note gets

**(owner's choice)**

- the selected sound;
- the first grid position in the button's sixteenth, one grid step long;
- full velocity, as with the VELOCITY switch off, so the sound plays exactly as set;
- no pressure;
- its pitch:
  - in PADS mode, the pitch where the sound plays unchanged: the root note of a sample and C4 for a
    synth, the same pitch a pad hit records;
  - in KEYS mode on a plain tap, the last key played, or the C of the current octave before any key
    has been played;
  - when the step is held, the keys hit.

### The NOTE strip

**(owner's choice)**, like Maschine, MC-707 and Elektron.

While a step is held, the strip shows PITCH, VELOCITY, LENGTH and POSITION instead of the sound's
page, drawn on screen like the timing strip. Letting go brings the sound's page back.

- **PITCH** in semitones, in PADS mode too, for tuned drums.
- **VELOCITY.**
- **LENGTH,** one grid step per click, 16 times finer with SHIFT, as for every smooth value.
- **POSITION,** one grid step per click, so a note can move onto another step; the edit follows the
  note, not the button. Finer positions belong to micro-timing, which comes later, so in version 1 a
  note's time is set by hand only on the grid. Times off the grid come only from recording with
  quantize off.
- **Several notes,** such as a chord, several notes in one sixteenth or several held steps, change
  by the same amount. Values that differ show as a range, as on Push and Maschine.

Rejected: holding a step and pressing a later one to set the length (OP-XY, Deluge, Hapax). It
clashes with holding several steps, and LENGTH covers it.

### The cursor on cells

**(owner's choice)**

- **OK on an empty cell** adds a note: the lane's sound on STEP, the selected sound at the cursor's
  pitch on ROLL.
- **OK on a cell with notes** opens the NOTE panel.
- **CANCEL on a cell with notes** removes them. Like every button that also does something when
  held, its tap acts when you let go.

### The NOTE panel

- A second level like a picker, drawn over the main area. It lists PITCH, VELOCITY, LENGTH and
  POSITION for the cell's notes.
- Up and down move between them, and − and + change them by one click. While the panel is open the
  encoders hold its four items, so they change them too and the strip shows them. The panel is a
  page of four, not a picker, which is why the encoders work here and not in a picker.
- CANCEL closes it and puts the cursor back on the cell.
- Apart from the controls described here, the panel follows the rule for an open picker (Workflow
  A): the music carries on, pads and keys sound but do not select or move the cursor, and buttons
  that lead elsewhere do nothing until the panel is closed.
- On ROLL a cell is one pitch, so this is how a single note of a chord is edited.
- It is the screen route for a note's values; a held step is the fast route.

### Note values

A note's values are plain data in the note store, not entries on Foundation's parameter list.
Without parameter locks nothing needs them there, and saving "ID = number" for every note would
waste memory. The NOTE strip and panel borrow the parameter list's display formats and click sizes.

### Pressure

**(owner's choice)** Notes record pressure as played (Workflow A), but in version 1 it is not
edited: nothing plays it until modulation exists, and a change that cannot be heard cannot be
judged. Pressure is therefore the one exception to "every parameter is reachable" until modulation
arrives. Step-entered notes have none.

Rejected: a PRESSURE amount that scales the curve, and a way to clear it. Both edit something
inaudible and would need a fifth item in the NOTE strip.

## Live recording

### REC

**(owner's choice)**

- **REC while playing** starts recording at once, and REC again stops recording while the music
  keeps playing: dropping in and out on the fly.
- **REC while stopped** arms recording: REC blinks and the header shows it. The next PLAY or SHIFT +
  PLAY starts playback and recording together, after the count-in if it is on.
- **REC while armed and stopped** disarms.
- **STOP** stops playback and recording, and disarms.
- **Overdub:** recorded notes are always added to what is there.
- **On every screen:** recording works wherever you are, into the current track. T1–T4 while
  recording switch the track recorded into.
- **On a muted track** recording works as usual: what you play sounds, and the recorded notes stay
  silent until the track is unmuted (Sound).
- **Across pattern switches:** recording carries on into the next pattern when it takes over.

Rejected: REC while stopped starting playback and recording at once. It saves a press, but there is
no way to arm and then start at a moment you choose, for example from the cursor's bar.

### Recorded notes

**(owner's choice)**

- **Sound and pitch:** in PADS mode the pad's sound at its unchanged pitch; in KEYS mode the
  selected sound at the key's pitch.
- **Velocity** from the hit when VELOCITY is on, full when it is off.
- **Pressure** as played, and **length** as held.
- **Quantize on,** the default: the start snaps to the nearest grid position, so a hit slightly
  early lands on the step it was aimed at. The length stays as played: the note moves, it does not
  stretch. The stored note is quantized for good.
- **Quantize off:** the start is kept exactly as played, corrected for the output delay
  (Foundation).
- **A hit just before the loop restarts,** whose nearest grid position is the pattern's start, snaps
  to the start of bar 1.
- **A note on the same sound, pitch and start** as an existing one replaces it, so overdub passes do
  not pile up doubled notes that sound like flams.
- **A note held across the loop point** keeps its full length and rings on into the start of the
  next pass, but is never longer than the pattern.
- **A note held across a pattern switch** belongs to the pattern it was pressed in. STOP or REC off
  while a pad is held ends the note there (Project model).
- **Mono legato and glide** come from overlapping notes: playing legato, or lengths that reach the
  next note.
- **No accents** in part 1; velocity does the job.

Rejected: adding the new note next to the old one, and cutting notes where the loop restarts.

## Undo, erasing, clearing and copying

### Undo

**(owner's choice)**, as on the OP-XY and the electribe.

- **SHIFT + CANCEL** undoes the last action, and pressing it again redoes it.
- **One action** is:
  - a whole recording pass, from REC on to REC off;
  - adding or removing notes;
  - editing notes' values, all clicks while one NOTE strip or panel is shown counting as one;
  - an erase, for as long as it is held;
  - a paste;
  - a clear;
  - a length or signature change.
- **Notes only.** Sounds, effects, the mix and projects are not covered: a value can be turned back
  by hand, and deleting a sound already asks first. Deleting a sound also empties undo and redo,
  since they could hold its notes (Project model).
- **An action too big to keep** for undo asks first instead, such as "CAN'T UNDO. CLEAR?". Too big
  means bigger than the undo budget (Project model). A recording pass cannot ask: if memory runs out
  during the pass, its undo is dropped first and the header shows UNDO LOST; if there is still no
  room, the pads keep sounding, nothing more is stored and the header shows FULL for the rest of the
  pass. Step entry and a paste that do not fit are refused with NOT ENOUGH MEMORY.
- More levels can grow from this later; one level is a history of length one.

Rejected: no undo, since autosave keeps every mistake; several levels in version 1, which cost more
memory and work.

### Erasing and clearing

**(owner's choice)**, like the EP-133's ERASE.

- **Hold CANCEL and a pad while playing:** that sound's notes on the current track are erased as the
  music passes over them, for as long as both are held. In KEYS mode CANCEL and a key erase that
  pitch of the selected sound. The pad or key only points at the sound or pitch and is not played,
  selected or recorded. It works whether recording or not, so a take can be fixed without stopping.
- **Hold CANCEL and a pad while stopped:** all of that sound's notes on the current track go, after
  a question such as "CLEAR KICK ON T1?". Here too the pad only points and is not played, selected
  or recorded.
- **Hold CANCEL and T1–T4:** that track's notes in the pattern go, after a question such as "CLEAR
  T2?".
- **CLEAR on the PATTERN screen** empties a pattern, after a question.
- **Big deletions ask, small ones don't.** Removing notes or erasing while playing does not ask.
  Clearing a sound, a track or a pattern does, and so do length and signature changes that delete
  notes.

Rejected: SHIFT + pad for erasing. SHIFT means "the finer or other version", and CANCEL already
means "remove" on STEP and ROLL.

### Copying

**(owner's choice)**: a new COPY button.

- **Tap COPY:** copies the current track's bar the cursor is in: every note that starts in it, at
  its full length.
- **Hold COPY and a pad:** copies that pad's sound's notes on the current track, across the whole
  pattern. In KEYS mode it copies the selected sound's notes. The pad or key only points and is not
  played, selected or recorded.
- **Hold COPY and T1–T4:** copies that track's notes across the whole pattern.
- **Whole patterns** are copied only on the PATTERN screen.
- **SHIFT + COPY pastes** into what is selected, so no paste needs three controls at once:
  - a bar into the cursor's bar, on the current track, so a bar can also go to another track;
  - a sound's notes onto the selected sound, which is how a closed hi-hat part becomes an open one;
  - a track's notes into the current track;
  - a pattern into the current pattern, after a question.
- **Paste replaces** what was there, and one undo takes it back. Pasting over a whole sound, track
  or pattern that has notes asks first; a bar never asks. Whatever does not fit, such as bars from a
  longer pattern, is dropped.
- **There is one clipboard.** It keeps the last copy while you switch tracks or patterns, and it is
  not saved; deleting a sound whose notes it holds empties it (Project model).

Rejected:

- **COPY and PASTE on SHIFT + REC and SHIFT + STOP,** Elektron's pairing: what was copied depended
  on more combinations, and the labels would not say what the buttons do.
- **A double tap of COPY for a whole pattern,** as on the EP-133: the owner wants no double taps.

## Switching patterns

**(owner's choice)**

- **SHIFT + step n** switches to pattern n, for patterns 1 to 16. While SHIFT is held, the step
  buttons light to show which patterns have notes, which one is playing and which is queued.
- **When it happens:** at once when stopped; while playing, at the end of the playing pattern, with
  the header showing the queued pattern.
- **A pattern that has never been changed** takes the length of the pattern you came from, so a
  variation lines up with the original.
- **Patterns from 17 on** are reached on the PATTERN screen.

Rejected:

- **A PATTERN button held with a step:** clearer to label, but another button where a free
  combination does the job.
- **Switching at the next bar line:** quicker in long patterns, but a pattern could then start in
  its middle.

## The PATTERN screen

MENU + 9. Its pages, picked with PAGE + step as on every screen:

| PAGE + step | Page     | Main area and strip                                                                                                                 |
| ----------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1           | TIMING   | TEMPO, GRID, SWING and QUANTIZE, all four on the encoders; holding TEMPO shows this strip from any screen                           |
| 2           | BARS     | LENGTH and SIGNATURE, both pickers, on encoders 1 and 2; encoders 3 and 4 hold nothing                                              |
| 3           | PATTERNS | The pattern list; the encoders hold nothing and the strip is empty; SWITCH, COPY, PASTE, CLEAR and DELETE are in a pattern's picker |

- **The list** starts with NEW, as PROJECT's does, then every pattern. Empty patterns are marked,
  and so is the one playing.
- **OK on NEW** adds an empty pattern at the end and switches to it, with the usual timing **(my
  call)**.
- **OK on a pattern** opens a picker:
  - **SWITCH** switches to it, with the usual timing.
  - **COPY** puts the whole pattern into the clipboard.
  - **PASTE** replaces it with the clipboard's pattern, after a question if it has notes.
  - **CLEAR** empties it, after a question.
  - **DELETE** removes it, after a question. Only patterns from 17 on can be deleted, and the ones
    after a deleted pattern move up a number. Patterns 1 to 16 can only be cleared. The number shown
    is a pattern's position; each pattern also carries an internal number that never changes and is
    never reused (Project model).
- **LENGTH** belongs to the current pattern; TEMPO, SIGNATURE, GRID, SWING and QUANTIZE to the
  project **(my call for GRID, SWING and QUANTIZE)**. Screens are grouped by use, not by where a
  value is saved, as on MIX.

## Controls and bindings

### Controls

A new **COPY** button **(owner's choice)** makes 22 function buttons, since there is no STEP button
(Look). Where it sits is the Look spec's job.

### When a button acts

**(owner's choice)**

- **A button that also does something when held acts when you let go,** and only if the press was
  short and no other control was used while it was held: the step buttons, CANCEL, COPY, TEMPO and
  PADS/KEYS. A long press on its own does nothing **(my call, extending the short-press rule the
  owner chose for lit steps and TEMPO to every such button)**.
- **Every other button acts when pressed:** PLAY, STOP, REC, T1–T4, the arrows, − and +, OK, ROLL
  and the encoder presses. Starting, stopping, dropping into recording and muting must land on the
  beat, and the arrows and − and + repeat while held.
- **Pads** always play the moment they are hit, with two exceptions **(owner's choice)**. Under a
  held step a pad or key sounds, so you hear what you add, but it does not select or move the cursor
  and is not recorded. Under CANCEL or COPY it only points at the sound or pitch and makes no sound.
- Acting on release also makes holding work cleanly: holding an empty step and hitting pads or keys
  adds exactly what was hit, without the selected sound first.
- **How long a press must last to count as a hold, the delay before a held arrow starts to repeat
  and how fast it then repeats** are one fixed value each, tuned by hand during the build and kept
  as named constants counted in samples of the audio clock, which stamps every press and release
  (Foundation). No numbers are set now.

Rejected: every button acting when you let go. Transport and mutes would come late by however long
the button is held, and holding could no longer repeat.

### Bindings

The starting bindings, written in code (Foundation) and expected to change. Workflow A's bindings
stay as they are except where "Changes to Workflow A" says otherwise.

| Control                   | Action                                                                                                                                                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1–T4                     | Select the track; STEP and ROLL show it                                                                                                                                                                                      |
| SHIFT + T1–T4             | Mute or unmute the track                                                                                                                                                                                                     |
| COPY held + T1–T4         | Copy that track's notes                                                                                                                                                                                                      |
| CANCEL held + T1–T4       | Clear that track's notes, after a question                                                                                                                                                                                   |
| PADS/KEYS                 | Switch the current track's pad mode, when you let go                                                                                                                                                                         |
| PADS/KEYS held + up, down | Octave up or down, in KEYS mode                                                                                                                                                                                              |
| ROLL                      | Show that screen                                                                                                                                                                                                             |
| MENU held + step n        | Show screen n; 9 is PATTERN                                                                                                                                                                                                  |
| PAGE held + step n        | Show page n of the current screen                                                                                                                                                                                            |
| SHIFT + step n            | Switch to pattern n, 1 to 16                                                                                                                                                                                                 |
| Step buttons              | The selected sound's sixteenths in the cursor's bar: a tap on an unlit step adds a note, a short tap on a lit step removes its notes, a hold shows the NOTE strip, a hold + pads or keys adds or removes that sound or pitch |
| Arrows                    | Move the cursor; on STEP and ROLL one grid step left or right, one lane or semitone up or down, and the view scrolls                                                                                                         |
| SHIFT + left, right       | Jump the cursor a whole bar, and stop following                                                                                                                                                                              |
| SHIFT + up, down          | Jump the cursor 12 rows                                                                                                                                                                                                      |
| OK                        | Use the item under the cursor; on STEP and ROLL, add a note on an empty cell or open the NOTE panel on a cell with notes                                                                                                     |
| CANCEL                    | Back out; on STEP and ROLL, remove the cell's notes; a tap acts when you let go                                                                                                                                              |
| CANCEL held + pad, key    | While playing, erase that sound's or pitch's notes as the music passes; while stopped, clear them, after a question; the pad or key only points                                                                              |
| SHIFT + CANCEL            | Undo; again to redo                                                                                                                                                                                                          |
| − and +                   | Change the value under the cursor; nothing on STEP and ROLL cells                                                                                                                                                            |
| Encoders 1–4              | The items they hold on the page, shown in the strip; while a step is held, the note's values; while TEMPO is held, TEMPO, GRID, SWING and QUANTIZE; nothing in a picker or a question                                        |
| Encoder press             | OK on the item it holds                                                                                                                                                                                                      |
| Volume encoder            | Output volume                                                                                                                                                                                                                |
| Pads                      | Play; in PADS mode also select and move the STEP cursor to the pad's lane; recorded while recording; under a held step only play; under CANCEL or COPY only point                                                            |
| REC                       | While playing, start or stop recording; while stopped, arm or disarm                                                                                                                                                         |
| PLAY                      | Start from the first bar; while playing, follow again                                                                                                                                                                        |
| SHIFT + PLAY              | Start from the cursor's bar, or jump there while playing                                                                                                                                                                     |
| STOP                      | Stop playing and recording; while stopped, silence everything                                                                                                                                                                |
| TEMPO                     | A tap turns the metronome on or off; held, the strip shows TEMPO, GRID, SWING and QUANTIZE                                                                                                                                   |
| COPY                      | A tap copies the cursor's bar on the current track                                                                                                                                                                           |
| COPY held + pad           | Copy that sound's notes; the pad only points                                                                                                                                                                                 |
| SHIFT + COPY              | Paste into what is selected                                                                                                                                                                                                  |

Still free: SHIFT + OK, SHIFT + pad, SHIFT + encoder press, SHIFT + REC, SHIFT + STOP and SHIFT +
TEMPO, and screens 11 to 16.

### What the header gains

- the current pattern, and a queued one;
- the bar the step buttons show and the bar playing;
- recording armed or running;
- the metronome, when it is on;
- the messages UNDO LOST, FULL and NOT ENOUGH MEMORY (Project model).

## Testing

On top of Foundation's and Workflow A's testing:

- **Ordinary tests** for every action and rule:
  - placing step-entered notes on the grid, and which buttons are dark;
  - pages of long bars;
  - signature and length changes keeping each note's bar and place, deleting what no longer fits,
    and their questions;
  - taps and holds for every kind of button, timed by the core;
  - cursor moves, scrolling by a beat or a row, stopping at the ends, the SHIFT jumps;
  - ROLL's rows covering KEYS mode's range from C0 to B8;
  - following and when it stops;
  - PLAY while playing leaving the music untouched and following again;
  - step entry in PADS and KEYS mode, and adding sounds or pitches by holding a step;
  - pads under a held step, CANCEL and COPY: what sounds, selects, moves the cursor and is recorded;
  - the NOTE strip and panel, and several notes changing together;
  - recording: snapping to the nearest position, the snap to bar 1, replacing notes in the same
    place, notes held across the loop point, overdub, arming and the count-in;
  - during the count-in: REC dropping recording while the pattern still starts on time, STOP leaving
    nothing recorded, and an early first hit landing on the first step with quantize on;
  - metronome clicks and accents in x/4 and x/8;
  - undo and redo of every kind of action, and the question for an action too big to keep;
  - erasing while playing, and clearing with its questions;
  - copy and paste of bars, sounds' notes, tracks and patterns, replacing and dropping;
  - pattern switches at the end of the pattern, the queued state and the length a fresh pattern
    takes;
  - the pattern list's actions, and pattern numbers after DELETE.
- **Drift scenes** that drive the panel only:
  - a beat entered by steps from an empty project;
  - a take played in with quantize on, and one with it off;
  - overdub passes and an erase;
  - tempo changes while the delay rings;
  - a signature change;
  - switching patterns while recording;
  - copy and paste, undo and redo;
  - the metronome and the count-in.
- **The screen gallery** shows, in fixed states:
  - STEP and ROLL in 4/4, 3/4, 7/8 and 5/4 with its short page;
  - extra lanes and copy lanes, chords, notes off the grid, long notes;
  - a following and a stopped view;
  - the NOTE strip and panel and the timing strip;
  - the PATTERN screen's pages and pickers and the questions;
  - the step buttons showing patterns while SHIFT is held.

## Changes to the part 1 overview

Applied to the overview together with this spec:

- The Workflow B part of the decision register points to this spec and sums it up; its open
  questions are answered here.
- The non-goal of editing notes in the piano roll is gone; the features this spec puts after the
  first version join the non-goals.
- The Workflow A part notes the octave's new binding and that the strip is never a cursor target.
- The Project model part gains: unlimited patterns with 1 to 16 always there, the signature read per
  pattern, notes as plain data, one level of undo, and the new device settings (the metronome, its
  level and the count-in).
- The Look part gains the COPY button.
- Milestones 3 to 5 follow this spec **(my call)**.
- The glossary gains bar, grid, cell, NOTE strip, NOTE panel, clipboard and following; pattern,
  project, screen and strip are updated.

## Changes to Workflow A

Applied to Workflow A in the consistency pass of 2026-11-10. Where a decision of that pass differs
from a bullet below, the target spec's current text holds.

- **The strip is never a cursor target (owner's choice).** Every item lives in a main area, and the
  strip shows the items the encoders hold, up to four, and nothing else.
  - FX CHAIN's TYPE and MOVE become main-area items rather than the strip's; encoders 1 and 2 hold
    them.
  - SOUND's and MIX's main areas show their page's items; the strip repeats the ones the encoders
    hold.
  - POOL's and PROJECT's strips are empty: a list holds nothing for the encoders, and their actions
    are in their pickers.
  - Every strip has a screen route: a screen's own page in its main area, the sound page under STEP
    and ROLL on SOUND, the timing strip on PATTERN's TIMING page, and the NOTE strip in the NOTE
    panel.
- **A third kind of second level,** the NOTE panel, joins the picker and the question.
- **The octave moves** from SHIFT + up or down to PADS/KEYS held with up or down **(owner's
  choice)**. SHIFT + up or down now jumps the cursor 12 rows on STEP and ROLL.
- **Taps of buttons that also do something when held act when you let go:** CANCEL, COPY, TEMPO,
  PADS/KEYS and the step buttons.
- **CANCEL** also removes notes on STEP and ROLL cells, erases and clears when held with a pad, a
  key or a track button, and undoes with SHIFT.
- **A new COPY button,** making 23 function buttons; 22 since Look removed the STEP button.
- **A pad hit under a held step, CANCEL or COPY does not select,** so PADS mode's selection rule
  gains these exceptions.
- **The strip under STEP and ROLL** shows the selected sound's page except while a step is held (the
  NOTE strip) or TEMPO is held (the timing strip).
- **SETTINGS** gains METRONOME, METRONOME LEVEL and COUNT-IN, so VELOCITY is no longer its only
  setting.
- **Screen 9 is PATTERN.** Screens 10 to 16 stay free.
- **The SHIFT combinations Workflow A left free:** SHIFT + left or right jumps a bar, SHIFT + CANCEL
  undoes and SHIFT + step switches patterns. SHIFT + OK, SHIFT + pad and SHIFT + encoder press stay
  free.
- **Copying bars, patterns and a pad's notes,** which Workflow A left to this spec, is the COPY
  button and the PATTERN screen.

## Assumptions about other specs

- **Foundation:**
  - a note's values are plain note data, not parameters;
  - quantizing while recording is permanent; no played offset is kept;
  - swing, later, is applied at playback;
  - grids are whole numbers of ticks, counted from the start of each bar;
  - tempo changes stay jumps; no ramps are needed;
  - the abstract controls gain the COPY button;
  - the core times button presses and releases to tell taps from holds;
  - the metronome click and the count-in are part of the core's output, so the drift tests cover
    them;
  - device settings gain METRONOME, METRONOME LEVEL and COUNT-IN.

  These are applied to Foundation in the consistency pass.

- **Sound:**
  - the delay follows tempo changes at once, through its crossfade;
  - no accent marks in part 1;
  - mono legato and glide come from overlapping notes;
  - STOP while stopped needs a way to silence every voice and clear every effect's memory;
  - the metronome click is a small sound made by the core, mixed into the master after the master
    level and before the soft clipper like the sample preview.
- **Workflow A:** see "Changes to Workflow A".
- **Project model:**
  - stores unlimited patterns, with 1 to 16 always present and cheap while empty, each with its
    notes, its length and whether it has ever been changed;
  - stores the tempo, the time signature, GRID, SWING and QUANTIZE with the project, and reads the
    signature as "this pattern's signature";
  - stores notes as plain data (time and length in ticks, pitch, velocity, pressure curve and
    sound), and adds, replaces and removes notes while the pattern loops;
  - sizes one level of undo and tells the workflow when an action is too big to keep;
  - keeps the clipboard out of saved files;
  - decides whether each track's selected sound, pad mode and octave, each screen's page, the cursor
    and view, following and the current pattern are saved with the project;
  - later, hidden notes need a note's place stored as a bar and an offset.
- **Look:**
  - places COPY;
  - chooses the scale of STEP and ROLL (pixels per sixteenth, row heights) and draws them with every
    marking above, including the copy-lane mark and the lighter bar;
  - draws the NOTE strip and panel, the timing strip, the PATTERN screen's pages, the MENU tile for
    PATTERN and the header's additions;
  - lights the step buttons for patterns while SHIFT is held.

## Research sources

- **EP-133 K.O. II:** [modes](https://teenage.engineering/guides/ep-133/modes) (time signature);
  [play and record](https://teenage.engineering/guides/ep-133/play-and-record) (step entry, copy and
  paste, erase and undo); [functions](https://teenage.engineering/guides/ep-133/functions) (note
  interval, quantize, note repeat, timing correct);
  [buttons and combos](https://teenage.engineering/guides/ep-133/buttons-and-combos).
- **Other Teenage Engineering:**
  [OP-XY sequencer](https://teenage.engineering/guides/op-xy/sequencer) and
  [project](https://teenage.engineering/guides/op-xy/project);
  [OP-Z track](https://teenage.engineering/guides/op-z/track).
- **Elektron:**
  [Digitakt II manual](https://www.elektron.se/wp-content/uploads/2026/10/Digitakt-2-User-Manual_ENG_OS1.17_260930.pdf);
  [Digitone II manual](https://www.elektron.se/wp-content/uploads/2026/10/Digitone-2-User-Manual_ENG_OS1.12_261008.pdf);
  [steps per page](https://www.elektronauts.com/t/sequencers-please-add-steps-per-pages/51119?page=5)
  and
  [hidden trigs](https://www.elektronauts.com/t/automatic-doubling-pattern-length-when-pattern-steps-have-been-p/10497)
  (forum).
- **Deluge:**
  [guidebook](https://synthstrom-audible-deluge.s3.us-east-2.amazonaws.com/Deluge-Guidebook-4p1-OLED.pdf);
  [Sean Luke's review](https://people.cs.gmu.edu/~sean/projects/synth/deluge.html);
  [firmware](https://github.com/SynthstromAudible/DelugeFirmware).
- **Akai MPC:**
  [3.4 user guide](https://cdn.inmusicbrands.com/akai/MPC3-NI/MPC%20Standalone%20OS%20-%20User%20Guide%20-%20v3.4.pdf);
  [3.6 notes](https://cdn.inmusicbrands.com/Software/36/MPC%203.6%20Firmware%20Update.pdf);
  [3.9 notes](https://cdn.inmusicbrands.com/Software/15JM26PSBC/MPC%203.9%20Release%20Notes.pdf);
  [3.10 user guide](https://cdn.inmusicbrands.com/Software/M310PCFIN26OCT/MPC%20Software%20-%20User%20Guide%20-%20v3.10.pdf).
- **Ableton:** [Push 3 manual](https://www.ableton.com/en/push/manual/);
  [Move manual](https://www.ableton.com/en/move/manual/);
  [Move release notes](https://www.ableton.com/en/release-notes/move-1/);
  [Live clip view](https://www.ableton.com/en/live-manual/12/clip-view/).
- **Native Instruments:**
  [Maschine patterns and clips](https://docs.native-instruments.com/online-guides/maschine-mk3-manual/en/working-with-patterns-and-clips).
- **Novation:**
  [Circuit Tracks guide](https://fael-downloads-prod.focusrite.com/customer/prod/downloads/Circuit%20Tracks%20User%20Guide%20Version%202%20-%20EN.pdf);
  [Circuit Rhythm guide](https://fael-downloads-prod.focusrite.com/customer/prod/s3fs-public/downloads/Circuit%20Rhythm%20User%20Guide%20v1.0%20English%20-%20EN.pdf).
- **Roland:**
  [MC-707 reference](https://static.roland.com/assets/media/pdf/MC-707_Reference_eng02_W.pdf);
  [TR-8S reference](https://static.roland.com/assets/media/pdf/TR-8S_Reference_eng05_W.pdf).
- **Squarp:** [Hapax step mode](https://squarp.net/hapax/manual/modestep/) and
  [project mode](https://squarp.net/hapax/manual/modeproject/);
  [Pyramid track mode](https://squarp.net/legacy/pyramid/manual/trackmode/).
- **Polyend:**
  [Tracker+ manual](https://polyend-website.fra1.digitaloceanspaces.com/wp-content/uploads/2024/05/29122414/Polyend-TrackerPlus-Manual-1v2v0a.pdf);
  [Play+ manual](https://polyend-website.fra1.digitaloceanspaces.com/wp-content/uploads/2023/11/14185311/Polyend-Play-Manual-1v3.0.pdf).
- **Korg:**
  [electribe 2 guide](https://cdn.korg.com/us/support/download/files/b77b1482084a8677d7f5ba24efc6cd5e.pdf).
- **Dirtywave:**
  [M8 operation manual](https://cdn.shopify.com/s/files/1/0455/0485/6229/files/m8_operation_manual_v20260421.pdf).
- **DAWs:**
  [Logic global changes](https://support.apple.com/guide/logicpro/global-changes-overview-lgcp4eac0ab9/mac);
  [FL Studio piano roll](https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/pianoroll.htm);
  [Reaper user guide](https://www.reaper.fm/userguide/ReaperUserGuide784c.pdf);
  [Bitwig user guide](https://www.bitwig.com/userguide/latest/arranger_clips_and_the_browser_panel/).
