/** How many times a second a picture is drawn anew. */
export const PICTURE_STEPS_PER_SECOND = 30;

/** Returns the picture's time after a frame of `deltaMs`, in seconds. */
export function advancePictureTime(time: number, deltaMs: number, speed: number): number {
  return time + (deltaMs / 1000) * speed;
}

/** Returns the step that a time belongs to. */
export function getPictureStep(time: number): number {
  return Math.floor(time * PICTURE_STEPS_PER_SECOND);
}
