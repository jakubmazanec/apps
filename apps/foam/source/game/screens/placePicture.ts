import * as pixi from 'pixi.js';
import {type Renderable} from 'tellurion';

import {game} from '../core/game.js';
import {advancePictureTime, getPictureStep} from '../core/getPictureStep.js';
import {palette} from '../core/palette.js';
import {createPictureShaderSource, type PictureShaderSource} from '../core/pictureShader.js';

export type PlacePictureOptions = {
  /** GLSL of the place: the function that draws it. */
  picture: string;
};

const INKS = Object.values(palette);

// The palette as the shader takes it: red, green and blue of each ink, from 0
// to 1, in the order of palette.ts.
function getPaletteUniform(): Float32Array {
  return new Float32Array(INKS.flatMap((ink) => [...new pixi.Color(ink).toRgbArray()]));
}

function compileStage(
  gl: WebGL2RenderingContext,
  shader: WebGLShader | null,
  source: string,
): void {
  if (shader === null) {
    throw new Error('Picture shader failed to compile: no shader object!');
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true) {
    throw new Error(`Picture shader failed to compile: ${gl.getShaderInfoLog(shader) ?? ''}`);
  }
}

// Compiles and links the picture's shader once, through the renderer's own
// context, and throws the compiler's message on a mistake. The test shaders
// and the test program are deleted either way.
function checkShaderSource({vertex, fragment}: PictureShaderSource): void {
  let {renderer} = game.app;

  if (
    !(renderer instanceof pixi.WebGLRenderer) ||
    !(renderer.gl instanceof WebGL2RenderingContext)
  ) {
    throw new Error('Picture needs WebGL 2!');
  }

  let {gl} = renderer;
  let vertexShader = gl.createShader(gl.VERTEX_SHADER);
  let fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  let program = gl.createProgram();

  try {
    compileStage(gl, vertexShader, vertex);
    compileStage(gl, fragmentShader, fragment);

    if (vertexShader === null || fragmentShader === null) {
      throw new Error('Picture shader failed to link: no shader object!');
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
      throw new Error(`Picture shader failed to link: ${gl.getProgramInfoLog(program) ?? ''}`);
    }
  } finally {
    gl.deleteProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
  }
}

// Draws a place's picture with a shader of Foam's own into a texture as large
// as the screen in art pixels, which one sprite shows. The game scales the
// sprite up and the CRT filter runs over it, as over the rest of the screen.
//
// The constructor checks the shader itself, because Pixi only logs a shader
// that fails and then draws nothing. Everything that can fail fails there:
// update only advances the clock and draws, and it must not throw, because an
// error in it would stop the frame loop.
//
// The texture is drawn from update, which the ticker runs at normal priority,
// before the stage renders at low priority, so a frame shows the step drawn
// for it. The mesh with the shader is never added to a screen.
export class PlacePicture implements Renderable {
  /** How fast the picture's time runs: 1, or 0.5 while a window is open over it. */
  speed = 1;

  readonly view: pixi.Container = new pixi.Container();

  /** The step the texture shows, or -1 before the first draw. */
  #drawnStep = -1;

  readonly #geometry: pixi.Geometry;

  /** The texture's size in art pixels. */
  #height = 1;

  #isDirty = true;

  readonly #mesh: pixi.Mesh<pixi.Geometry, pixi.Shader>;

  readonly #shader: pixi.Shader;

  readonly #texture: pixi.RenderTexture;

  /** The picture's time in seconds. */
  #time = 0;

  readonly #uniforms: pixi.UniformGroup<{
    uPalette: {value: Float32Array; type: 'vec3<f32>'; size: number};
    uSize: {value: Float32Array; type: 'vec2<f32>'};
    uStep: {value: number; type: 'i32'};
  }>;

  #width = 1;

  constructor({picture}: PlacePictureOptions) {
    let source = createPictureShaderSource(picture);

    checkShaderSource(source);

    this.#uniforms = new pixi.UniformGroup({
      uPalette: {value: getPaletteUniform(), type: 'vec3<f32>', size: INKS.length},
      uSize: {value: new Float32Array(2), type: 'vec2<f32>'},
      uStep: {value: 0, type: 'i32'},
    });
    this.#shader = new pixi.Shader({
      glProgram: pixi.GlProgram.from(source),
      resources: {pictureUniforms: this.#uniforms},
    });
    // Positions only: the shader has no use for texture coordinates, and Pixi
    // warns about an attribute of the geometry that the shader does not read.
    this.#geometry = new pixi.Geometry({
      attributes: {aPosition: this.#getPositions()},
      indexBuffer: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    this.#mesh = new pixi.Mesh({geometry: this.#geometry, shader: this.#shader});
    // Dynamic, so that the sprite follows the texture's size.
    this.#texture = pixi.RenderTexture.create({
      width: 1,
      height: 1,
      resolution: 1,
      scaleMode: 'nearest',
      antialias: false,
      dynamic: true,
    });
    this.view.addChild(new pixi.Sprite(this.#texture));
  }

  destroy(): void {
    this.view.destroy({children: true});
    this.#mesh.destroy();
    this.#geometry.destroy(true);
    // The program stays: GlProgram.from shares it between pictures of the same
    // source.
    this.#shader.destroy();
    this.#texture.destroy(true);
  }

  /** Sets the size in art pixels, rounded up. A width or a height of 0 keeps the last size. */
  resize(width: number, height: number): void {
    if (!(width > 0) || !(height > 0)) {
      return;
    }

    this.#width = Math.ceil(width);
    this.#height = Math.ceil(height);
    this.#texture.resize(this.#width, this.#height);
    this.#geometry.getBuffer('aPosition').data = this.#getPositions();
    this.#isDirty = true;
  }

  update(ticker: pixi.Ticker): void {
    this.#time = advancePictureTime(this.#time, ticker.deltaMS, this.speed);

    let step = getPictureStep(this.#time);

    if (step === this.#drawnStep && !this.#isDirty) {
      return;
    }

    let {uniforms} = this.#uniforms;

    uniforms.uStep = step;
    uniforms.uSize[0] = this.#width;
    uniforms.uSize[1] = this.#height;
    this.#uniforms.update();
    game.app.renderer.render({container: this.#mesh, target: this.#texture, clear: true});

    this.#drawnStep = step;
    this.#isDirty = false;
  }

  #getPositions(): Float32Array {
    return new Float32Array([0, 0, this.#width, 0, this.#width, this.#height, 0, this.#height]);
  }
}
