# Plan: build Wyrmway as a third system

This plan gets `wyrmway` through the existing build. It does not change any rules. Pathfinder 2e stays the baseline, which is already the rule in [../design/rules-delta.md](../design/rules-delta.md): nothing has been agreed yet, so the built system plays as PF2e under a new id.

When this work is done, these commands succeed:

```
pnpm run build --system=wyrmway
pnpm run hot --system=wyrmway
pnpm run link
```

`build` runs the code build and the pack build. The code build emits `dist/wyrmway/wyrmway.mjs`, `vendor.mjs`, `styles/wyrmway.css`, and `system.json`. The pack build emits LevelDB packs under `dist/wyrmway/packs/`. `hot` serves that system. `link` symlinks `dist/wyrmway` into Foundry's `Data/systems` folder.

The same commands for `pf2e` and `sf2e` keep working.

## Standing rule for every fork

Today a third id is unsafe in two different ways.

- The build scripts reject anything except `pf2e` and `sf2e`. Vite does not. `vite.config.ts` treats every id other than `sf2e` as pf2e, so a wyrmway code build that slipped through would silently emit a pf2e manifest and a `pf2e.mjs` bundle.
- Most runtime forks are written `SYSTEM_ID === "pf2e" ? pf2eBehavior : sf2eBehavior`. Wyrmway would take the Starfinder branch: steel token ring, credits, Pact Common, the `sf2e.conditions` pack, and so on.

For this work, Starfinder behavior stays behind `SYSTEM_ID === "sf2e"`. Every other id, including `wyrmway`, takes the PF2e branch. A later rules-delta entry replaces one of those call sites with an explicit wyrmway branch. This plan adds none.

Add one helper, in a new file, and use it at the call sites below:

```ts
/** PF2e is the baseline. Only sf2e opts out. */
const RULES_SYSTEM: "pf2e" | "sf2e" = SYSTEM_ID === "sf2e" ? "sf2e" : "pf2e";
```

`RULES_SYSTEM` is for data and rules that already differ between the two upstream systems. It is not a place to put Wyrmway mechanics.

## How content gets into the build

`pnpm run build:packs` throws if `packs/<id>/` has no packs. The code build also runs `build/conditions.ts`, which reads the actions, adventure-specific-actions, bestiary-ability-glossary-srd, spells, conditions, and campaign-effects packs in order to bake `CONDITION_SOURCES` into the bundle. An empty `packs/wyrmway/` fails both steps, and a system with no conditions throws the first time play looks one up.

This milestone inherits `packs/pf2e/` at build time and writes the result only to `dist/wyrmway/`. Nothing is copied into `packs/wyrmway/`. The ongoing conversion model — bases instead of baked numbers, converter passes, the pack allow-list, and hand-written overrides — is recorded in [content-conversion.md](content-conversion.md). This milestone does not implement those passes. It only makes the id buildable, so the documents it emits are still Pathfinder-shaped apart from the rewrites below.

Inheritance does four rewrites on the way out, and no others:

- `Compendium.pf2e.` becomes `Compendium.wyrmway.` Pack ids stay the PF2e ids (`conditionitems`, `actionspf2e`, `feats-srd`, and the rest). Wyrmway does not adopt the SF2e renames (`conditions`, `actions`, stripping `-srd`).
- `flags.pf2e` becomes `flags.wyrmway`. Runtime reads `flags[SYSTEM_ID]`.
- `systems/pf2e/` becomes `systems/wyrmway/`. Foundry resolves those paths against the installed system.
- `_stats.systemId` is stamped `wyrmway` by the pack finalizer, which already stamps the active id.

Do not run the SF2e duplicate merger (`build/duplicates.json`, `#adjustPF2eDocumentForSF2e`). Those copies exist because SF2e ships a reduced pack set. Wyrmway inherits the full PF2e set.

`pnpm extractPacks --system=wyrmway` must refuse to run while a pack has no committed Wyrmway documents. The extractor writes `dist/<id>/packs` back to `packs/<id>/`. Running it on an inherited build would dump the whole PF2e library into `packs/wyrmway/`.

## Manifest

Do not commit a hand-copied `system.wyrmway.json`. `system.pf2e.json` carries the document types and the full pack list. A second copy would conflict on every upstream pack change.

Add `build/wyrmway/manifest.ts` that reads `system.pf2e.json` and returns the wyrmway manifest:

| Field | Value |
|---|---|
| `id` | `wyrmway` |
| `title` | `Wyrmway Saga` |
| `description` | A PF2e-baseline system. No rules text beyond that. |
| `version`, `compatibility` | Copied from the pf2e manifest, so the build tracks the code it was cut from. |
| `esmodules` | `vendor.mjs`, `wyrmway.mjs` |
| `styles` | `styles/wyrmway.css` |
| `background` | `systems/wyrmway/assets/system-banners/03.webp` |
| `packs` | The pf2e pack list. Each entry's `system` becomes `wyrmway`. Each `banner` path swaps `systems/pf2e/` for `systems/wyrmway/`. Pack `name` and `path` stay as in pf2e. |
| `languages` | The pf2e list. No override file yet. |
| `manifest`, `download`, `url`, `bugs` | Point at `AlexClark/pf2e` rather than `foundryvtt/pf2e`. Leave `download` as a placeholder until a release exists. |

