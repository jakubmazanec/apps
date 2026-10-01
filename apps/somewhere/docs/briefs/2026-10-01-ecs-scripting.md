# Scripting through command and completion channels: brief

Date: 2026-10-01 App: `apps/somewhere` Status: brief, not yet a design. One of several approaches
to scripted sequences (cutscenes, scripted NPCs, travel transitions) being compared.

## Problem

Time-based logic is spread over three mechanisms: the per-screen `Scheduler`, `Timer` and `Tween`
inside components, and hand-written state machines such as `BehaviorComponent`. A linear sequence
like "Mira walks to the door, waits, talks, then the screen fades" has no home. Whatever is added
must be built on the existing ECS APIs: `Entity` with a fixed component set, `System` hooks,
`EventChannel` and the `{channel, event}` completions of `Timer`, `Tween` and `Sprite`.

## Idea

A script issues commands the same way the player does. The player never calls a system:
`dialogueInputSystem` turns input into `DialogueCommand` events and `dialogueSystem` acts on them.
A script pushes commands onto channels and waits for completion events. The systems doing the work
can't tell a player, an NPC or a cutscene apart.

### 1. Scriptable systems expose a command channel and a completion channel

- `motionSystem` accepts `MoveTo{entity, target}`. Where it clears a set target (on arrival and
  when fully blocked alike), it pushes `MotionFinished{entity, reason: 'arrived' | 'blocked'}`.
  `behaviorSystem` can consume that event instead of polling `motion.target === undefined`.
- `dialogueSystem` accepts a `{type: 'start', name}` `DialogueCommand` and pushes
  `DialogueEnded{name, choice}` when `active` ends. Every dialogue decision stays in
  `dialogueSystem`.
- `Sprite` one-shots, `Timer` and `Tween` already deliver `{channel, event}` completions and need
  no change.

The new completion events are useful outside scripts: NPC AI, sound effects and achievements can
listen to them too.

### 2. One `ScriptComponent` and one `scriptSystem`

A running script is one entity. Its program is plain data; `scriptSystem` walks it with a cursor.
The engine defines four instructions:

- `push(channel, event)`: fire and forget.
- `waitFor(channel, match?)`: resume when a matching event is on the channel.
- `request(commandChannel, command, completionChannel, match?)`: `push` then `waitFor`.
- `sleep(ms)`: resume after world time has passed.

Game-specific steps are one-line helpers built from those:

```ts
let walkTo = (entity: Entity, target: Vector) =>
  request(
    moveToChannel,
    new MoveTo({entity, target}),
    motionFinishedChannel,
    (event) => event.entity === entity,
  );

world.addEntity(
  new Entity({
    components: [
      new ScriptComponent({
        blocksInput: true,
        program: [
          walkTo(mira, door),
          sleep(300),
          request(
            dialogueCommandChannel,
            new DialogueCommand({type: 'start', name: 'miraIntro'}),
            dialogueEndedChannel,
          ),
          push(playSoundChannel, new PlaySoundEvent({name: 'chime'})),
        ],
      }),
    ],
  }),
);
```

## What the existing ECS already provides

- Pause: a paused world runs no systems, so scripts stop.
- Cancel: `world.removeEntity(script)`.
- Quit: `World.stop()` removes the script with everything else.
- Input lock: a query over running scripts; `playerSystem` checks `blocksInput` as it already
  checks `dialogueQuery`. The lock ends when the script entity is removed.
- Timing: a wait resolves one frame after its event, like every other event flow. Deterministic.
- Saving: the program is data, so script state is the program plus the cursor.
- No runtime component changes are needed.

## Branching

Only scripts that branch (for example on a dialogue choice) need more. The program can then be a
generator yielding the same instructions; `scriptSystem` resumes it with the event it waited for.
Everything else stays the same. Such a script can't be saved mid-run.

## Open questions

- Engine and game split: the instructions, `ScriptComponent` and `scriptSystem` belong to the
  engine; channels and helpers such as `walkTo` belong to the game.
- Placement of `scriptSystem` in the system order, and how `MoveTo` interacts with
  `behaviorSystem` writing `motion.target` for strolling NPCs (skip actors of running scripts?).
- Whether a cancelled script should push stop commands (for example stop a walking actor).
- Parallel steps (`all([...])`) in the first version or later.
- How scripts start: any system adds a script entity, for example on `TriggerEnter`.
