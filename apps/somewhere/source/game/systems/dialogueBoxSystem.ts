import * as pixi from 'pixi.js';

import {DialogueBox} from '../../engine/dialogue/DialogueBox.js';
import {type DialogueNode} from '../../engine/dialogue/DialogueScript.js';
import {System} from '../../engine/ecs/System.js';
import {type Spriteset} from '../../engine/graphics/Spriteset.js';
import {CameraComponent} from '../components/CameraComponent.js';
import {DialogueComponent} from '../components/DialogueComponent.js';
import {GraphicsComponent} from '../components/GraphicsComponent.js';
import {MotionComponent} from '../components/MotionComponent.js';
import {TriggerComponent} from '../components/TriggerComponent.js';
import {assets} from '../core/assets.js';
import {type Flags} from '../core/flags.js';
import {game} from '../core/game.js';
import {playSoundChannel} from '../core/playSoundChannel.js';
import {DialogueCommand} from '../events/DialogueCommand.js';
import {dialogueCommandChannel} from '../events/dialogueCommandChannel.js';
import {PlaySoundEvent} from '../events/PlaySoundEvent.js';
import {cameraQuery} from '../queries/cameraQuery.js';
import {dialogueQuery} from '../queries/dialogueQuery.js';
import {findPromptEntity} from '../utilities/findPromptEntity.js';

const MARKER_BLINK_MS = 500;
const BLIP_EVERY_GLYPHS = 3;
// A frame revealing this many characters is an advance-skip: one blip at most.
const SKIP_THRESHOLD = 4;
const BOX_METRICS = {
  margin: 4,
  padding: 3,
  gap: 3,
  portraitSize: 32,
  choiceGap: 2,
  choiceMinHeight: 10,
  height: 64,
  collapseWidth: 200,
};
// Module state, reset in onDetach (the world.ts mapEntity precedent).
let layer: pixi.Container | null = null;
let box: DialogueBox | null = null;
let prompt: pixi.Sprite | null = null;
let shownNode: DialogueNode<Flags, string> | null = null;
let shownPageIndex = -1;
let hasBuiltChoices = false;
let shownSelectedIndex = -1;
let lastRevealedCount = 0;
let blipGlyphCounter = 0;
let markerAccumulator = 0;
let lastScreenWidth = 0;
let lastScreenHeight = 0;

function resetSyncState(): void {
  shownNode = null;
  shownPageIndex = -1;
  hasBuiltChoices = false;
  shownSelectedIndex = -1;
  lastRevealedCount = 0;
  blipGlyphCounter = 0;
  markerAccumulator = 0;
  lastScreenWidth = 0;
  lastScreenHeight = 0;
}

function createBox(): DialogueBox {
  return new DialogueBox({
    theme: game.theme,
    font: game.theme.text.body,
    metrics: BOX_METRICS,
    markerTexture: assets.spriteset('ui').texture('advance-marker'),
    onAdvanceTap: () => {
      dialogueCommandChannel.push(new DialogueCommand({type: 'advance'}));
    },
    onChooseTap: (index) => {
      dialogueCommandChannel.push(new DialogueCommand({type: 'choose', index}));
    },
    onChoiceHover: (index) => {
      dialogueCommandChannel.push(new DialogueCommand({type: 'select', index}));
    },
  });
}

function resolvePortrait(name: string | undefined): pixi.Texture | undefined {
  if (name === undefined) {
    return undefined;
  }

  // Existence probe: GameAssets.texture throws on a missing frame in dev and
  // prod alike, so the probe comes first; a miss warns loud and the box
  // renders collapsed.
  let spriteset = pixi.Assets.get<Spriteset | undefined>('portraits');
  let texture = spriteset?.textures[name];

  if (texture === undefined) {
    // eslint-disable-next-line no-console -- loud show-time failure with a prod fallback (collapsed layout)
    console.warn(
      `Portrait "${name}" is missing from the portraits spriteset! Rendering collapsed.`,
    );

    return undefined;
  }

  return texture;
}

function countGlyphs(page: string, from: number, to: number): number {
  let count = 0;

  for (let index = from; index < to; index++) {
    let character = page[index];

    // Spaces never blip; the box's injected newlines replace spaces, so this
    // also covers them (counts run over the authored page text).
    if (character !== ' ' && character !== '\n') {
      count += 1;
    }
  }

  return count;
}

