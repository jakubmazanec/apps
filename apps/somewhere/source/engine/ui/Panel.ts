import {LayoutContainer} from '@pixi/layout/components';
import type * as pixi from 'pixi.js';

import {createBackground} from './createBackground.js';
import {type UiChild, type UiParent} from './UiChild.js';
import {type UiTheme} from './UiTheme.js';

export type PanelOptions = {
  background?: pixi.Container;
  theme?: UiTheme;
  children?: UiChild[];
  layout?: pixi.ContainerOptions['layout'];
};

export class Panel implements UiParent {
  /** TBD */
  readonly children: UiChild[] = [];

  /** TBD */
  readonly view: LayoutContainer;

  /** TBD */
  readonly #disposables = new DisposableStack();

  constructor({background, theme, children, layout}: PanelOptions) {
    let resolved = background ?? (theme && createBackground(theme.panel.background));

    this.view = new LayoutContainer(resolved === undefined ? {} : {background: resolved});

    if (children !== undefined) {
      this.addChild(...children);
    }

    this.view.layout = {
      ...(typeof layout === 'object' ? layout : undefined),
    };

    this.#disposables.defer(() => this.view.destroy({children: true}));
  }

  /** TBD */
  addChild(...children: UiChild[]): this {
    for (let child of children) {
      this.children.push(child);
      this.view.addChild('view' in child ? child.view : child);
    }

    return this;
  }

  /** TBD */
  destroy() {
    for (let child of this.children) {
      if ('view' in child) {
        child.destroy?.();
      }
    }

    this.#disposables.dispose();
  }

  /** TBD */
  removeChild(...children: UiChild[]): this {
    for (let child of children) {
      let index = this.children.indexOf(child);

      if (index !== -1) {
        this.children.splice(index, 1);
      }

      this.view.removeChild('view' in child ? child.view : child);
    }

    return this;
  }
}
