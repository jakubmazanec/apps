# Travel data

Two files hold what the game knows about the map of the night:

- `places.json`: one entry for each place on the map (the train has none), by place id.
- `travel.json`: every journey the game offers, by where it starts, by the way (`walk`, `tram`,
  `taxi`) and by where it ends.

## Who writes which field

| Field             | Written by | Meaning                                                            |
| ----------------- | ---------- | ------------------------------------------------------------------ |
| `kind`            | The author | `"place"` for a station or a bar, `"stop"` for a tram stop         |
| `address`         | The author | Street and number in Brno, for a building                          |
| `station`         | The author | The station's name in OpenStreetMap, instead of an address         |
| `tramStop`        | The author | The stop's name in OpenStreetMap; only with `"kind": "stop"`       |
| `osmName`         | The author | Optional. The place's name in OpenStreetMap, for its hours         |
| `position`        | The script | Latitude and longitude, to five decimals                           |
| `nearestTramStop` | The script | For a place: the tram stop nearest to it, where a tram ride starts |
| `openingHours`    | Either     | In OpenStreetMap's notation                                        |
| `computed`        | The script | `true` while the value is the script's and nobody has checked it   |

A journey has `minutes`, a `price` in Kč where it costs something, and `computed`.

## Where the numbers come from

The positions, nearest stops, opening hours and routes come from OpenStreetMap, through Overpass
(`overpass-api.de`) and the routing service `routing.openstreetmap.de`.

© OpenStreetMap contributors, <https://www.openstreetmap.org/copyright>. The data is available under
the Open Database License.

## Changing a number

To correct a number, change it and delete `"computed": true` beside it. To get a fresh one, delete
the journey and run the script. The script never changes a value that is there.

```sh
node scripts/fill-travel-data.mjs
```
