// Screen-level pause/quit orchestration, extracted into small functions that
// take their collaborators so the ordering rules are unit-testable with fakes:
// the suite has no real-screen integration harness (game UI design §7).

export function openPauseMenu({
  world,
  openModal,
}: {
  openModal: () => void;
  world: {pause: () => void};
}): void {
  // Freeze first: the overlay must never sit over a still-running world.
  world.pause();
  openModal();
}

export function teardownWorldScreen({
  modal,
  world,
  detachWorld,
}: {
  detachWorld: () => void;
  modal: {destroy: () => void} | null;
  world: {stop: () => void};
}): void {
  // Owning-screen teardown: synchronous destroy(), never the animated close()
  // — the screen's scheduler was already cleared before onHide, so a fade
  // started here would freeze off-ticker and later resume against destroyed
  // views. stop() works on a paused world and resets the paused flag.
  modal?.destroy();
  world.stop();
  detachWorld();
}
