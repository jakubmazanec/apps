# Engine package name — candidates

Working notes for naming the package extracted from `apps/somewhere/source/engine`.

**What it is:** a 2D game framework on top of Pixi.js — ECS (`World`/`System`/`Component`/`EntityQuery`),
scheduler (timers, tweens, easing), Tiled tilemap + tileset loading, spritesets, retained-mode UI
widgets (button, slider, toggle, modal, text input, theming), dialogue with scripts, audio mixer,
persisted storage, and a React `GameProvider` shell.

**Naming criteria:**

- Fits the existing app family — short, concrete, slightly-off nouns (`dram`, `foam`, `headwind`, `riffle`).
- npm package name free.
- npm org / scope free.
- GitHub org free.

**How availability was checked** (2026-08-06):

- npm package — `https://registry.npmjs.org/<name>` → 404 means free.
- npm org / scope — `https://registry.npmjs.org/-/org/<name>/package` → 404 (`Scope not found`) means free.
  Validated that this covers *user*-owned scopes too: `sindresorhus` (a user, not an org) returns 200.
  The dedicated user endpoint (`/-/user/org.couchdb.user:<name>`) now returns 401 for everyone, so this
  is the only anonymous scope check.
- GitHub — `gh api users/<name>` → 404 means free (covers both users and orgs; they share one namespace).
- Domains — `https://rdap.org/domain/<domain>` **with redirects followed** → 404 means unregistered.

Note: an npm 404 confirms nothing is published, but npm can still reject a name at publish time under
its similarity rules. Hard-confirm with `npm publish --dry-run` before committing to a name.

---

## Candidate: `foliot`

The oscillating bar of the earliest mechanical clock escapements — the weighted arm whose swing
regulates the tick. Fits the engine's scheduler-centric core, and reads as a concrete object rather
than a technology word.

**Checked 2026-08-06:**

| Asset | Status |
| --- | --- |
| npm package `foliot` | ✅ free — registry 404, zero near-collisions in search |
| npm org / scope `@foliot` | ✅ free |
| GitHub `foliot` | ❌ taken — dormant *personal* account (created 2012, 0 public repos, 2 gists, 6 followers). GitHub does not reclaim inactive usernames. |
| GitHub `foliotjs` | ✅ free |
| GitHub `foliot-js` | ✅ free |
| GitHub `foliotengine` | ✅ free |
| GitHub `foliotlabs` | ✅ free |
| GitHub `foliothq` | ✅ free |
| GitHub `usefoliot` / `getfoliot` / `foliotdev` / `thefoliot` | ✅ free |
| GitHub `foliot-dev` | ❌ taken |
| `foliot.dev` | ✅ available |
| `foliot.io` | ✅ available |
| `foliot.net` | ✅ available |
| `foliot.app` | ✅ available |
| `foliot.com` | ❌ registered |
| `foliot.org` | ❌ registered |

**Assessment:** the only miss is the bare GitHub username. Likely not blocking — the engine would live
in the existing `jakubmazanec/apps` monorepo, so an org is only needed if it is ever split out.
`foliotjs` + `foliot.dev` are the natural fallbacks.

---

## Candidate: `tellurion`

A clockwork model of the Earth's rotation and orbit — an orrery specialised to day, night and seasons.
A small mechanical world that runs on its own, which is what the engine is.

**Checked 2026-08-06:**

| Asset | Status |
| --- | --- |
| npm package `tellurion` | ✅ free — registry 404, zero near-collisions in search |
| npm org / scope `@tellurion` | ✅ free |
| GitHub `tellurion` | ❌ taken — personal account since 2008, 13 public repos (last push 2020), profile updated Feb 2026. In use, unlike foliot's. |
| GitHub `tellurionjs` | ✅ free |
| GitHub `tellurion-js` | ✅ free |
| GitHub `tellurionengine` | ✅ free |
| GitHub `tellurionlabs` | ✅ free |
| GitHub `tellurionhq` | ✅ free |
| GitHub `usetellurion` / `thetellurion` | ✅ free |
| GitHub `tellurion-dev` / `telluriondev` | ❌ taken |
| `tellurion.io` | ✅ available |
| `tellurion.com` · `.dev` · `.org` · `.net` · `.app` | ❌ all registered |

**Assessment:** ties `foliot` on npm — both fully clear. Weaker tail: one open domain against foliot's
four, and the GitHub squatter is an account in actual use rather than an empty one. Longer and softer
than the `dram`/`riffle` family, but unambiguous and unmistakably a made object.

