# Wyrmway Saga — project guide

Wyrmway Saga (working title) is a third Foundry VTT game system built from this repo, alongside `pf2e` and `sf2e`.
It plays as **Pathfinder 2e by default**. D&D 5.5e (2024) mechanics are added only where we have deliberately
chosen to change something.

- **Branch:** `wyrmway/main`, cut from `v14-dev`. All Wyrmway work goes here or on feature branches off it.
- **Remotes:** `origin` = AlexClark/pf2e (our fork), `upstream` = foundryvtt/pf2e. Bring in upstream changes by
  merging `upstream/v14-dev` into `wyrmway/main`.
- **System ID (tentative):** `wyrmway`.
- **D&D 5e reference repo:** `D:\Projects\DnD5EFoundrySystem\dnd5e`, the official Foundry dnd5e system (read-only).
  See [Reference: D&D 5e system repo](#reference-dd-5e-system-repo) below for a map of it.
- **Design docs:** `docs/`. Start at [docs/README.md](docs/README.md). The upstream authors don't use AI tooling, so
  this file and `docs/` are the only AI-facing documentation in the repo.

## Guiding principles

1. **Pathfinder 2e is the baseline.** If a rule isn't recorded as changed in `docs/design/rules-delta.md`, it works
   exactly as in PF2e.
2. **Keep upstream merges cheap.** New mechanics are added in ways the pf2e and sf2e builds don't use, controlled by
   `SYSTEM_ID === "wyrmway"` checks, new opt-in data fields, or new files. Upstream behaviour is changed directly only
   when there's no other reasonable option, and each such change is recorded in `docs/upstream-touchpoints.md`.
   - Prefer new files over editing upstream files.
   - Keep edits to upstream files small and grouped together, so merge conflicts stay easy to read.
   - Don't reformat or tidy upstream code you aren't otherwise changing.
3. **Content comes from conversions.** Wyrmway compendiums (`packs/wyrmway/`) contain material converted from PF2e
   and from D&D 5e SRD content.
4. **The user makes the design decisions.** Discuss mechanics design in prose and lay out the trade-offs. Don't
   reduce a creative decision to a multiple-choice prompt, and don't invent rules that haven't been agreed.

## How this repo builds a system (summary)

A single codebase builds each system. The build target is chosen with `--system=<id>`:

- `pnpm run build --system=<id>` runs `build/build-system.ts`. That script sets the `SYSTEM_ID` environment variable
  and runs `vite build`. Output goes to `dist/<id>/`.
- `pnpm run build:packs --system=<id>` compiles the JSON in `packs/<id>/` into LevelDB databases in
  `dist/<id>/packs/`.
- `pnpm run hot --system=<id>` starts the Vite dev server. `pnpm run link` symlinks `dist/<id>` into Foundry's data
  folder.

### Files each system has

| What | Where |
|---|---|
| Manifest | `system.<id>.json` (copied to `dist/<id>/system.json`) |
| Compendium source | `packs/<id>/<pack>/*.json` |
| UUID redirects | `build/uuid-redirects/<id>.json` |
| Banners | `static/assets/system-banners/<id>/` |
| Extra SCSS | `src/styles/<id>/` (sf2e's is added in `vite.config.ts` `css.preprocessorOptions`) |
| Lang overrides | `static/lang/<id>-overrides-en.json`, listed in the manifest's `languages` |

### Compile-time constants

`vite.config.ts` sets these as `define` constants: `SYSTEM_ID`, `SYSTEM_NAME`, `CONDITION_SOURCES` (from the
system's conditions pack via `build/conditions.ts`), `UUID_REDIRECTS`, `EN_JSON` and `ROLL_PARSER`.
`type SystemId` is declared in `src/global.ts`. Across the code, `SYSTEM_ID` appears in about 230 files, mostly as
`flags[SYSTEM_ID]` and `game.settings.get(SYSTEM_ID, …)`. About 21 places check it explicitly
(`SYSTEM_ID === "pf2e"` and similar).

### Content shared with pf2e (sf2e's current model)

- `build/duplicates.json` lists pf2e documents to copy into sf2e packs at build time.
- `build/lib/compendium-pack.ts` (in `loadJSON`, `#adjustPF2eDocumentForSF2e` and `sf2eCompendiumRemap`) makes the
  copies and rewrites links.
- `vite.config.ts` `adjustUUIDForSF2e` rewrites `Compendium.pf2e.*` UUIDs in the lang files.

### Releases

`.github/workflows/release.yml` is run manually and takes a `system` input. It builds the system, zips
`dist/<id>/`, and publishes a GitHub release tagged `<id>-<version>`. Foundry checks for updates using the
manifest's `manifest` URL, which points at the root `system.<id>.json` on a branch, so bump `version` and
`download` there.

### Places that assume only two systems

These must be reworked when the `wyrmway` ID is added:

- `vite.config.ts`:
  - picks the manifest with `SYSTEM_ID === "sf2e" ? … : pf2e`, so any other ID quietly builds as pf2e
  - sets `SYSTEM_NAME` with a pf2e/sf2e choice
  - the `moveSystemBanners` plugin assumes there is exactly one "other" system
- The `--system` `choices` arrays in `build/build-system.ts`, `build-packs.ts`, `conditions.ts` and `hmr.ts`.
- `type SystemId` in `src/global.ts`.
- `build/link-foundry.ts` (its package list) and the options in `.github/workflows/release.yml`.
- Every `SYSTEM_ID === "pf2e" ? A : B` check in `src/`, which would send wyrmway down the sf2e path. Each one needs
  a decision.
- `build/conditions.ts` and `compendium-pack.ts` copy shared pf2e content only for `sf2e`.
- `build/lib/compendium-pack.ts`:
  - The `LINK_PATTERNS` and `convertUUID` regexes match only `Compendium.(pf2e|sf2e)`, so `Compendium.wyrmway…`
    links wouldn't be resolved.
  - `save()` picks between the pf2e and sf2e manifests.
  
  See [docs/engineering/build-and-content-pipeline.md](docs/engineering/build-and-content-pipeline.md).

## Reference: D&D 5e system repo

`D:\Projects\DnD5EFoundrySystem\dnd5e` is the official Foundry dnd5e system: plain JS (`.mjs`), v6.0.x, built for
Foundry 14. Read it to see how 5e mechanics are modelled. Don't edit it.

| Path | Contents |
|---|---|
| `module/config.mjs` | Core 5e configuration: abilities, skills, conditions, damage types and so on |
| `module/data/` | DataModels for actors and items |
| `module/documents/` | Actor and Item logic: rolls, rests, advancement |
| `module/dice/` | d20 rolls, advantage/disadvantage |
| `module/rules/` | Rules helpers |
| `packs/_source/` | SRD compendium source |

**Licensing:**
- dnd5e's code is MIT licensed, so it can be adapted with attribution.
- Only SRD 5.1 and SRD 5.2 content (CC-BY-4.0) may be converted. Non-SRD 5.5e material must not be copied into
  packs. The required attribution text is in dnd5e's `README.md` under "Licenses".
- PF2e content is under ORC/OGL (`static/licenses/`).

## Working conventions

- This repo is TypeScript with Svelte and Handlebars, linted with ESLint and Prettier (`npm run lint`), and tested
  with vitest (`npm test`). Follow the style of the surrounding code.
- `docs/` was ignored upstream (an unused typedoc output folder). We stopped ignoring it on this branch, so typedoc
  must not be pointed at `docs/`.
- Record each upstream file we change, and why, in `docs/upstream-touchpoints.md` as part of the same change.
