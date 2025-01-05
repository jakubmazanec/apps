import * as pixi from 'pixi.js';

type UniversalSpritesheet = pixi.Spritesheet<
  pixi.ISpritesheetData & {animations: Record<string, unknown>}
>;

export type SpriteOptions<N extends readonly string[] = string[]> = {
  assetName: string;
  spriteNames: N;
};

export class Sprite<const N extends readonly string[] = string[]> {
  view: pixi.AnimatedSprite;

  currentSpriteName: N[number];

  readonly sprites: Record<N[number], pixi.AnimatedSprite>;

  constructor({assetName, spriteNames}: SpriteOptions<N>) {
    let spritesheet = pixi.Assets.get<UniversalSpritesheet | undefined>(assetName);
    let sprites: Record<string, pixi.AnimatedSprite> = {};

    if (!spritesheet) {
      throw new Error(`Spritesheet "${assetName}" wasn't found!`);
    }

    for (let spriteName of spriteNames) {
      if (!spritesheet.animations[spriteName]) {
        throw new Error(
          `Spritesheet "${assetName}" doesn't contain animated sprite "${spriteName}"!`,
        );
      }

      sprites[spriteName] = new pixi.AnimatedSprite(spritesheet.animations[spriteName]);
      sprites[spriteName].visible = false;
      sprites[spriteName].animationSpeed = 0.15;
    }

    this.sprites = sprites as Record<N[number], pixi.AnimatedSprite>;
    this.view = this.sprites[spriteNames[0] as N[number]];
    this.currentSpriteName = spriteNames[0] as N[number];
  }

  show(spriteName: N[number]): this {
    if (spriteName === this.currentSpriteName) {
      return this;
    }

    this.view.stop();

    this.view.visible = false;
    this.view = this.sprites[spriteName];
    this.currentSpriteName = spriteName;

    this.view.play();

    this.view.visible = true;

    return this;
  }
}
