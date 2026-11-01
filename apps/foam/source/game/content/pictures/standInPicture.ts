// A picture that stands in for a place whose picture is not drawn yet: black, with one warm lamp
// in the upper middle of the design of 480 × 270 whose power rises and falls slowly. See
// core/pictureShader.ts for what every picture gets.
export const standInPicture = `
const vec2 LAMP = vec2(240.0, 70.0);

vec3 picture(ivec2 pixel, vec2 point, float t) {
  float power = 0.85 + 0.15 * sin(t * 0.8);

  return tone(ink(INK_BLACK), power * glow(distance(point, LAMP), 30.0), WARM, 0.3);
}
`;