`vite.config.ts`, `CompendiumPack`, and the extractor currently choose a manifest with `systemId === "pf2e" ? pf2e : sf2e`. Route all three through one `manifestFor(systemId)` helper. The production copy step writes the derived object to `dist/wyrmway/system.json` instead of copying a file that does not exist.

`build/uuid-redirects/wyrmway.json` is `{}`. `getUuidRedirects` only rewrites entries that exist. PF2e's redirect table is world-migration history for pf2e documents, and copying it would point wyrmway at packs this system does not need to alias.

## Build scripts

Put the id list in one new module, `build/systems.ts`:

```ts
const SYSTEM_IDS = ["pf2e", "sf2e", "wyrmway"] as const;
```

Use it as the yargs `choices` array in:

- `build/build-system.ts`
- `build/build-packs.ts`
- `build/conditions.ts`
- `build/hmr.ts`
- `build/extract-packs.ts`
- `build/migration-global.ts`

`build/link-foundry.ts` symlinks `pf2e`, `sf2e`, and both anachronism modules. Add `wyrmway` beside the two systems. Leave the anachronism modules alone. They are a pf2e/sf2e cross-link tool and are not part of this system.

`.github/workflows/release.yml` adds `wyrmway` to the `system` choice. The workflow can build a zip after this plan. Publishing one is a separate step, because the manifest `download` URL has nowhere to point yet.

### `vite.config.ts`

- Select the manifest with `manifestFor`. An unknown id is an error, not a silent pf2e build.
- `SYSTEM_NAME` becomes `Wyrmway` for this id. Extend `type SystemName` in `src/global.ts` with `"Wyrmway"`. The string is the log prefix (`Wyrmway System | …`). The Foundry title stays `Wyrmway Saga`.
- `type SystemId` in `src/global.ts` gains `"wyrmway"`.
- `moveSystemBanners` deletes every banner directory other than the one being built, then flattens that directory. The current code assumes the only other id is the opposite of `pf2e`/`sf2e`. Building pf2e must also remove a `wyrmway/` folder, and building wyrmway must remove both of the others.
- Copy `static/assets/system-banners/pf2e/{01,02,03}.webp` to `static/assets/system-banners/wyrmway/`. The production plugin `readdir`s that folder and fails if it is missing. These are placeholder copies of the PF2e banners, not new art.
- `transformLangFile` and the dev-server `en.json` handler currently rewrite every non-pf2e build with `adjustUUIDForSF2e`, which renames packs (`conditionitems` → `conditions`, `actionspf2e` → `actions`, strips `-srd`). Gate that rewriter with `SYSTEM_ID === "sf2e"`. Wyrmway gets a separate replace of `Compendium.pf2e.` → `Compendium.wyrmway.` and nothing else. `static/lang/en.json` links conditions by those pf2e pack ids, and the inherited packs keep them.
- The SCSS hook that imports `sf2e/index` is already `SYSTEM_ID === "sf2e"`. Leave it. Do not add a `src/styles/wyrmway/` entry until there is styling to put there.

### Pack loading

`getPackJSONPaths` looks at `packs/<systemId>/<pack>/` and returns `[]` when the directory is absent. For `wyrmway`, read `packs/pf2e/<pack>/` for any document that `packs/wyrmway/<pack>/` does not already contain. A committed Wyrmway file with the same slug wins. `_folders.json` follows the same rule: use the Wyrmway file when it exists, otherwise the PF2e file.

`build/build-packs.ts` discovers packs with `readdir("packs/<id>")`. For wyrmway, discover them from the derived manifest's pack paths, then let `loadJSON` apply the fallback above. An empty `packs/wyrmway/` must not throw "No data available to build packs."

`build/conditions.ts` loads two extra packs only when `systemId === "pf2e"`: `adventure-specific-actions`, and the condition items inside `campaign-effects`. Wyrmway needs both, or finalizing conditions fails on links into those packs. Drive that with `RULES_SYSTEM === "pf2e"` (or the build-side equivalent, `systemId !== "sf2e"`).

### Link resolution

`CompendiumPack.LINK_PATTERNS` and `convertUUID` match `Compendium.(pf2e|sf2e)` only. Description HTML is rewritten through `#sourceIdOf`, which already stamps the active system id, so inherited HTML links become `Compendium.wyrmway.<pack>.…` once the regex accepts the source text.

Rule elements take the other path. `convertUUID` replaces the document name with its id and leaves the system id in the string, so a wyrmway build would still emit `Compendium.pf2e.<pack>.Item.<id>`. While the active system is wyrmway, `convertUUID` must emit `wyrmway` in that position. Extend the match to `pf2e|sf2e|wyrmway` so a later document that is already written with `Compendium.wyrmway` still resolves.

The flag and `systems/pf2e/` rewrites happen in the same wyrmway pass, before finalize. Do not reuse `#adjustPF2eDocumentForSF2e`. That function also retitles publications and swaps a feat icon.