export const dialogueBoxSystem = new System({
  displayName: 'Dialogue box system',
  // The trigger entities: the set the interact prompt resolves against.
  components: [TriggerComponent],
  onUpdate: (ticker, system) => {
    let {active} = dialogueQuery.getFirst().getComponent(DialogueComponent);
    let screenWidth = game.app.screen.width / game.pixelScale;
    let screenHeight = game.app.screen.height / game.pixelScale;

    if (layer === null) {
      // Lazy: attached on first update so it lands above map.view, which is
      // added in world.onStart after every addSystem has run.
      layer = new pixi.Container();
      system.view.addChild(layer);
    }

    if (active === null) {
      if (box !== null) {
        box.destroy();
        box = null;
        resetSyncState();
      }

      // The prompt shows only while no dialogue is active; the shared
      // resolution keeps the bubble pointing at exactly what an interact
      // press would start (the npc stood in, or the sign zone stood near).
      let promptEntity = findPromptEntity(system.entities);

      if (promptEntity === null) {
        if (prompt !== null) {
          prompt.visible = false;
        }

        return;
      }

      let motion = promptEntity.getComponent(MotionComponent);
      let graphics = promptEntity.getComponent(GraphicsComponent);

      if (prompt === null) {
        prompt = new pixi.Sprite({texture: assets.spriteset('prompt-bubble').texture('bubble')});
        prompt.eventMode = 'static';
        prompt.cursor = 'pointer';
        prompt.on('pointertap', (event) => {
          event.stopPropagation();
          dialogueCommandChannel.push(new DialogueCommand({type: 'interact'}));
        });
        layer.addChild(prompt);
      }

      let {position: cameraPosition} = cameraQuery.getFirst().getComponent(CameraComponent);

      // The layer is not inside map.view, so unlike graphicsSystem sprites
      // there is no map offset to subtract; camera only.
      prompt.visible = true;

      if (motion !== undefined && graphics !== undefined) {
        // An npc: float over the sprite's head.
        let {boundingBox} = graphics;

        prompt.position.set(
          motion.position.x +
            boundingBox.x +
            boundingBox.width / 2 -
            prompt.width / 2 -
            cameraPosition.x,
          motion.position.y + boundingBox.y - prompt.height - 1 - cameraPosition.y,
        );
      } else {
        // A zone (the sign): float over the trigger rect itself.
        let {rect} = promptEntity.getComponent(TriggerComponent);

        prompt.position.set(
          rect.x + rect.width / 2 - prompt.width / 2 - cameraPosition.x,
          rect.y - prompt.height - 1 - cameraPosition.y,
        );
      }

      return;
    }

    if (prompt !== null) {
      prompt.visible = false;
    }

    if (box === null) {
      box = createBox();

      // The Modal precedent: the box opens into the screen's ui and holds a
      // focus scope, so focus commands stay on its choices (or nothing) and
      // never wander to HUD widgets. Headless harnesses without a screen fall
      // back to the world layer; the box works there minus keyboard focus.
      let ui = game.currentScreen?.ui;

      if (ui === undefined) {
        layer.addChild(box.view);
      } else {
        box.open(ui);
      }

      resetSyncState();
    }

    if (screenWidth !== lastScreenWidth || screenHeight !== lastScreenHeight) {
      lastScreenWidth = screenWidth;
      lastScreenHeight = screenHeight;
      box.resize(screenWidth, screenHeight);
      active.setBreaks(box.breaks);
    }

    // Node or page change; a reveal-count decrease covers re-entering the
    // same node (its object reference would not change).
    if (
      active.node !== shownNode ||
      active.pageIndex !== shownPageIndex ||
      active.revealedCount < lastRevealedCount
    ) {
      shownNode = active.node;
      shownPageIndex = active.pageIndex;
      hasBuiltChoices = false;
      shownSelectedIndex = -1;
      lastRevealedCount = 0;
      blipGlyphCounter = 0;
      box.showNode({
        speaker: active.node?.speaker,
        portraitTexture: resolvePortrait(active.node?.portrait),
        page: active.pageText,
        // The runner resolves the visible choices at node entry, so the box
        // can reserve their column now rather than grow when they appear.
        choices: active.visibleChoices.map((choice) => choice.text),
      });
      active.setBreaks(box.breaks);
    }

    if (active.phase === 'choosing') {
      if (hasBuiltChoices) {
        if (shownSelectedIndex !== active.selectedIndex) {
          shownSelectedIndex = active.selectedIndex;
          box.setSelected(active.selectedIndex);
        }
      } else {
        hasBuiltChoices = true;
        shownSelectedIndex = active.selectedIndex;
        box.setChoices(
          active.visibleChoices.map((choice) => choice.text),
          active.selectedIndex,
        );
      }

      // Keyboard focus is a selection producer like hover: a focused choice
      // that differs from the runner's selection pushes select, and the
      // runner-side sync above pulls focus along on W/S moves, so the two can
      // only disagree for the one frame the command is in flight.
      let focusIndex = box.focusedChoiceIndex;

      if (focusIndex !== -1 && focusIndex !== active.selectedIndex) {
        dialogueCommandChannel.push(new DialogueCommand({type: 'select', index: focusIndex}));
      }
    }

    let revealed = active.revealedCount;
    let newlyRevealed = revealed - lastRevealedCount;

    if (newlyRevealed > 0) {
      box.setRevealed(revealed);

      let glyphs = countGlyphs(active.pageText, lastRevealedCount, revealed);

      if (newlyRevealed >= SKIP_THRESHOLD) {
        // An advance-skip reveals a whole stretch in one frame: at most one blip.
        if (glyphs > 0) {
          playSoundChannel.push(new PlaySoundEvent({name: 'blip'}));
        }

        blipGlyphCounter = 0;
      } else {
        blipGlyphCounter += glyphs;

        if (blipGlyphCounter >= BLIP_EVERY_GLYPHS) {
          blipGlyphCounter %= BLIP_EVERY_GLYPHS;
          playSoundChannel.push(new PlaySoundEvent({name: 'blip'}));
        }
      }

      lastRevealedCount = revealed;
    }

    // Marker blink on accumulated world time; a paused world freezes it
    // because this system simply does not run.
    markerAccumulator += ticker.deltaMS;
    box.setAdvanceMarker(
      active.phase === 'idle' && Math.floor(markerAccumulator / MARKER_BLINK_MS) % 2 === 0,
    );
  },
  onDetach: (system) => {
    // World.view is reused across runs; a mid-dialogue Quit must not orphan
    // the layer, the box or the prompt. box.destroy detaches its view, so the
    // layer teardown never double-destroys it; the prompt dies with the layer.
    box?.destroy();
    box = null;
    prompt = null;

    if (layer !== null) {
      system.view.removeChild(layer);
      layer.destroy({children: true});
      layer = null;
    }

    resetSyncState();
  },
});