---

## Also clean on npm (GitHub taken)

Checked 2026-08-06, kept for reference:

| Name | npm package | npm org | GitHub |
| --- | --- | --- | --- |
| `escapement` | ✅ free | ✅ free | ❌ taken |
| `fusee` | ✅ free | ✅ free | ❌ taken |
| `remontoire` | ✅ free | ✅ free | ❌ taken |
| `thaumatrope` | ✅ free | ✅ free | ❌ taken |
| `maquette` | ❌ taken | ✅ free | ❌ taken |
| `gridiron` | ❌ taken | ✅ free | ❌ taken |
| `quoin` | ✅ free | ❌ taken | ❌ taken |
| `mullion` | ✅ free | ❌ taken | ❌ taken |
| `detent` | ✅ free | ❌ taken | ❌ taken |
| `selvage` | ✅ free | ❌ taken | ❌ taken |

**Observation:** across 20 names checked, the bare GitHub username was taken every single time —
that namespace is exhaustively squatted, including obscure words. Requiring a free GitHub org will keep
killing otherwise-clean names; `<name>js` or `<name>labs` is the realistic fallback.

## Rejected

`kiln` — npm package, `@kiln` scope, and `github.com/kiln` (an organization) are all taken.

Common single-syllable nouns are exhausted on npm. Verified taken: `loom`, `flint`, `ember`, `hearth`,
`flue`, `stoke`, `glaze`, `grog`, `bisque`, `muffle`, `clinker`, `raku`, `firebox`, `refractory`,
`cadence`, `tessera`, `diorama`, `mote`, `gantry`, `plinth`, `stagecraft`, `pawl`, `corbel`,
`armature`, `scrim`, `zoetrope`, `mainspring`, `orrery`, `heddle`.

---

## Batch 2 — checked 2026-08-06 (later the same day)

46 new words swept (mechanism, letterpress, weaving, water-mill, optical-toy, nautical vocabulary).
Ten survived with npm package **and** npm scope free; two of those are clean on bare GitHub as well —
the first full sweeps found across both batches.

| Name | What it is | npm package | npm scope | GitHub | GitHub squatter |
| --- | --- | --- | --- | --- | --- |
| `mutoscope` | hand-cranked flip-book movie machine (penny-arcade cabinet) | ✅ free | ✅ free | ✅ **free** | — |
| `praxinoscope` | Reynaud's spinning-mirror animation toy | ✅ free | ✅ free | ✅ **free** | — |
| `treadle` | foot-lever that powers a loom / lathe / sewing machine | ✅ free | ✅ free | ❌ | org, 2022, 4 repos |
| `frisket` | letterpress mask that holds the sheet, masks non-printing areas | ✅ free | ✅ free | ❌ | empty user, 2013 |
| `reglet` | thin letterpress spacing strip | ✅ free | ✅ free | ❌ | empty user, 2010 |
| `tympan` | padded packing layer on a press platen | ✅ free | ✅ free | ❌ | **active** org (Tympan hearing-aid project, 24 repos, 81 followers) |
| `squinch` | corner arch that seats a round dome on a square tower | ✅ free | ✅ free | ❌ | user, 2018, 1 repo |
| `bandalore` | the 18th-century word for a yo-yo | ✅ free | ✅ free | ❌ | empty user, 2020 |
| `gudgeon` | socket bearing a pintle pivots in (rudder hinges); also a small fish | ✅ free | ✅ free | ❌ | user, 2013, 1 repo |
| `trunnion` | side pivots a cannon or engine cylinder rocks on | ✅ free | ✅ free | ❌ | org, 2020, 3 repos |

The `<name>js` GitHub fallback is free for all eight names whose bare name is taken.

Also fully npm-clean but weaker fits, kept as spares: `girandole` (revolving firework / branched
candelabrum), `taffrail` (ship's stern rail), `travisher` (chairmaker's curved shave).

Dead this round — package free but scope taken: `epicycle`, `fairlead`, `ferrule`, `finial`, `froe`,
`lucet`, `tailrace`, `teetotum`. Package taken: `gnomon`, `trammel`, `pantograph`, `clepsydra`,
`binnacle`, `bobbin`, `capstan`, `deadeye`, `deckle`, `burin`, `flywheel`, `gimbal`, `leat`,
`marlinspike`, `millrace`, `newel`, `oriel`, `penstock`, `quire`, `sluice`, `swage`, `transom`,
`whirligig`, `windlass`.
