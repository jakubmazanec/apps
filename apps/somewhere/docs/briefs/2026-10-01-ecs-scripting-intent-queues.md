# Scripting through per-entity intent queues: brief

Date: 2026-10-01 App: `apps/somewhere` Status: brief, not yet a design. Second of several
approaches to scripted sequences being compared; see `2026-10-01-ecs-scripting.md` for the
command-and-completion-channel approach (A). This is approach B.

## Problem

Same as approach A: time-based logic is spread over the `Scheduler`, `Timer`/`Tween` components and
hand-written state machines such as `BehaviorComponent`, and linear scripted sequences have no home.
Whatever is added must be built on the existing ECS APIs.

## Idea

There is no script runner. Each actor carries a queue of intents as data, and the existing systems
work through the head of that queue, like orders queued for a unit in a strategy game.

```ts
export const AgendaComponent = defineComponent<{queue: Intent[]}>();

mira.getComponent(AgendaComponent).queue.push(
  {type: 'moveTo', target: door},
  {type: 'wait', ms: 300},
  {type: 'signal', name: 'miraAtDoor'},
);
director.getComponent(AgendaComponent).queue.push(
  {type: 'awaitSignal', name: 'miraAtDoor'},
  {type: 'say', dialogue: 'miraIntro'},
);
```

- Systems read the head of the queue. `motionSystem` acts when the head is `moveTo`: it sets the
  target and pops the intent when it clears that target. `dialogueSystem` does the same for `say`.
- A small `agendaSystem` handles the generic intents: `wait`, `signal` and `awaitSignal`.
- Systems communicate through component data. The only new channel carries `Signal{name}` events,
  which queues use to coordinate.
- Work that belongs to no actor (dialogue, fades, the camera) goes on a singleton director entity,
  the camera and dialogue singleton pattern.
- Component sets stay fixed: factories give characters an empty `AgendaComponent`, as popups get
  empty `TimerComponent` and `TweenComponent`.

## Consequences

- NPC AI becomes "refill the queue": `behaviorSystem` pushes `moveTo` plus `wait` for the next
  stroll when the queue is empty. Cutscenes and AI share one mechanism; a cutscene takes over an
  NPC by replacing its queue.
- Tap-to-move can be a `moveTo` intent on the player's queue.
- Pause, quit and saving come from the ECS: a paused world runs no systems, `World.stop()` removes
  the entities with their queues, and saved state is the queues themselves.
- Interrupting an actor is clearing its queue.

## Compared with approach A

| | A: command channels | B: intent queues |
| --- | --- | --- |
| Where the script lives | One script entity | Spread across actor queues |
| How systems are driven | Command events in, completion events out | Read the queue head, pop it when done |
| Coordinating actors | Easy: one linear program | Needs signals between queues |
| NPC AI | Separate, `behaviorSystem` unchanged | Same mechanism: AI refills the queue |
| Changes to systems | A channel pair per scriptable system | Intent types plus the head-only rule |
| Interrupting | Cancel the script, then stop actors | Clear the actor's queue |
| Saving | Program plus cursor | The queues |
| Main risk | Locks so AI doesn't fight the script | Two systems acting on one queue; a scene readable only across queues |

A suits authored, story-driven sequences; B suits a game whose scripting is mostly NPC behaviour.
They combine: B as the per-entity mechanism, with A's linear program filling queues as its one
instruction.

## Open questions

- Ownership of the head: how to guarantee exactly one system handles each intent type, and what
  happens to an intent type no system handles.
- Whether the player's queue is cleared by direct input (keyboard movement overrides `moveTo`).
- Signal scope: global names, or names scoped to the cutscene that filled the queues.
- Whether one actor ever needs parallel intents (walk while playing an animation).
