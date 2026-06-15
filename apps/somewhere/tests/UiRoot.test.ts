import type * as pixi from 'pixi.js';
import {afterEach, describe, expect, test, vi} from 'vitest';

vi.mock('pixi.js', () => ({
  Container: class Container {
    children: Container[] = [];
    parent: Container | null = null;
    visible = true;
    listeners: Record<string, (event: unknown) => void> = {};

    addChild(child: Container) {
      // eslint-disable-next-line no-param-reassign -- mock mirrors Pixi's parent linkage
      child.parent = this;
      this.children.push(child);

      return child;
    }

    addChildAt(child: Container, index: number) {
      // eslint-disable-next-line no-param-reassign -- mock mirrors Pixi's parent linkage
      child.parent = this;
      this.children.splice(index, 0, child);

      return child;
    }

    removeChild(child: Container) {
      let index = this.children.indexOf(child);

      if (index !== -1) {
        this.children.splice(index, 1);
      }

      return child;
    }

    addEventListener(type: string, listener: (event: unknown) => void) {
      this.listeners[type] = listener;
    }

    removeEventListener(type: string) {
      delete this.listeners[type];
    }

    getBounds() {
      return {x: 0, y: 0, width: 0, height: 0};
    }

    toLocal(point: {x: number; y: number}) {
      return point;
    }

    destroy() {}
  },
  NineSliceSprite: class NineSliceSprite {
    visible = true;
    width = 0;
    height = 0;
    texture: unknown;

    position = {
      x: 0,
      y: 0,
      set(x: number, y: number) {
        this.x = x;
        this.y = y;
      },
    };

    constructor(options: {texture: unknown}) {
      this.texture = options.texture;
    }

    setSize(width: number, height: number) {
      this.width = width;
      this.height = height;
    }
  },
  Assets: {get: vi.fn(() => ({}))},
}));

const {UiRoot} = await import('../source/engine/ui/UiRoot.js');
const {Container} = await import('pixi.js');

const FOCUS_RING = {
  assetName: 'focus-ring',
  bottomHeight: 4,
  leftWidth: 4,
  padding: 8,
  rightWidth: 4,
  topHeight: 4,
};

type MockContainer = {
  addChild: (child: MockContainer) => MockContainer;
  children: MockContainer[];
  getBounds: () => {height: number; width: number; x: number; y: number};
  listeners: Record<string, (event: unknown) => void>;
};

let roots: Array<{destroy: () => void}> = [];

function createRoot(options?: ConstructorParameters<typeof UiRoot>[0]) {
  let root = new UiRoot(options);

  roots.push(root);

  return root;
}

// A focusable leaf component over a mock pixi view.
function focusable(bounds?: {height: number; width: number; x: number; y: number}) {
  let resolvedBounds = bounds ?? {x: 0, y: 0, width: 10, height: 10};
  let view = new Container() as unknown as MockContainer;

  view.getBounds = () => resolvedBounds;

  return {
    view: view as unknown as pixi.Container,
    isFocusable: true,
    activate: vi.fn(),
  };
}

describe('UiRoot', () => {
  afterEach(() => {
    for (let root of roots) {
      root.destroy();
    }

    roots = [];
    vi.restoreAllMocks();
  });

  describe('children', () => {
    test('tracks components and keeps the focus ring overlay topmost', () => {
      let root = createRoot();
      let view = root.view as unknown as MockContainer;
      let overlay = view.children[0];
      let a = focusable();
      let b = new Container();

      root.addChild(a, b as unknown as pixi.Container);

      expect(root.children).toEqual([a, b]);
      expect(view.children).toEqual([a.view, b, overlay]);

      root.removeChild(a);

      expect(root.children).toEqual([b]);
      expect(view.children).toEqual([b, overlay]);
    });
  });

  describe('pointer interplay', () => {
    test('a tap inside a focusable component silently focuses it', () => {
      let root = createRoot();
      let view = root.view as unknown as MockContainer;
      let component = focusable();
      let inner = new Container();

      (component.view as unknown as MockContainer).addChild(inner as unknown as MockContainer);
      root.addChild(component);

      view.listeners.pointertap?.({target: inner});

      expect(root.focused).toBe(component);
    });

    test('a tap outside any focusable changes nothing', () => {
      let root = createRoot();
      let view = root.view as unknown as MockContainer;
      let plain = new Container();

      root.addChild(plain as unknown as pixi.Container);

      view.listeners.pointertap?.({target: plain});

      expect(root.focused).toBeNull();
    });
  });

  describe('focus ring', () => {
    test('draws the ring around the focused component after a focus command', () => {
      let root = createRoot({focusRing: FOCUS_RING});
      let view = root.view as unknown as MockContainer;
      let component = focusable({x: 100, y: 50, width: 40, height: 20});

      root.addChild(component);
      root.focusNext();
      root.update();

      let overlay = view.children.at(-1) as MockContainer;
      let ring = overlay.children[0] as unknown as {
        height: number;
        position: {x: number; y: number};
        visible: boolean;
        width: number;
      };

      expect(ring.visible).toBeTruthy();
      expect(ring.position).toMatchObject({x: 92, y: 42});
      expect(ring.width).toBe(56);
      expect(ring.height).toBe(36);
    });

    test('a global pointerdown hides the ring but keeps focus', () => {
      let root = createRoot({focusRing: FOCUS_RING});
      let view = root.view as unknown as MockContainer;
      let component = focusable();

      root.addChild(component);
      root.focusNext();
      root.update();

      globalThis.dispatchEvent(new Event('pointerdown'));
      root.update();

      let overlay = view.children.at(-1) as MockContainer;
      let ring = overlay.children[0] as unknown as {visible: boolean};

      expect(ring.visible).toBeFalsy();
      expect(root.focused).toBe(component);
    });

    test('clearFocus hides the ring and clears focus', () => {
      let root = createRoot({focusRing: FOCUS_RING});
      let view = root.view as unknown as MockContainer;
      let component = focusable();

      root.addChild(component);
      root.focusNext();
      root.update();
      root.clearFocus();
      root.update();

      let overlay = view.children.at(-1) as MockContainer;
      let ring = overlay.children[0] as unknown as {visible: boolean};

      expect(ring.visible).toBeFalsy();
      expect(root.focused).toBeNull();
    });

    test('destroy removes the global pointerdown listener', () => {
      let removeSpy = vi.spyOn(globalThis, 'removeEventListener');
      let root = new UiRoot();

      root.destroy();

      expect(removeSpy.mock.calls.filter(([type]) => type === 'pointerdown')).toHaveLength(1);
    });
  });
});
