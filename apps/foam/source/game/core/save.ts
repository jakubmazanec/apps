import {type Night} from './night.js';

export type SavedNight = Omit<Night, 'collection' | 'leaving' | 'pick' | 'random'>;
