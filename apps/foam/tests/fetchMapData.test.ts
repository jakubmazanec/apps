import {describe, expect, test, vitest} from 'vitest';

import {
  fetchMapData,
  LAYER_QUERIES,
  MAP_MARGIN,
  sendOverpassQuery,
} from '../scripts/fetch-map-data.mjs';
import {getMapPoint, getMapPosition} from '../source/game/core/getMapPoint.js';

type Request = Parameters<typeof fetchMapData>[1];
type Element = Awaited<ReturnType<Request>>[number];

const ORIGIN = {latitude: 49.205, longitude: 16.61};
const places = {
  a: {kind: 'place', position: {latitude: 49.2, longitude: 16.6}},
  b: {kind: 'stop', position: {latitude: 49.21, longitude: 16.62}},
};
const PARK_SELECTOR = 'way[leisure=park]';
const MINOR_SELECTOR =
  'way[highway~"^(tertiary|residential|unclassified|pedestrian|living_street)$"]';

/** An Overpass way through points given in metres from the origin. */
function createWay(id: number, points: Array<[number, number]>): Element {
  return {
    id,
    geometry: points.map(([x, y]) => {
      let {latitude, longitude} = getMapPosition({x, y}, ORIGIN);

      return {lat: latitude, lon: longitude};
    }),
  };
}

/** A fake request that answers from a map of selector to elements, and `[]` otherwise. */
function createRequest(answers: Record<string, Element[]> = {}) {
  return vitest.fn<Request>(async (query) => {
    for (let [selector, elements] of Object.entries(answers)) {
      if (query.includes(selector)) {
        return elements;
      }
    }

    return [];
  });
}

describe(fetchMapData, () => {
  test('asks for each layer once, in order, in the box widened by 2,000 m', async () => {
    let request = createRequest();
    let map = await fetchMapData(places, request);
    let points = Object.values(places).map(({position}) => {
      let {x, y} = getMapPoint(position, ORIGIN);

      return {x: Math.round(x), y: Math.round(y)};
    });
    let box = {
      left: Math.min(...points.map(({x}) => x)) - MAP_MARGIN,
      top: Math.min(...points.map(({y}) => y)) - MAP_MARGIN,
      right: Math.max(...points.map(({x}) => x)) + MAP_MARGIN,
      bottom: Math.max(...points.map(({y}) => y)) + MAP_MARGIN,
    };
    let southWest = getMapPosition({x: box.left, y: box.bottom}, ORIGIN);
    let northEast = getMapPosition({x: box.right, y: box.top}, ORIGIN);
    let area = [southWest.latitude, southWest.longitude, northEast.latitude, northEast.longitude]
      .map((degrees) => degrees.toFixed(5))
      .join(',');

    expect(request).toHaveBeenCalledTimes(6);
    expect(request.mock.calls[0]?.[0]).toBe(
      `[out:json][timeout:25];${MINOR_SELECTOR}(${area});out geom;`,
    );
    expect(request.mock.calls.map(([query]) => query)).toStrictEqual(
      LAYER_QUERIES.map(
        ({selector}: {selector: string}) => `[out:json][timeout:25];${selector}(${area});out geom;`,
      ),
    );
    expect(map.box).toStrictEqual(box);
    expect(map.origin).toStrictEqual(ORIGIN);
  });

  test('turns points into whole metres and simplifies to 5 m', async () => {
    let request = createRequest({
      [MINOR_SELECTOR]: [
        createWay(1, [
          [-100, 0],
          [0, 3],
          [100, 0],
        ]),
        createWay(2, [
          [-100, 10],
          [0, 30],
          [100, 10],
        ]),
      ],
    });
    let map = await fetchMapData(places, request);

    expect(map.minorStreets).toStrictEqual([
      [-100, 0, 100, 0],
      [-100, 10, 0, 30, 100, 10],
    ]);
  });

  test("sorts each layer's ways by id", async () => {
    let request = createRequest({
      [MINOR_SELECTOR]: [
        createWay(9, [
          [0, 0],
          [50, 0],
        ]),
        createWay(3, [
          [0, 100],
          [50, 100],
        ]),
      ],
    });
    let map = await fetchMapData(places, request);

    expect(map.minorStreets).toStrictEqual([
      [0, 100, 50, 100],
      [0, 0, 50, 0],
    ]);
  });

  test('drops a line of one point and a park that is not a closed ring', async () => {
    let request = createRequest({
      [MINOR_SELECTOR]: [
        createWay(1, [
          [10, 10],
          [10.2, 10.2],
        ]),
      ],
      [PARK_SELECTOR]: [
        createWay(1, [
          [0, 0],
          [100, 0],
          [100, 100],
        ]),
        createWay(2, [
          [0, 0],
          [100, 0],
          [0, 0],
        ]),
        createWay(3, [
          [0, 0],
          [100, 0],
          [100, 100],
          [0, 100],
          [0, 0],
        ]),
      ],
    });
    let map = await fetchMapData(places, request);

    expect(map.minorStreets).toStrictEqual([]);
    expect(map.parks).toStrictEqual([[0, 0, 100, 0, 100, 100, 0, 100, 0, 0]]);
  });

  test('rejects when a request fails', async () => {
    let error = new Error('Overpass answered 429: busy');
    let request = createRequest();

    request.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockRejectedValueOnce(error);

    await expect(fetchMapData(places, request)).rejects.toBe(error);
  });
});

function answer(status: number, body: string) {
  return new Response(body, {status});
}

describe(sendOverpassQuery, () => {
  test('waits 30 s after a 429 and sends the query again', async () => {
    let send = vitest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(answer(429, '<html>busy'))
      .mockResolvedValueOnce(answer(200, '{"elements":[{"id":1}]}'));
    let wait = vitest.fn<(seconds: number) => Promise<void>>(async () => {});

    await expect(sendOverpassQuery('q', {fetch: send, wait})).resolves.toStrictEqual([{id: 1}]);
    expect(send).toHaveBeenCalledTimes(2);
    expect(wait.mock.calls).toStrictEqual([[30]]);
  });

  test('gives up after 5 attempts of 504', async () => {
    let send = vitest.fn<typeof fetch>(async () => answer(504, '<html>timeout'));
    let wait = vitest.fn<(seconds: number) => Promise<void>>(async () => {});

    await expect(sendOverpassQuery('q', {fetch: send, wait})).rejects.toThrow(
      'Overpass answered 504: <html>timeout',
    );
    expect(send).toHaveBeenCalledTimes(5);
    expect(wait).toHaveBeenCalledTimes(4);
  });

  test('throws at once on any other error status', async () => {
    let send = vitest.fn<typeof fetch>(async () => answer(400, '{"error":"syntax"}'));
    let wait = vitest.fn<(seconds: number) => Promise<void>>(async () => {});

    await expect(sendOverpassQuery('q', {fetch: send, wait})).rejects.toThrow(
      'Overpass answered 400',
    );
    expect(send).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  test('throws on an answer with a remark', async () => {
    let send = vitest.fn<typeof fetch>(async () =>
      answer(200, '{"elements":[{"id":1}],"remark":"runtime error: timed out"}'),
    );
    let wait = vitest.fn<(seconds: number) => Promise<void>>(async () => {});

    await expect(sendOverpassQuery('q', {fetch: send, wait})).rejects.toThrow(
      'Overpass remarked: runtime error: timed out',
    );
  });
});