## Runtime forks that must take the PF2e branch

These are the `=== "pf2e" ? pf2e : sf2e` sites. Each one is wrong for a third id. Switch them to `RULES_SYSTEM`, and where the value is a compendium id, prefix it with `SYSTEM_ID` so the pack is `wyrmway.conditionitems` rather than `pf2e.conditionitems`.

| File | PF2e behavior wyrmway keeps |
|---|---|
| `src/module/system/conditions/manager.ts` | Pack `wyrmway.conditionitems`, not `sf2e.conditions`. |
| `src/module/apps/check-prompt-generator.ts` | Pack `wyrmway.actionspf2e`, not `sf2e.actions`. |
| `src/scripts/hooks/setup.ts` | Default token ring `coreBronze`. |
| `src/module/actor/creature/values.ts` | Index `LANGUAGES_BY_RARITY` with `RULES_SYSTEM`. Default common language `taldane`. Adding `wyrmway` to `SystemId` makes `LANGUAGES_BY_RARITY[SYSTEM_ID]` a type error, because that table has only `pf2e` and `sf2e` keys. `src/module/actor/creature/types.ts` indexes the same table and needs the same key type. |
| `src/module/item/physical/coins.ts` | Large-item price scale `2`. A bare number is gp. Decimal primary display uses gp. The zero unit is gp. The `=== "sf2e"` branches (credits normalization, credits display) already skip wyrmway. Leave those tests as `=== "sf2e"`. |
| `src/module/sheet/helpers.ts` | Magazine tag appears above 2 rounds, not above 1. |
| `src/module/actor/sheet/base.ts` | Show the gp/sp/cp currency block. |
| `src/module/actor/sheet/popups/update-currency-dialog.ts` | Same currency block. |
| `src/module/actor/sheet/popups/distribute-coins-dialog.ts` | Breaking coins stays available. |
| `src/scripts/hooks/render-settings.ts` | Show the remaster journal button. Its uuid is hard-coded to `Compendium.pf2e.journals.JournalEntry.6L2eweJuM8W7OCf2`. Use `Compendium.${SYSTEM_ID}.journals.…` so the inherited journal opens. |

## Sites that are already safe

These check `SYSTEM_ID === "sf2e"` and do nothing for any other id. Do not edit them in this work.

- `src/module/system/settings/world-clock.ts` keeps the Absalom Reckoning default (`AR`).
- `src/scripts/set-game-pf2e.ts` does not add the SF2e-only actions.
- `src/scripts/config/index.ts` does not add the Computers or Piloting skills.
- `src/module/item/weapon/document.ts` keeps the PF2e expend label.
- `vite.config.ts` does not import `sf2e/index.scss`.
- `src/module/item/physical/helpers.ts` `checkPhysicalItemSystemChange` returns `"pf2e" | "sf2e"` to mean archaic versus tech/analog items. That is an item trait, not the running system. Do not add `wyrmway` to that return type.

`build/anachronism/` stays a two-system tool. Its regexes and module manifests are out of scope.

`vitest.config.ts` keeps `SYSTEM_ID` as `pf2e`. Tests keep covering the PF2e branch. `RULES_SYSTEM` resolves to `"pf2e"` there.

## Docs to update in the same change

- `docs/upstream-touchpoints.md`: one row per upstream file edited, including why. New files (`build/systems.ts`, `build/wyrmway/manifest.ts`, `build/uuid-redirects/wyrmway.json`, the banner copies, the `RULES_SYSTEM` module) do not get rows.
- `CLAUDE.md` section "Places that assume only two systems": replace the completed items with what the code now does, and leave any item this plan did not touch.
- `docs/engineering/build-and-content-pipeline.md` sections 5 and 6: record that `wyrmway` is a real build id and point at [content-conversion.md](content-conversion.md) for how packs are produced.
- `docs/README.md`: link this plan from the index.

## Verification

1. `pnpm run build --system=wyrmway`. The pack half compiles the full PF2e library, so expect several minutes, in line with a pf2e pack build.
2. Confirm `dist/wyrmway/system.json` has `"id": "wyrmway"`, `"esmodules"` containing `wyrmway.mjs`, and pack entries whose `system` is `wyrmway`.
3. Open one built item (a condition is enough) and confirm `_stats.systemId` is `wyrmway`, a rule-element or description link starts with `Compendium.wyrmway.`, and `flags.pf2e` is gone.
4. `pnpm run build:system --system=pf2e` still emits `dist/pf2e`. This catches a bad manifest ternary.
5. `pnpm test` (lint plus vitest). The suite runs as pf2e.

A Foundry smoke test (launch, create a character, apply a condition, open the remaster journal from the settings sidebar) is the check that the baked pack ids and the currency sheet are right. Do that after the build is green.

## Out of scope

- Any entry in `docs/design/rules-delta.md`.
- D&D 5e conversion, new rule elements, and new compendium documents.
- The converter passes in [content-conversion.md](content-conversion.md). This plan only installs the id-rewrite inherit path the build needs in order to run.
- A `wyrmway-anachronism` module.
- New styling, a language override file, or original banner art.
- Cutting a GitHub release.
