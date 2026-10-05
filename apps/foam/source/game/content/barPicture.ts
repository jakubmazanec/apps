// The bar at night, drawn against a design of 480 × 270 (see
// core/pictureShader.ts for what every picture gets). A point of the design at
// x, y lies at x × width / 480 and y × height / 270 on the screen. Positions,
// widths, heights and lengths are in design units and stretch with the screen;
// the radii of the lamps' halos, the thickness of lines, the cells of the
// noise, the size and the sway of dust, speeds in pixels a second and the
// checkerboard stay in screen pixels.
//
// The shapes are drawn in this order, each by a function of its own that takes
// the colour so far and returns the new one: shelf, counter, haze, lamps (their
// cones and halos), dust, light on the floor, door, tables, glints.
//
// The tests draw the picture with a software renderer, which runs every branch
// of the shader for every pixel, so the shader keeps its work per pixel small:
// the rows of the counter and the shelf are found once, the lamps' light is
// toned once, and a pixel looks at one cone's dust and one glint.
export const barPicture = `
const float PI = 3.14159265;
const float TAU = 6.28318531;

const int SHELF_SEED = 100;
const int BOTTLE_SEED = 200;
const int COUNTER_SEED = 300;
const int HAZE_SEED = 400;
const int FLICKER_SEED = 500;
const int DUST_SEED = 600;
const int STREET_SEED = 700;
const int GLINT_SEED = 800;

// The screen column and row of a design x and y.
int columnOf(float x) {
  return int(floor(x * uSize.x / 480.0));
}

int rowOf(float y) {
  return int(floor(y * uSize.y / 270.0));
}

// The design y of the counter's top edge, which runs from the left front into
// the depth on the right.
float getCounterTop(float x) {
  return 208.0 - x * 0.2;
}

// The rows of the pixel's column that several shapes need, found once per
// pixel by picture: the counter's top row (a rose line, with a white line above
// it), and the shelf's top and bottom rows (the shelf gets lower to the right).
int counterRow;
int shelfTop;
int shelfBottom;
bool isOnShelf;

void findRows(ivec2 pixel, vec2 point) {
  counterRow = rowOf(getCounterTop(point.x));
  shelfTop = rowOf(64.0 + (point.x - 150.0) * 0.06);
  shelfBottom = rowOf(142.0 - (point.x - 150.0) * 0.05);
  isOnShelf =
    point.x >= 150.0 && point.x < 392.0 && pixel.y >= shelfTop && pixel.y < shelfBottom;
}

vec3 drawShelf(vec3 color, ivec2 pixel, float t) {
  if (!isOnShelf) {
    return color;
  }

  int height = shelfBottom - shelfTop;
  int row = pixel.y - shelfTop;
  int firstLine = int(floor(float(height) * 0.36));
  int secondLine = int(floor(float(height) * 0.7));

  // Two black lines, 2 thick.
  if ((row >= firstLine && row < firstLine + 2) || (row >= secondLine && row < secondLine + 2)) {
    return ink(INK_BLACK);
  }

  // 1 in the middle of the shelf's height, 0 at its edges.
  float middle = 1.0 - abs((float(row) + 0.5) / float(height) * 2.0 - 1.0);
  float bottles = noise(vec2(pixel), vec2(5.0, 80.0), SHELF_SEED);
  // Each column of 5 pixels brightens and fades at its own pace: its phase
  // and its rate come from one hash.
  float column = hash(ivec2(pixel.x / 5, 0), BOTTLE_SEED);
  float phase = TAU * column;
  float rate = 0.5 + 0.9 * fract(column * 64.0);
  float brightness = 1.0 + 0.32 * sin(phase + rate * t);

  return tone(color, (0.08 + 0.62 * bottles * (0.35 + 0.65 * middle)) * brightness, DEEP, 0.25);
}

vec3 drawCounter(vec3 color, ivec2 pixel, vec2 point) {
  if (point.x >= 400.0) {
    return color;
  }

  int bottom = rowOf(getCounterTop(point.x) + 50.0);

  if (pixel.y == counterRow - 1) {
    return ink(INK_WHITE);
  }

  if (pixel.y == counterRow) {
    return ink(INK_ROSE);
  }

  if (pixel.y < counterRow || pixel.y >= bottom) {
    return color;
  }

  // It fades downwards and to the right, and the shelf does not show through.
  float down = float(pixel.y - counterRow) / float(bottom - counterRow);
  float right = point.x / 400.0;
  float planks = noise(vec2(pixel), vec2(8.0, 50.0), COUNTER_SEED);

  return tone(ink(INK_BLACK), (0.92 - 0.55 * down - 0.4 * right) * (0.6 + 0.4 * planks), WARM, 0.3);
}

// Dark smoke on the pixels that are still black, above the counter.
vec3 drawHaze(vec3 color, ivec2 pixel, vec2 point, float t) {
  if (
    point.x >= 412.0 ||
    point.y < 26.0 ||
    point.y >= 205.0 ||
    pixel.y >= counterRow - 1 ||
    color != ink(INK_BLACK)
  ) {
    return color;
  }

  vec2 position = vec2(pixel);
  float first = noise(position - vec2(5.0 * t, 0.0), vec2(70.0, 26.0), HAZE_SEED);
  float second = noise(position + vec2(2.2 * t, 0.0), vec2(28.0, 12.0), HAZE_SEED + 1);
  // Strongest at y 110, none at y 26 and 205.
  float strength = point.y < 110.0 ? (point.y - 26.0) / 84.0 : (205.0 - point.y) / 95.0;
  float amount = (0.75 * first + 0.25 * second) * strength;

  return tone(color, amount * 0.44, DEEP, 0.3);
}

// A lamp: its centre in design units, the radius of its halo in screen pixels,
// how far its cone goes down in design units, and the phase of its breathing.
struct Lamp {
  vec2 centre;
  float radius;
  float reach;
  float phase;
};

const Lamp LAMPS[3] = Lamp[3](
  Lamp(vec2(104.0, 50.0), 8.0, 140.0, 0.0),
  Lamp(vec2(240.0, 54.0), 6.0, 108.0, 2.1),
  Lamp(vec2(334.0, 58.0), 4.0, 84.0, 4.4)
);
const int BACK_LAMP = 2;
const float LAMP_JITTER = 0.5;

// The small lamp at the back flickers: in each seventh of a second it has a 7%
// chance of a power of 0.35 and no white core.
bool isBackLampFlickering(float t) {
  return hash(ivec2(int(floor(t * 7.0)), 0), FLICKER_SEED) < 0.07;
}

float getPower(Lamp lamp, float t, bool isFlickering) {
  if (isFlickering) {
    return 0.35;
  }

  float p = lamp.phase;

  return 1.0 + 0.25 * sin(0.8 * t + p) + 0.08 * sin(2.3 * t + 3.0 * p);
}

// The cone ends at its reach or above the counter, whichever comes first. It
// goes on over the shelf, which lies behind the lamps.
bool isInCone(Lamp lamp, ivec2 pixel, vec2 point) {
  float below = point.y - lamp.centre.y;

  return
    below > 0.0 &&
    below < lamp.reach &&
    abs(point.x - lamp.centre.x) < below * 0.36 + 2.0 &&
    pixel.y < counterRow - 1;
}

// The light of one lamp: the brighter of its cone, darker downwards, and its
// halo, where the halo is above 0.12.
float getLampLight(Lamp lamp, float power, ivec2 pixel, vec2 point) {
  float distance = length(vec2(pixel - toScreen(lamp.centre)));
  float halo = glow(distance, lamp.radius * (0.75 + 0.25 * power));
  float cone = isInCone(lamp, pixel, point)
    ? (0.8 - 0.55 * (point.y - lamp.centre.y) / lamp.reach) * (0.6 + 0.4 * power)
    : 0.0;

  return max(cone, halo > 0.12 ? halo : 0.0);
}

// A white cross through the lamp's centre, twice the radius long each way.
bool isOnCross(Lamp lamp, ivec2 pixel) {
  ivec2 offset = abs(pixel - toScreen(lamp.centre));
  int arm = int(2.0 * lamp.radius);

  return (offset.x == 0 && offset.y <= arm) || (offset.y == 0 && offset.x <= arm);
}

// The lamps' cones and halos, toned once: where two lights meet, a pixel gets
// the brightest of them. A light only adds colour: where its faintest tone would
// put black, what lies under it stays, so the faint ring of a halo never
// punches black dots into a lit shape. On the shelf a light colours every other
// pixel, those where x + y is odd, so the bottles show through the beam. The
// back lamp has no cross while it flickers.
vec3 drawLamps(vec3 color, ivec2 pixel, vec2 point, vec3 powers, bool isBackFlickering) {
  if (
    isOnCross(LAMPS[0], pixel) ||
    isOnCross(LAMPS[1], pixel) ||
    (!isBackFlickering && isOnCross(LAMPS[BACK_LAMP], pixel))
  ) {
    return ink(INK_WHITE);
  }

  float first = getLampLight(LAMPS[0], powers.x, pixel, point);
  float second = getLampLight(LAMPS[1], powers.y, pixel, point);
  float back = getLampLight(LAMPS[BACK_LAMP], powers.z, pixel, point);

  vec3 lit = tone(color, max(max(first, second), back), LIGHT, LAMP_JITTER);

  if (lit == ink(INK_BLACK) || (isOnShelf && ((pixel.x + pixel.y) & 1) == 0)) {
    return color;
  }

  return lit;
}

// Each cone is cut into lanes 6 pixels wide, and each lane into cells 6 high
// that move down with the lane's dust. A cell has a dot with a chance of 75%,
// which is on average about 0.9 dots per pixel of a cone's reach. A dot sways
// at most 2 pixels from its lane's middle, so it stays in its lane, and a
// pixel checks one cell. The cones do not overlap, so a pixel checks only the
// cone of the lamp nearest to it from side to side.
const float DUST_LANE = 6.0;
const float DUST_CELL = 6.0;
const float DUST_CHANCE = 0.75;

vec3 drawDust(vec3 color, ivec2 pixel, vec2 point, float t) {
  int index = 0;
  Lamp lamp = LAMPS[0];

  if (point.x >= (LAMPS[1].centre.x + LAMPS[2].centre.x) / 2.0) {
    index = 2;
    lamp = LAMPS[2];
  } else if (point.x >= (LAMPS[0].centre.x + LAMPS[1].centre.x) / 2.0) {
    index = 1;
    lamp = LAMPS[1];
  }

  ivec2 centre = toScreen(lamp.centre);
  // Dust starts under the lamp's cross.
  int top = centre.y + int(2.0 * lamp.radius) + 1;

  if (pixel.y < top || !isInCone(lamp, pixel, point)) {
    return color;
  }

  int lane = int(floor(float(pixel.x - centre.x) / DUST_LANE));
  // The lane's sink time, from 30 to 80 seconds, and its phase.
  float laneHash = hash(ivec2(lane, index), DUST_SEED);
  float sinkTime = 30.0 + 50.0 * laneHash;
  float phase = fract(laneHash * 64.0);
  float reach = lamp.reach * uSize.y / 270.0;
  float span = max(floor(reach / DUST_CELL), 1.0) * DUST_CELL;
  // The lane's coordinate moves down with its dust and wraps over the reach.
  int row = int(floor(mod(float(pixel.y - top) - reach * (t / sinkTime + phase), span)));
  int cellRow = row / int(DUST_CELL);
  // Whether the cell has a dot, the dot's row and whether it is white, and the
  // phase of its sway.
  float cellHash = hash(ivec2(lane, cellRow), DUST_SEED + 1 + index);
  float dotHash = fract(cellHash * 64.0);
  int dotRow = int(floor(dotHash * DUST_CELL));
  float sway = floor(2.0 * sin(0.9 * t + TAU * fract(cellHash * 4096.0)) + 0.5);
  int dotColumn = centre.x + lane * int(DUST_LANE) + 3 + int(sway);

  if (cellHash >= DUST_CHANCE || row - cellRow * int(DUST_CELL) != dotRow || pixel.x != dotColumn) {
    return color;
  }

  // A quarter of the dots are white, the rest mint.
  return fract(dotHash * DUST_CELL) < 0.25 ? ink(INK_WHITE) : ink(INK_MINT);
}

// How far the tram has passed the door, from 0 to 1, or -1 when it is not
// passing: in every 16 seconds, from second 9 to second 12.5.
float getTramPassage(float t) {
  float second = mod(t, 16.0);

  return second >= 9.0 && second < 12.5 ? (second - 9.0) / 3.5 : -1.0;
}

vec3 drawFloorLight(vec3 color, vec2 point, float tramPassage) {
  float below = point.y - 176.0;

  if (
    below < 0.0 ||
    point.y >= 250.0 ||
    point.x < 418.0 - 1.3 * below ||
    point.x >= 458.0 + 0.25 * below
  ) {
    return color;
  }

  // Brighter while the tram passes, most in the middle of its passage.
  float tram = tramPassage < 0.0 ? 0.0 : 0.22 * sin(PI * tramPassage);

  return tone(color, 0.6 - 0.48 * below / 74.0 + tram, LIGHT, 0.45);
}

vec3 drawDoor(vec3 color, ivec2 pixel, vec2 point, float t, float tramPassage) {
  int left = columnOf(418.0);
  int right = columnOf(458.0);
  int top = rowOf(70.0);

  if (pixel.x < left || pixel.x >= right || pixel.y < top || pixel.y >= rowOf(176.0)) {
    return color;
  }

  if (pixel.x == left || pixel.y == top) {
    return ink(INK_WHITE);
  }

  if (pixel.x == right - 1) {
    return ink(INK_CYAN);
  }

  int bar = rowOf(70.0 + 106.0 / 3.0);
  int post = columnOf(438.0);

  if ((pixel.y >= bar && pixel.y < bar + 2) || (pixel.x >= post - 1 && pixel.x < post + 1)) {
    return ink(INK_BLACK);
  }

  // The street's light moves sideways at 7 pixels a second, and the tram's
  // band, 14 wide, crosses the door from left to right.
  vec2 position = vec2(float(pixel.x) - 7.0 * t, float(pixel.y));
  float street = noise(position, vec2(40.0, 6.0), STREET_SEED);
  float band = 411.0 + 54.0 * tramPassage;
  float tram = tramPassage >= 0.0 && abs(point.x - band) < 7.0 ? 0.45 : 0.0;

  return tone(ink(INK_BLACK), 0.15 + 0.6 * street + tram, LIGHT, 0.4);
}

// Black from its top edge to the bottom of the picture, with a rim line on
// its top edge.
vec3 drawTable(vec3 color, ivec2 pixel, float left, float right, float top, int rim) {
  if (pixel.x < columnOf(left) || pixel.x >= columnOf(right) || pixel.y < rowOf(top)) {
    return color;
  }

  return pixel.y == rowOf(top) ? ink(rim) : ink(INK_BLACK);
}

vec3 drawTables(vec3 color, ivec2 pixel) {
  color = drawTable(color, pixel, 300.0, 372.0, 222.0, INK_ROSE);
  color = drawTable(color, pixel, 20.0, 118.0, 244.0, INK_CYAN);

  return drawTable(color, pixel, 196.0, 262.0, 252.0, INK_MAGENTA);
}

// 22 dashes on the counter's top, 3 to 8 above its edge and 3 to 11 long. The
// counter is cut into 22 equal slots with one dash each, so a pixel checks
// only the dash of its slot. Each dash is on or off for a period of its own,
// from 1.1 to 3.5 seconds, and on with a chance of 55% in each period.
const float GLINTS = 22.0;
const float GLINT_SLOT = 400.0 / GLINTS;

vec3 drawGlints(vec3 color, ivec2 pixel, vec2 point, float t) {
  float slot = floor(point.x / GLINT_SLOT);
  float shape = hash(ivec2(int(slot), 0), GLINT_SEED);
  float timing = hash(ivec2(int(slot), 1), GLINT_SEED);
  float dashLength = floor(3.0 + 9.0 * shape);
  float start = slot * GLINT_SLOT + floor(fract(shape * 64.0) * (GLINT_SLOT - dashLength));
  float height = floor(3.0 + 6.0 * fract(shape * 4096.0));
  float period = 1.1 + 2.4 * timing;
  bool isOn = hash(ivec2(int(slot), int(floor(t / period))), GLINT_SEED + 1) < 0.55;
  float kind = fract(timing * 64.0);

  if (
    !isOn ||
    point.x >= 400.0 ||
    point.x < start ||
    point.x >= start + dashLength ||
    pixel.y != rowOf(getCounterTop(point.x) - height)
  ) {
    return color;
  }

  return kind < 1.0 / 3.0 ? ink(INK_CYAN) : kind < 2.0 / 3.0 ? ink(INK_PINK) : ink(INK_WHITE);
}

vec3 picture(ivec2 pixel, vec2 point, float t) {
  bool isBackFlickering = isBackLampFlickering(t);
  vec3 powers = vec3(
    getPower(LAMPS[0], t, false),
    getPower(LAMPS[1], t, false),
    getPower(LAMPS[BACK_LAMP], t, isBackFlickering)
  );
  float tramPassage = getTramPassage(t);
  vec3 color = ink(INK_BLACK);

  findRows(pixel, point);

  color = drawShelf(color, pixel, t);
  color = drawCounter(color, pixel, point);
  color = drawHaze(color, pixel, point, t);
  color = drawLamps(color, pixel, point, powers, isBackFlickering);
  color = drawDust(color, pixel, point, t);
  color = drawFloorLight(color, point, tramPassage);
  color = drawDoor(color, pixel, point, t, tramPassage);
  color = drawTables(color, pixel);
  color = drawGlints(color, pixel, point, t);

  return color;
}
`;
