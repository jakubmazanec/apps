// Game settings: a plain mutable object, written directly by the Options UI
// and read where needed (no getter/setter ceremony). In-memory only — values
// reset on reload. Intended future upgrade: persist to localStorage (read here
// at module load, write on change).
export const settings = {
  playerName: '',
  soundEnabled: true,
};
