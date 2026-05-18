// TODO: remove this
declare module '@pixi/layout/components' {
  import {Container, type ContainerChild} from 'pixi.js';

  export class LayoutContainer extends Container {
    constructor(params?: {background?: ContainerChild; layout?: Container['layout']});
    background: Container;
    readonly containerMethods: {
      addChildAt<T extends ContainerChild>(child: T, index: number): T;
      removeChild<T extends ContainerChild>(...children: T[]): T;
    };
  }
}
