// The shell's two views: the browser view, the default, and the real-size view
export type View = 'browser' | 'real-size';

const VIEW = 'groovebox-view';
const PIXELS_PER_MM = 'groovebox-pixels-per-mm';

// An item of the browser's local storage, or null. A blocked storage throws, even on reading
// `localStorage`, and so keeps nothing: the view is then the browser view and the size is set again
function stored(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // A blocked storage keeps nothing
  }
}

export function storedView(): View {
  return stored(VIEW) === 'real-size' ? 'real-size' : 'browser';
}

export function storeView(view: View): void {
  store(VIEW, view);
}

// The CSS px a mm that the real size was last set to, if it was
export function storedPixelsPerMm(): number | undefined {
  let pixelsPerMm = Number(stored(PIXELS_PER_MM));

  return pixelsPerMm > 0 && Number.isFinite(pixelsPerMm) ? pixelsPerMm : undefined;
}

export function storePixelsPerMm(pixelsPerMm: number): void {
  store(PIXELS_PER_MM, String(pixelsPerMm));
}
