import {type Location} from '../../../core/location.js';
import {hlavniNadraziForecourt} from './forecourt.js';
import {hlavniNadraziHall} from './hall.js';

export const hlavniNadrazi: Location = {
  id: 'hlavniNadrazi',
  name: 'Brno hlavní nádraží',
  places: [hlavniNadraziHall, hlavniNadraziForecourt],
  arrival: 'hlavniNadraziForecourt',
};
