# Groovebox part 1 – Sound

Status: design, approved by the owner. The second of six subpart specs of part 1; see
[the part 1 overview](./2026-10-26-groovebox-core-browser-design.md) for the intent, the goals and
the decision register, and [Foundation](./2026-11-02-groovebox-foundation-design.md) for the ground
rules this spec builds on.

**Nothing here is final.** The device exists to be experimented with, and the sound will change as
the owner plays with it. This spec records the starting point. Experimenting means changing code,
with AI agents making the edits; nothing is made configurable as data just so it can be changed
without code.

Every section of this spec was presented to the owner and approved. Points where the owner chose
between options are marked **(owner's choice)**.

## What Sound decides

The engines that make sound, the shared chain every note goes through, how voices are allocated, the
per-track effects, the mix and the master output, and how sample files are imported. **The
architecture is the final product's** (owner's choice): part 1 builds only a small part of it, but
later engines and effects plug in without redesign.

The goal for part 1 is **simple but musical** (owner's choice): good enough to make real patterns
and judge the workflow. Work towards the character of the Roland JD-Xi, the long-term sound
reference, comes after the workflow has proven itself. The owner likes the JD-Xi's digital synth
parts, its analog mono synth and its drum part.

## Decisions at a glance

| Topic              | Decision                                                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Signal path        | Per note: engine, then one shared voice chain. Per track: effect slots, then level; mute is not in the path. Master: level, then the preview and the click join, a soft clipper, then the output volume (owner's choice) |
| Sounds             | A sound is made of layers, each an engine plus the shared chain; one layer in part 1                                                                                                                                     |
| Engines            | Self-describing; samples and synthesis are equal; engines make only the raw tone (owner's choice)                                                                                                                        |
| Part 1 engines     | Virtual analog with supersaw, and a mono or stereo sample player (owner's choice)                                                                                                                                        |
| Shared voice chain | Filter, filter envelope, volume envelope, trigger mode, level and pan, tuning, play mode, choke group                                                                                                                    |
| Poly and mono      | Per sound, within what the engine allows; mono has legato and glide (owner's choice)                                                                                                                                     |
| Stereo             | Mono and stereo samples in part 1 (owner's choice)                                                                                                                                                                       |
| Voices             | A fixed count of 32, provisional, plus one preview player beside them; no cost-based admission (owner's choice)                                                                                                          |
| Track effects      | 6 free slots per track, any effect in any slot and order; each slot reserves its own memory (owner's choice)                                                                                                             |
| Part 1 effects     | Delay and reverb; delay times from 1/32 to a whole note, and one longer than 2 seconds plays as the longest note value that fits (owner's choice)                                                                        |
| Muting             | Silences only the notes the pattern plays; pads and keys played by hand still sound; tails ring out (owner's choice)                                                                                                     |
| Master             | Master level; the sample preview and the metronome click join; a soft clipper; the output volume after it; a compressor comes later (owner's choice)                                                                     |
| Sample import      | WAV, converted once to 48 kHz and 16-bit, channels kept, into the library in RAM and on storage; refused only at import, when the library or storage is full or the file cannot be read                                  |

## Signal path

```
Per note (each layer):   engine (sample or synth) → filter → volume envelope → level, pan
                                        │
Per track:               all notes of the track mixed → effect slots 1–6 → track level
                         (mute is not in the path: it stops the pattern's notes from starting)
                                        │
Master:                  all 4 tracks mixed → master level → + sample preview, + metronome click
                         → soft clipper → output volume → output (stereo, 48 kHz)
```

- Effects inside the voice would run once per note; on the track they run once per track however
  many notes play.
- Any track can play any sound, so a sound gets the effects of the track that plays it. The same
  snare on two tracks can have different reverb.

## Engine architecture

1. **A sound is made of layers.** Each layer is one engine plus its own shared chain, like the
   JD-Xi's three partials per tone. Part 1 has exactly one layer per sound, but every sound
   parameter's address includes the layer number from the start, so more layers can come later
   without changing saved projects. Each layer of a note takes one voice.
2. **Every engine carries a description, built into the core:**
   - a permanent ID and a name;
   - its parameters, in Foundation's master-list format, in page order, and which of them the four
     encoders hold;
   - which play modes it allows, and its default;
   - whether it outputs mono, stereo, or stereo when a parameter asks for it;
   - whether it shapes its own volume (later drum models, plucks);
   - default settings for the shared chain, such as one-shot for drums or mono for an acid engine.
3. **What an engine gets for each note:**
   - at the start: pitch, velocity, an accent mark, a seed number that makes any randomness repeat
     exactly, and the kind of start (new note, restart or legato). A sample restarts from Start
     (from End in reverse) with the new note's file, and the old sound fades out at its own volume
     within one 32-sample chunk while the new note starts, as a taken voice fades **(owner's
     choice)**; in legato it keeps its place and its file and only the pitch moves, as the EP-133's
     legato carries on from the same play position. A synth restart moves from the old note's volume
     to the new one's within one 32-sample chunk, so the level never steps **(owner's choice)**;
   - every 32-sample chunk: the current pitch with glide already applied, whether the note is held,
     and its parameter values, read through Foundation's single parameter-read step;
   - finally: release, or a stop when the voice is taken.
4. **What an engine returns:** its audio, with the channel count fixed when the note starts, plus
   "still sounding" or "finished". Samples report "finished" at their end; later drum models when
   they decay.
5. **Play modes belong to the voice, not the engine.** The engine only declares what it allows.
6. **Mono or stereo is fixed when a note starts.** A stereo voice runs two filter channels, and pan
   works as balance.
7. **Effect types describe themselves the same way:** a permanent ID and a name, their parameters in
   page order and which of them the encoders hold, stereo input and output, whether they follow the
   tempo, whether they are still ringing (so silent slots can be skipped), and a reset that clears
   their memory when a new type is picked for the slot. Delay and reverb are the first two types.
8. **Determinism.** All randomness comes from seeds derived from the input events, never from time.
   Engines and effects follow Foundation's number rules: the core's maths library, no fused
   multiply-add, tiny values flushed explicitly in every feedback path, no "not a number" values.

Engines that shape their own tone, such as FM operators or drum models, may later have internal
envelopes; the shared volume envelope still owns the final volume.

## Engines in part 1

### Virtual analog with supersaw

Covers the JD-Xi digital part's oscillator choices, and in mono with the sub oscillator its analog
part.

- **Main oscillator wave:** saw, pulse, triangle, sine or supersaw. A supersaw is 7 slightly detuned
  saws; their starting positions come from the note's seed.
- **Shape:** pulse width for the pulse, detune for the supersaw; no effect on the other waves.
- **Second oscillator:** the same wave as the first, with its own level, interval (−24 to +24
  semitones) and fine tune (−50 to +50 cents). Its entries are named Oscillator 2 level, Oscillator
  2 interval and Oscillator 2 fine tune, in full words; a name that does not fit scrolls under the
  cursor and is shortened with "…" elsewhere, as Look says.
- **Sub oscillator:** a square wave one octave below, with a level.
- **Noise level.**
- **Spread:** stereo width. At zero the voice is mono; above zero it is stereo, with the supersaw's
  saws or the two oscillators spread apart.
- **Clean high notes:** saw and pulse are generated band-limited (PolyBLEP), so high notes do not
  turn harsh.
- **Each hit:** the saw, pulse, triangle and sine waves, the sub oscillator and the second
  oscillator start every note at phase 0, so a sound hits the same way each time. The supersaw's
  seven saws and the noise start from a seed taken from the note, so they vary from hit to hit. A
  replay is identical either way.
- **Play modes:** poly by default; mono and legato allowed. Gate trigger by default.
- **Starting page,** one for the whole engine: wave, shape, spread, sub level, noise level, second
  oscillator level, interval, fine tune. The encoders hold wave, shape, spread and sub level
  **(owner's choice)**.

A supersaw voice costs about 3 to 5 times a basic voice; the worst-case tests count it.

### Sample player

- Plays one sample, mono or stereo as the file is. The sample is not scaled: a full-scale sample
  reads as ±1, so a default sample sound at velocity 127 plays as loud as its preview.
- **Start and end points; loop on or off,** with its own start and end. Each point is a frame of the
  sound's file, so a file's own loop stays exact **(owner's choice)**. One click moves 1/128 of the
  file's length and SHIFT a sixteenth of that. A point is shown as a percent of the length with one
  decimal ("4.2%"), so every fine click shows.
- **Points that would cross** each stop at the other **(owner's choice)**: Start stops one frame
  before End and End one frame after Start; Loop start and Loop end stop at each other the same way.
  Only the part of a loop that lies between Start and End plays.
- **Reverse** plays from End back to Start; with loop on, the loop runs backwards between its
  points. A loop always runs in one direction and never back and forth. The waveform on the page is
  not flipped.
- **Root note:** the note at which the sample plays unchanged, from 0 to 127, MIDI's range, as a
  note's pitch is (Project model). It is a count: one per click, and SHIFT changes nothing. It is
  shown as a note name with C4 for 60 and sharps as "#": "C4", "C#4" and "C−1" for 0, with the minus
  sign of signed values.
- **The pitch a pad plays:** in PADS mode a sample sound plays at its root note, so it sounds as
  recorded, while a synth stays at C4 (Workflow B). KEYS mode plays it chromatically from the root
  note, at the key's pitch.
- **Pitch changes** by reading faster or slower: the sample is read
  `2^((pitch + Transpose + Fine tune / 100 − Root note) / 12)` times as fast, with 4-point cubic
  Hermite interpolation: clean even far from the root note, at about four times the cost of the
  crudest method.
- A sample that is not looping reports "finished" at End (at Start in reverse) in either trigger,
  and the voice is free from then on. In gate trigger letting go releases the note, as for a synth.
- **A sample that ends by itself** (not looping, so it ends at End, or at Start in reverse) fades to
  silence over its last 1 ms, a straight fade, so its end never clicks **(owner's choice)**. A
  looping sample never ends and is unaffected.
- **Play modes:** poly, mono and legato allowed; poly by default.
- **Loop and trigger of a new sound:** a file without a loop gives Loop off and one-shot. A file
  with its own loop gives Loop on and gate, so the sound loops while the pad is held and fades after
  letting go **(owner's choice)**.
- **Starting page,** one for the whole engine: sample, start, end, loop on or off, loop start, loop
  end, reverse, root note. The encoders hold sample, start, end and loop on or off **(owner's
  choice)**.
- Sample audio is read through Foundation's "give me the next block" call.

### Velocity and recordings

Velocity works for every sound through the shared chain: it can set the volume and open the filter.
Several recordings per sound, mapped by note range and velocity ("multisampling" with velocity
layers), is only a realism refinement for recorded acoustic sounds; it comes with the first engine
after part 1.

### Later engines

Suggested order, each testing one part of the architecture:

1. Multisample zones: JD-Xi-style instrument sounds and drum kits with several recordings per sound.
2. Drum models: engines that shape their own volume.
3. Layers, up to 3 per sound.
4. Acid: a 303-style filter type, accent and slide.
5. FM with 4 operators.
6. Wavetable.
7. Macro oscillators, physical modelling and granular.

## Shared voice chain

Every layer of every note runs through this chain after its engine, the same for samples and synths.

1. **Filter.**
   - Type: part 1 ships one, a state-variable filter; ladder and 303-style types come later.
   - Mode: low-pass 12 dB, low-pass 24 dB, high-pass or band-pass.
   - Cutoff, resonance, key follow (higher notes open the filter more), envelope amount (up or
     down), velocity amount.
2. **Filter envelope:** attack, decay, sustain, release.
3. **Volume envelope:** attack, decay, sustain, release, and a velocity amount.
4. **Trigger mode.**
   - Gate: letting go starts the release.
   - One-shot: letting go is ignored, and a sample plays to its end **(owner's choice)**; the
     EP-133's one-shot too "plays the whole sample". The volume envelope's sustain counts as zero
     only when a note would never end by itself, a synth or a sample with Loop on, so that note
     always ends. Lowering Sustain still lets Decay shorten a drum.
   - Engines that shape their own volume keep the volume envelope fully open until they report
     "finished".
5. **Level and pan;** for stereo voices pan works as balance.
6. **Tuning:** transpose from −48 to +48 semitones and fine tune from −50 to +50 cents, as on the
   JD-Xi, for every sound. Each moves one unit per click, and SHIFT changes nothing on them.
7. **Play mode:** poly, mono, or mono with legato; a glide time; glide always or only between
   overlapping notes. Each engine declares which modes it allows.
   - Mono and legato sound the newest held key. Letting go of it goes back to the newest key still
     held; letting go of the last held key starts the release.
   - In mono every change of key, the return included, restarts the envelopes. In legato they keep
     running and only the pitch moves.
   - Glide works in mono and legato only. In poly the glide time and the glide choice stay on the
     page, keep their values and do nothing.
8. **Choke group:** none, or 1 to 8. A new note in a group fades out the other sounds of the same
   group, like a closed hi-hat cutting an open one. Choking works within a track, since a track's
   pad mapping is the equivalent of a kit.

**Starting pages,** written in code and expected to change. A page holds a whole group, however many
settings it has (Workflow A), and names which of them the four encoders hold. On SOUND, Workflow A's
PAD page comes before them and they keep this order:

- filter: mode, cutoff, resonance, envelope amount, key follow, velocity amount, type; the encoders
  hold mode, cutoff, resonance and envelope amount **(owner's choice)**;
- filter envelope: attack, decay, sustain, release; all four on the encoders;
- volume envelope: attack, decay, sustain, release, velocity amount, level, pan; the encoders hold
  attack, decay, sustain and release **(owner's choice)**;
- voice: play mode, glide time, glide always or only between overlapping notes, trigger mode, choke
  group, transpose, fine tune; the encoders hold play mode, glide time, glide always or only between
  overlapping notes and trigger mode **(owner's choice)**.

**Starting sound,** what NEW SYNTH puts on a pad, written in code and expected to change: a plain
open saw. The wave is saw and the filter is open: low-pass 24 dB, cutoff 100%, resonance 0%,
envelope amount +0 and key follow 0%. The volume starts at once, holds full while a key is held and
fades out over about 100 ms once it is let go; level 80%. The voice is poly with a gate trigger, a
glide time of 0 ms, no choke group and no transpose. Sub level, noise level, spread and the second
oscillator's level are 0. Every number is a constant tuned by ear.

## Voices

- **A fixed count of 32 voices** (owner's choice), provisional and recorded in the budget profile.
  Every voice slot exists from the start.
- When all voices are busy, a voice is taken in this order: finished voices, then the oldest
  released voice, then the oldest voice of the same sound, then the oldest voice overall.
- A taken voice fades out within one 32-sample chunk, never with a hard cut. The new note starts at
  its own chunk, never later; the taken voice's last chunk is mixed in that same chunk, with a
  straight fade to zero.
- A choked voice fades out as a taken voice does, in the chunk of the note that chokes it. Only
  other sounds of the group on the same track are choked.
- A mono sound uses one voice for each track that plays it, and that voice feeds the track; each
  layer of a note takes one voice.
- Every choice follows from the input events alone, so it is bit-identical everywhere.
- **A note's seed:** the audio part counts every note it starts; the count, mixed by a fixed 32-bit
  hash, is the note's seed.
- **No cost-based admission** (owner's choice). Instead, a test measures the worst case: all 32
  voices in the most expensive mode (stereo supersaw) plus every effect slot holding the most
  expensive effect. That cost goes into the budget profile, so when hardware is chosen it shows
  whether the hardware copes, or whether the voice count has to drop.
- **A preview player beside the 32 voices (owner's choice).** It plays the highlighted sample of the
  sample picker or the SAMPLES screen once, from the library in RAM, dry, at a fixed level, with no
  voice chain and no track effects, and joins the master after the master level (see "Mixing and
  master"). The level is not a setting: it starts at the level a sample sound plays at with default
  settings, so a preview sounds like the pad will, and is tuned by ear **(owner's choice)**. It is
  never one of the track voices, so previewing takes nothing from the music and nothing from the
  music can steal it. It plays when the arrows or − and + move the highlight onto a file, and it
  stops when the highlight leaves the file: onto another file, which starts that file's; onto a
  folder row, which plays nothing. Nothing else starts it: not opening the list; not coming back to
  it from the picker with DELETE or from a question; not a delete that moves the cursor; not moving
  onto the file being deleted while its delete runs. OK, CANCEL, STOP while stopped and leaving the
  SAMPLES screen fade it out within one 32-sample chunk; holding MENU or PAGE without choosing a
  screen does not. It works while the music plays. A file it plays to its end fades to silence over
  its last 1 ms, a straight fade, so its end never clicks, as a sample sound's does **(owner's
  choice)**; a stop keeps its own fade within one chunk.
- **STOP pressed while stopped silences everything in one step (owner's choice):** every sounding
  note fades out within one 32-sample chunk, as a taken voice does, instead of playing its release,
  the preview stops and every effect slot's memory on all tracks is cleared, applied by the audio
  part at a 32-sample chunk boundary, so the next sound starts from silence (Workflow B).

## Track effects

### Slots

- **Each track has 6 effect slots in series** (owner's choice). Any slot can hold any effect type,
  in any order, or nothing. An empty slot costs nothing.
- **Each slot reserves its own memory,** enough for the biggest effect, a 2-second stereo delay with
  echoes stored as 16-bit: a piece of 192,000 samples, about 0.4 MB per slot, about 9 MB for all 24
  slots. It is reserved when the core is built, as a memory of its own beside the sample RAM and the
  note memory and outside the library's budget, and listed in the budget profile as `effect_ram`.
  Only the audio part touches it. At first track 1's slots use the first six pieces in chain order,
  track 2's the next six, and so on. Picking a new type for a slot clears and reuses its memory;
  there is nothing to hand out, nothing that can fail, and no risk of the audio part reading memory
  that is being reassigned.
- **A clear writes nothing.** Each line of an effect counts the samples written since its clear, and
  a read further back than that gives 0, so STOP while stopped clears all 24 slots at a chunk
  boundary without wiping 9 MB.
- **A quiet slot is passed over.** An effect counts the samples since it last stored a sample that
  is not 0. Once that count reaches the span of its memory (a delay line's 96,000 samples; the
  reverb's 32,768 and its pre-delay's 4,800) it holds only zeros, so it sets its filter states to 0
  and is not ringing. A slot that is empty, or is not ringing while a chunk of its input is exactly
  0 on both sides, is passed over and leaves the track's signal as it is.
- **Moving an effect one place along the chain swaps the two slots whole** (owner's choice):
  settings and memory move together in one step, applied by the audio part at a 32-sample chunk
  boundary, so a ringing tail keeps ringing. Nothing is cleared. Since every slot reserves the same
  size, the swap only exchanges which reserved piece each slot uses; nothing is copied and nothing
  can fail.
- **Part 1 starts every track with delay in slot 1, reverb in slot 2** and the rest empty, so echoes
  go into the reverb. Everything can be rearranged.
- **Both start with their Level at 0** (owner's choice), so pads and the pattern sound dry in a new
  project; turning Level up brings in echoes and room, including echoes of what has just played.
- **Muting a track lets tails ring out** (owner's choice): muting stops only the notes the pattern
  plays on the track. While it is muted they do not start; those sounding fade with their own
  release, while echoes and reverb already sounding fade naturally. Pads and keys played by hand on
  a muted track still sound **(owner's choice)**, through the track's effects and level, and are
  recorded as usual; a note recorded this way stays silent when the pattern comes round to it, until
  the track is unmuted. Unmuting lets the pattern's next notes through; notes that would have
  started while muted are not caught up.

### Delay (effect type 1)

- **Time:** note values locked to the tempo, from 1/32 to a whole note (1/1), each straight, dotted
  or triplet **(owner's choice)**; the list does not depend on the time signature. No milliseconds
  in part 1. A triplet is written "1/8T" and a dotted value "1/8D", and the list is ordered by
  length, so turning right always makes the echo longer: 1/32T, 1/32, 1/16T, 1/32D, 1/16, 1/8T,
  1/16D, 1/8, 1/4T, 1/8D, 1/4, 1/2T, 1/4D, 1/2, 1/1T, 1/2D, 1/1, 1/1D **(owner's choice)**.
- **Feedback:** up to 98% in the loop, which is the item's 100%. A gentle limiter inside the loop,
  the master's soft clipper applied to the part fed back, turns high settings into long trails
  rather than an explosion.
- **Tone:** each echo gets a little darker, through a low-pass in the loop from 1 kHz at 0% to 16
  kHz at 100%, spread evenly over the octaves; a fixed low cut at 100 Hz in the loop stops bass from
  piling up.
- **Ping-pong:** a switch that bounces the echoes between left and right: the left line takes the
  input's mono sum and the right echo fed back, the right line the left echo fed back, so the echoes
  cross sides.
- **Level:** how loud the echoes are on top of the dry sound; the dry sound never drops.
- **Its page** holds all five; the encoders hold Time, Feedback, Tone and Level **(owner's
  choice)**.
- **Storage:** two lines, left and right, of 96,000 samples each, one in each half of the slot's
  piece. An echo is stored in 16 bits with headroom to ±4, so a loud mix with high feedback is held
  at the limit and never wraps round.
- **Changing the time or the tempo while echoes ring** crossfades to the new time in a straight line
  over 1,024 samples, with no click. A tape-style pitch glide can be a later mode.
- **The tempo reaches the delay while the music is stopped** as well as while it plays, so a tempo
  turned while stopped changes the time of the next echoes straight away: through the crossfade
  while echoes ring, and with no crossfade while the delay holds only silence.
- **Maximum time:** 2 seconds. A note value that would be longer at the current tempo plays as the
  longest note value in the list that fits **(owner's choice)**. The setting keeps the value the
  player picked and shows the value in use beside it, such as "1/1 (1/2)" at 60 BPM, which, like
  "1/1D (1/2D)", fits a strip cell; when the tempo rises far enough, the picked value comes back by
  itself. The value in use follows a tempo change through the same crossfade as any other change of
  time.
- Tempo-synced times are whole samples computed with integer maths, so no interpolation is needed.

Rejected: playing exactly 2 seconds; the echo would fall off the beat.

### Reverb (effect type 2)

- **Decay:** from a small room to a long hall: Rings's reverb time, from 0.4 at 0% to 0.98 at 100%.
- **Tone:** dark to bright: Rings's low-pass in the loop, from 0.2 to 0.9.
- **Pre-delay:** 0 to 100 ms of silence before the reverb starts, a mono line of 4,800 samples that
  crossfades to a new value as the delay's time does; at 0 the input goes straight in.
- **Level:** how loud the room is on top of the dry sound, as the delay's echoes are; the dry sound
  never drops.
- **Its page** holds all four, all on the encoders.
- **Fixed inside:** diffusion of 0.625 and Rings's input gain of 0.2 after the pre-delay; a one-pole
  low cut at 100 Hz on the input's mono sum so kicks and bass do not muddy the tail; and a very slow
  wobble of two internal oscillators, at 0.5 and 0.3 Hz, that keeps long tails from sounding
  metallic.
- **Design:** the reverb layout of Mutable Instruments' Rings module, MIT-licensed and the default
  reverb of the Deluge, with its ten lines, coefficients and 16-bit format, in one ring of 32,768
  samples of the slot's piece, at the 48 kHz Rings runs at. Mono in, stereo out. About 0.1 MB. The
  port keeps Rings's copyright and MIT notice.
- A brighter, wider plate reverb (Dattorro) can be a second reverb type later.

### Effect determinism

- Tiny values are flushed to zero on every write into a delay line or filter state.
- The wobble oscillators run from integer phase counters and are updated once per 32-sample chunk.
- Crossfade lengths are counted in whole samples; a new delay time is applied only after the
  previous crossfade has finished. A delay or a pre-delay holding only silence takes a new time at
  once, with no crossfade, so the first echo of a new or silent delay comes on time at full level.
- Effect memory is cleared at defined points: when a new type is picked for a slot, when a project
  loads and when STOP is pressed while stopped (Workflow B). A move swaps two slots' memory and
  clears nothing **(owner's choice)**.

### Later effect types

Distortion, fuzz and bit crushing; chorus, phaser and flanger; a tape-style delay; a plate reverb;
and others, each one more type that any slot can hold.

## Mixing and master

- **Per sound:** level and pan.
- **Per track:** effect slots, then level. Mute is not in the path: it stops the pattern's notes
  from starting (see "Track effects").
- **Master:** master level and a **soft clipper**, the last thing before the output volume, that
  rounds off anything too loud instead of cracking. It is fixed and has no look-ahead, so it is
  bit-identical everywhere (owner's choice). A master compressor can come later.
- **Levels start at 100%,** every track's and the master's, which multiply by exactly 1, so the mix
  changes nothing until a level is turned down. Default levels leave headroom, so that several loud
  voices together do not distort straight away; with the track and master levels starting at 100%,
  that headroom lies, as before, in the sounds' own default level (80%) and the output volume. A
  level glides over 128 samples and moves in a straight line across each chunk, as the output volume
  does.
- **Each voice, and each voice fading out, adds into its own track.** The four tracks are summed in
  track order before the master level, so the sum is the same in every build.
- **Two more sources join the master after the master level and before the soft clipper (owner's
  choice):** the sample preview, played by the preview player from the library in RAM (see "Voices")
  at a fixed level, and the metronome click from Workflow B at the metronome level set on SETTINGS.
  Track effects, mutes and the master level do not touch them. The one clipper protects everything,
  so nothing can crack at the output.
- **Output volume:** after the soft clipper, Workflow A's fifth encoder only turns the signal down.
  It is a device setting, not saved with projects, and part of the bit-identical output.
- The output is stereo at 48 kHz.

## Sample import

- **Accepted:** WAV files at 16, 24 or 32 bits (integer or floating point), any sample rate, mono or
  stereo. AIFF can come later. Only names ending in .wav, in any case, count: the other files of a
  drop are skipped and not mentioned. So is anything hidden: a name that starts with "." and
  everything inside a folder whose name starts with "." **(owner's choice)**.
- **Converted once, when imported,** by the core, so a device imports exactly the same way:
  - high-quality conversion to 48 kHz;
  - mono or stereo kept as in the file;
  - rounded to 16-bit without random dither, so it is exactly repeatable;
  - the file's sampler information rescaled to 48 kHz and kept in the converted file, with loop ends
    inclusive; loop types other than forward are read as forward;
  - one private chunk written before the audio data: the original file name and a 128-bit
    fingerprint of the converted audio (Project model);
  - the converted copy saved to storage and placed in RAM, where the whole library lives
    (Foundation); projects refer to it.
- **The root note** comes from the file's sampler information (the WAV `smpl` chunk), otherwise from
  a note name in the file name such as `Bass_C2.wav`, otherwise C4. It can always be changed. There
  is no automatic pitch detection in part 1.
- **Loop points** come from the file's sampler information too. The import reads only the first 64
  KB of a file, so a file whose sampler information lies after that point, as it does after long
  audio, imports without it: the root note comes from the name or is C4, and there is no loop
  **(owner's choice)**.
- **The file's root note and loop points are the defaults a new sound takes;** the sound's own
  values live in the project (Project model).
- **Names.** Import cleans each file name down to a small set of safe characters. A name that is
  already taken in its folder, ignoring case, is replaced by the dropped file, whatever its sound:
  nothing is compared and nothing is numbered **(owner's choice)**. The Project model has the rules.
- **Length and size.** Import gives each file a length and a size, which the sample picker, POOL and
  the SAMPLES screen show (Workflow A, Project model).
- **Import is the only place a sample is refused.** A file is refused with a clear message in three
  cases **(owner's choice)**: the device cannot read it (8-bit, compressed, more than two channels
  or damaged), "kick.wav not imported: can't be read"; the library is full, whether in the sample
  RAM, in files or in folders, "kick.wav not imported: library full"; or storage is full, since the
  converted file would reach into the storage reserve or storage fills up while it is being written,
  "kick.wav not imported: storage full". Over several files the header counts them and lists each
  reason once, "5 files imported, 3 not: library full, can't be read" (Look). The other files of a
  dropped folder still import. The picker never refuses a sample, since everything in the library is
  already in RAM.

## Parameters

Every parameter uses Foundation's master list: a permanent ID, a whole-number value, a curve and a
display unit. Sound contributes:

- engine parameters, addressed by sound, layer and engine;
- shared chain parameters, addressed by sound and layer;
- effect parameters, addressed by track and slot, and by the effect type in that slot;
- track level and mute, and master level.

Ranges, curves and glide times are tuning decisions made while building and changed freely by ear.

## Testing

On top of Foundation's testing:

- every engine, wave mode and effect type has its own drift scenes;
- a worst-case scene (32 stereo supersaw voices, the preview player and every slot holding the most
  expensive effect) records the operation count that goes into the budget profile **(owner's
  choice)**;
- scenes cover voice stealing, choke groups, mono legato and glide, one-shot and gate triggers,
  effect type changes in slots, tails ringing out after a mute and a pad hit on a muted track
  sounding;
- a scene moves a ringing effect one place along the chain and its tail does not break;
- a scene slows the tempo until the delay's picked time is longer than 2 seconds; the longest note
  value that fits plays, and the picked value returns when the tempo rises;
- a scene presses STOP while stopped over sounding notes, ringing tails and the sample preview; all
  of it goes silent in one step and the next note starts from silence;
- a scene plays the metronome click and the sample preview over a loud mix, and the soft clipper
  catches the sum;
- a scene imports a file into an almost full library; the import is refused with its message and the
  library is unchanged;
- a scene previews samples in the picker while all 32 voices play; no track voice is taken and the
  preview is heard.

## Changes to the part 1 overview

Applied to the overview together with this spec:

- "Effects" is no longer a non-goal: part 1 has delay and reverb in per-track effect slots.
- The Sound part of the decision register points to this spec; its open questions are answered here.

## Assumptions about other specs

- **Foundation:** the budget profile gains the voice count (32, plus the preview player), the effect
  slot memory (about 9 MB) and the worst-case operation count from the tests; effect memory is a
  memory of its own beside the sample RAM and the note memory, outside the library's sample RAM.
- **Workflow A:** decides how sounds, engines and samples are created and chosen; what a page is,
  how the engine, chain and effect pages are reached and how every item on them is reached without
  an encoder; how effect types are chosen per slot and slots reordered; velocity for inputs that
  have none; and where master level lives on the panel.
- **Workflow B:** decides how overlapping notes or slides are entered for mono legato and glide;
  whether accent marks exist in part 1 (engines receive them, part 1's engines ignore them); and
  confirms that delay times follow tempo changes.
- **Project model:** stores sound parameters with layer-addressed IDs and effect parameters with
  slot-addressed IDs; decides whether track effects belong to a pattern or the project; refers to
  the converted sample files, with their root note and loop points; loads the library into RAM at
  start-up and frees a file's RAM when it is deleted.
- **Look:** draws the engine, chain and effect pages, scrolling where they do not fit, marks the
  items the encoders hold, and draws any meters.

## Research sources

- **Roland JD-Xi:**
  [owner's manual](https://www.manualsdir.com/manuals/850318/roland-jd-xi-analog_digital-synthesizer-black.html?page=8);
  [parameter guide](https://static.roland.com/assets/media/pdf/JD-Xi_ParameterGuide_e01_W.pdf);
  [JDXI-Editor](https://github.com/markxbrooks/JDXI-Editor).
- **Engine interfaces:**
  [Plaits engine and voice](https://github.com/pichenettes/eurorack/tree/master/plaits/dsp);
  [Korg logue SDK](https://github.com/korginc/logue-sdk);
  [Surge XT](https://github.com/surge-synthesizer/surge);
  [Deluge firmware](https://github.com/SynthstromAudible/DelugeFirmware).
- **Instruments:** [OP-XY guide](https://teenage.engineering/guides/op-xy/synth-engines);
  [Elektron Digitakt II manual](https://www.elektron.se/wp-content/uploads/2026/10/Digitakt-2-User-Manual_ENG_OS1.17_260930.pdf);
  [M8 operation manual](https://cdn.shopify.com/s/files/1/0455/0485/6229/files/m8_operation_manual_v20260421.pdf?v=1776791699);
  [Polyend Tracker+ manual](https://polyend-website.fra1.digitaloceanspaces.com/wp-content/uploads/2024/05/29122414/Polyend-TrackerPlus-Manual-1v2v0a.pdf);
  [MPC Sample guide](https://www.akaipro.com/guides/mpc-sample/sample_mode.htm).
- **Effects:** [Rings reverb](https://github.com/pichenettes/eurorack/tree/master/rings/dsp);
  [Roland TR-8S reference](https://static.roland.com/assets/media/pdf/TR-8S_Reference_eng04_W.pdf);
  [Roland MC-101 reference](https://static.roland.com/assets/media/pdf/MC-101_Reference_eng01_W.pdf);
  [Octatrack MKII manual](https://www.elektron.se/wp-content/uploads/2026/08/Octatrack-MKII-User-Manual_ENG_OS1.40C_260827.pdf).
- **DSP:**
  [PolyBLEP oscillator](https://www.martin-finke.de/articles/audio-plugins-018-polyblep-oscillator/);
  [Hermite interpolation](https://www.musicdsp.org/en/latest/Other/93-hermite-interpollation.html);
  [WAV smpl chunk](https://www.recordingblogs.com/wiki/sample-chunk-of-a-wave-file).
