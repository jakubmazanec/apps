// DEV-throw / prod-warn on unsupported input (the ObjectPool.destroy
// precedent): a silent drop reproduces as an inexplicably empty map layer,
// and a warn alone gets missed in development.
export function failUnsupported(message: string): void {
  if (import.meta.env.DEV) {
    throw new Error(message);
  }

  // eslint-disable-next-line no-console -- loud failure in production builds (DEV throws)
  console.warn(message);
}
