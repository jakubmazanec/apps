# Travel data

Two files hold what the game knows about the map of the night:

- `locations.json`: one entry for each location on the map (the train has none), by location id.
- `travel.json`: every journey the game offers, by where it starts, by the way (`walk`, `tram`,
  `taxi`) and by where it ends.

## Who writes which field

| Field      | Written by | Meaning                                                             |
| ---------- | ---------- | ------------------------------------------------------------------- |
| `address`  | The author | Street and number in Brno, for a building                           |
| `station`  | The author | The station's name in OpenStreetMap, instead of an address          |
| `tramStop` | The author | The stop's name in OpenStreetMap; a location with it is a tram stop |
| `osmName`  | The author | Optional. The location's name in OpenStreetMap, for its hours       |
| `position` | The script | Latitude and longitude, to five decimals                            |
| `hours`    | Either     | The spans of the Friday night in which it is open; see below        |
| `computed` | The script | `true` while the value is the script's and nobody has checked it    |

`hours` holds the spans in night minutes, from 16:00 = 960 to 08:00 = 1920, the end of a span
excluded: `[[960, 1620]]` is open from 16:00 and closed from 03:00. No `hours` means it never
closes. For an entry with `osmName`, the script converts OpenStreetMap's `opening_hours` tag through
the `opening_hours` library for a Friday with no public holiday; a tag it cannot read, or one that
leaves the whole night closed, is listed for the author to write by hand.

A journey has `minutes`, a `price` in Kč where it costs something, and `computed`. On foot and by
taxi, the journeys go from every location to every other; by tram, from every stop to every other,
as a tram ride goes from stop to stop.

## Where the numbers come from

The positions, hours and routes come from OpenStreetMap, through Overpass (`overpass-api.de`) and
the routing service `routing.openstreetmap.de`.

© OpenStreetMap contributors, <https://www.openstreetmap.org/copyright>. The data is available under
the Open Database License.

## Changing a number

To correct a number, change it and delete `"computed": true` beside it. To get a fresh one, delete
the journey and run the script. The script never changes a value that is there.

```sh
node scripts/fill-travel-data.mjs
```

## The map

`map.json` holds the streets, railway, rivers, parks and tram lines around the locations, in whole
metres from `origin` (`x` east, `y` south), from OpenStreetMap through Overpass. Nobody edits it;
the script writes it anew, and is run again when a location is added (the checker says when):

```sh
node scripts/fetch-map-data.mjs
```
