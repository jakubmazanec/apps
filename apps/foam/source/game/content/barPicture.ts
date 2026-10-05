// The pipeline's proof until the bar replaces it: tone 3 of WARM, a
// checkerboard of magenta and rose, with a white row that moves down one pixel
// per step.
export const barPicture = `
vec3 picture(ivec2 pixel, vec2 point, float t) {
  if (pixel.y == uStep % int(uSize.y)) {
    return ink(INK_WHITE);
  }

  return tone(ink(INK_BLACK), 3.0 / 7.0 + 0.01, WARM, 0.0);
}
`;
