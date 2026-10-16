// The pipeline's proof: tone 3 of WARM everywhere, a checkerboard of magenta
// on even x + y and rose on odd, and a white row that moves down one pixel per
// step.
export const PROOF_PICTURE = `
vec3 picture(ivec2 pixel, vec2 point, float t) {
  if (pixel.y == uStep % int(uSize.y)) {
    return ink(INK_WHITE);
  }

  return tone(ink(INK_BLACK), 3.0 / 7.0 + 0.01, WARM, 0.0);
}
`;
