/**
 * Contract for the screen registered with `Game.addErrorScreen`. A transition failure is pushed
 * in and rendered on the spot; the error itself is not retained.
 *
 * A minimum, not a whole contract: an error screen may carry any further contents it needs
 * alongside this member.
 */
export type ErrorScreenContents = {showError: (error: unknown) => void};
