import {FocusCommand} from './FocusCommand';

// Values are KeyboardEvent.code strings; a 'Shift+' prefix is the only
// supported modifier syntax (e.g. 'Shift+Tab').

export type FocusKeys = Partial<Record<FocusCommand, string[]>>;
