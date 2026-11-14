export const PIXELS_PER_CLICK = 4;

// 100 px of pixel delta or 3 lines of line delta
const WHEEL_PIXELS_PER_CLICK = 100;
const WHEEL_LINES_PER_CLICK = 3;
const DOM_DELTA_PIXEL = 0;
const DOM_DELTA_LINE = 1;

// Whole clicks in `amount`, counted toward zero. The `+ 0` makes a negative fraction give 0 and not
// -0
function wholeClicks(amount: number, perClick: number) {
  return Math.trunc(amount / perClick) + 0;
}

// The clicks of a drag from `startY` to `y`, both in CSS px: each 4 px up is a click, so up is
// positive, and each 4 px down is a click back. It counts from the press point, so the shell sends
// the difference to what it has sent. The core takes -127 to 127 clicks in one turn input and a
// long drag can give more: the shell sends them as several turn inputs at one sample
export function dragClicks(startY: number, y: number) {
  return wholeClicks(startY - y, PIXELS_PER_CLICK);
}

// Adds a wheel event to `rest`, what the earlier events left over, in px of `deltaY`, which is
// positive for down. Returns the whole clicks and the new rest. 100 px or 3 lines make a click and
// down is negative, as in a drag. The clicks can be more than 127, as in a drag. A page delta
// moves nothing, since the owner's rule names only pixels and lines. Chrome turns SHIFT + wheel
// into a horizontal scroll, with the delta in `deltaX` and `deltaY` 0, so with SHIFT held and
// `deltaY` 0 the `deltaX` counts in its place, in the same direction: SHIFT + turn is a fine turn.
// Without SHIFT a `deltaX` moves nothing
export function wheelClicks(
  rest: number,
  event: Pick<WheelEvent, 'deltaMode' | 'deltaX' | 'deltaY' | 'shiftKey'>,
): {clicks: number; rest: number} {
  let deltaY = event.shiftKey && event.deltaY === 0 ? event.deltaX : event.deltaY;
  let delta: number;

  if (event.deltaMode === DOM_DELTA_PIXEL) {
    delta = deltaY;
  } else if (event.deltaMode === DOM_DELTA_LINE) {
    delta = (deltaY * WHEEL_PIXELS_PER_CLICK) / WHEEL_LINES_PER_CLICK;
  } else {
    return {clicks: 0, rest};
  }

  let total = rest + delta;
  let clicks = wholeClicks(-total, WHEEL_PIXELS_PER_CLICK);

  return {clicks, rest: total + clicks * WHEEL_PIXELS_PER_CLICK};
}

// Whether a pointer that went down on an encoder and came up is a push: it never moved 4 px from
// where it went down, in CSS px, and it turned nothing
export function isPush(maxMovement: number, clicks: number) {
  return maxMovement < PIXELS_PER_CLICK && clicks === 0;
}
