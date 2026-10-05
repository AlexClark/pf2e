# Build and content pipeline

This doc covers how the repo turns source files into an installable Foundry system, the format compendium content
is stored in for each repo, and how we would read, transform and rebuild content for Wyrmway. It was written from
`v14-dev` on 2026-10-04.

## 1. Two independent builds

`pnpm run build --system=<id>` runs two scripts in parallel. They don't share any output.

| Step | Script | Input | Output |
|---|---|---|---|
| Code | `build:system` → `build/build-system.ts` → `vite build` | `src/pf2e.ts` (all TS, Svelte, SCSS), `static/` (copied as-is), `system.<id>.json` | `dist/<id>/<id>.mjs`, `vendor.mjs`, `styles/<id>.css`, `system.json`, assets, lang, templates |
| Packs | `build:packs` → `build/build-packs.ts` | `packs/<id>/<pack>/**/*.json` | `dist/<id>/packs/<pack>/` (LevelDB) |

- **The code build** bakes some compile-time constants into the bundle (see CLAUDE.md). One of them is
  `CONDITION_SOURCES`. To produce it, `vite.config.ts` runs `build/conditions.ts`, which loads the
  conditions/actions/spells packs. That means the code build also reads pack JSON.
- **The pack build** never touches `src/` at runtime. It imports TS types and a few helpers from `src/`, but it's a
  plain Node script run with `tsx`.
- **Measured locally:** `build-packs --system=sf2e` (30 packs) takes about 75 seconds. Expect pf2e (98 packs) to take
  several minutes.

## 2. PF2e content source format (`packs/<id>/`)

Content is **committed as plain JSON**, so nothing has to be extracted before it can be read. Every rule below is
enforced by `build/lib/compendium-pack.ts`. A violation stops the build (`PackError` calls `process.exit(1)`).

### Layout

- There is one document per file. **The filename must equal `sluggify(name) + ".json"`.**
- Subdirectories are only for organisation. Folder membership comes from the document's `folder` id together with
  `_folders.json` in the pack root. Folders can be nested at most 4 levels deep.
- The pack directory must match a `packs[].path` entry in `system.<id>.json`. That entry supplies the pack's `name`
  (its ID) and its document `type`.
- Names must be unique within a pack, and `_id`s must not collide.

### Source is pruned

Files hold only what an author wrote. The extractor (`build/lib/extractor.ts`) and `run-migration.ts` strip:

- `_stats`, `effects`, `system.slug`, `system._migration`, `sort`, `ownership`
- flags that are empty or don't belong to the system
- many default values

The missing fields are filled in at runtime by `static/template.json` and the DataModels. Derived values, such as a
character's computed modifiers, never appear in source. NPCs store their stat block directly.

### Links are stored by name, not ID

Links look like this:

```
@UUID[Compendium.pf2e.feats-srd.Item.Specialty Crafting]
{"key": "GrantItem", "uuid": "Compendium.pf2e.feats-srd.Item.Specialty Crafting"}
```

At build time `#finalize` / `convertUUIDs` turn these into ID links. That covers description HTML, every
`system.rules` string, `selfEffect`, ABC (ancestry, background, class) `system.items`, and deity spells. The
consequences:

- Renaming a document breaks every link to it.
- A link to a name that doesn't exist fails the build.

### Rule elements are data plus code

Each rule element is a JSON object in `system.rules` (with `key`, `predicate` and so on). The behaviour behind each
key lives in `src/module/rules/rule-element/`. Converting content means editing the JSON. A new *kind* of mechanic
means a new rule element class in code.

### What the build adds or checks

- **Adds:**
  - stamps `_stats` (system ID and version, core version) and `compendiumSource`
  - stamps `system._migration` at the latest schema version
  - sets `system.slug`
  - clears `effects`
  - marks physical items as worn
- **Checks:**
  - every `img` exists under `static/` (with `systems/<id>/` stripped) or is in `build/core-icons.json`
  - images are `.webp` or `.svg` only, with no base64
  - there are no world links
  - feat categories are valid
  - NPC sizes are valid
  - linked weapons are present

## 3. Tools we can reuse for transforming content

| Tool | What it does | Relevance |
|---|---|---|
| `pnpm migrate` (`build/run-migration.ts`) | Loads every pack JSON with no Foundry running (`build/global.ts` provides a JSDOM shim, `migration-global.ts` sets `SYSTEM_ID`). It applies `MigrationBase` subclasses from `src/module/migration/migrations/`, removes default values, and writes back with sorted keys and 4-space indentation, only when something changed. | **The model for our conversion scripts.** It shows that system TS code and types work outside Foundry. |
| `CompendiumPack.loadJSON(dir, { systemId })` | Reads a pack, validates it, and builds a name→id map across every loaded pack. | Reading pf2e content with validation, and resolving links. |
| `pnpm extractPacks <pack\|all> --system=<id>` | Converts LevelDB in `dist/<id>/packs` back to pruned JSON in `packs/<id>`, turning ID links back into names. | Round trip: build, edit in the Foundry UI, extract, commit. |
| `build/anachronism/index.ts` | Loads **both** systems' packs, detects overlaps, and rewrites `Compendium.pf2e|sf2e` UUIDs to build cross-system modules. | The closest existing example of a cross-system content transform. |
| `build/duplicates.json` + `#adjustPF2eDocumentForSF2e` | Copies listed pf2e documents into sf2e packs **at build time**, renaming flags, paths and UUIDs. | The model for "inherit pf2e content without copying it". |

## 4. D&D 5e content source format (`D:\Projects\DnD5EFoundrySystem\dnd5e\packs\_source\`)

- **Format:**
  - YAML, one document per file, in 23 pack folders (about 4,900 files)
  - built with `@foundryvtt/foundryvtt-cli` (`utils/packs.mjs`)
  - `js-yaml` is already in pf2e's `node_modules`
- **Documents are full, not pruned.** They include `_id`, `_key` (`!items!<id>`), `_stats`, `ownership` and
  `folder`.
- **Links are by ID:** `@UUID[Compendium.dnd5e.<pack>.Item.<id>]` (about 6,600 occurrences).
- **The data model is completely different from pf2e:**
  - `system.activities` (attacks, saves, uses)
  - `system.advancement` (ASI, grants, scale values)
  - `system.source.rules: "2014" | "2024"`
  - inline enrichers such as `[[/attack extended]]`, `[[/damage …]]`, `[[/save ability=wis]]`,
    `&Reference[Grappled]`, which pf2e doesn't understand
  
  Converting 5e content is a translation done by hand-designed mappings, not a copy.
- **Which packs are which SRD:**
  - Packs flagged `sourceBook: "SRD 5.1"` are the 2014 rules: `monsters`, `items`, `spells`, `classes`,
    `classfeatures` and others.
  - Packs suffixed `24` are SRD 5.2 (2024): `classes24`, `origins24`, `feats24`, `spells24`, `equipment24`,
    `actors24`, `monsterfeatures24`, `content24` and others.
  - Each document carries `system.source.license` (`CC-BY-4.0`).
- **Images:** about 3,600 point at Foundry core `icons/…`, which pf2e's `core-icons.json` may already list. 162 point
  at `systems/dnd5e/…`; those files would need copying under their own asset licence, or replacing.

## 5. Can we read content from either system?

**Yes.** Reading is not a problem: pf2e content is plain JSON in this repo, and dnd5e content is plain YAML in the
other repo. The friction is in **writing valid output and building it under a third system ID**:

1. **Regexes hard-coded to `pf2e|sf2e`** in `compendium-pack.ts` (`LINK_PATTERNS.compendium`,
   `LINK_PATTERNS.uuid`, the `convertUUID` patterns). A `Compendium.wyrmway.…` link wouldn't be resolved from name
   to ID, so it would quietly stay a broken name link.
2. **Two-way manifest choices:**
   - `CompendiumPack.save()` uses `systemId === "pf2e" ? pf2eManifest : sf2eManifest`.
   - The `--system` `choices` arrays limit every script to pf2e and sf2e.
3. **Cross-system link rewriting.** Converted pf2e documents still say `Compendium.pf2e.<pack>…`. Each one must be
   pointed at the wyrmway pack holding that document, or the build must inherit the target (see the content strategy
   in section 6).
4. **Images.** Every `img` has to exist in our `static/` or in the core-icons list, so dnd5e system images can't be
   referenced as they are.
5. **5e enrichers and data structures don't carry over.** Converting activities, advancement and enrichers into
   pf2e equivalents needs a mapping we design ourselves.
6. **Filename and name coupling.** Renaming during conversion means the file has to be renamed too, and links to it
   rewritten.

## 6. Proposed conversion loop

1. **Read**
   - pf2e: `CompendiumPack.loadJSON` (validated, gives name maps) or plain `JSON.parse`
   - dnd5e: `js-yaml` load
2. **Transform** with a TypeScript script under `build/wyrmway/`, run by `tsx`.
   - It imports `ItemSourcePF2e`, `ActorSourcePF2e` and the like, so the output is type-checked against the real
     source types.
   - Shared steps (link rewriting, ID generation, provenance) go in library code.
   - Steps specific to each piece of content go in small transform functions, much like `MigrationBase`.
3. **Write** to `packs/wyrmway/<pack>/…/<slug>.json`.
   - Use `run-migration`'s `jsonStringifyOrder` format, remove default values, and keep `_folders.json` up to date.
   - Record where each document came from, for example
     `flags.wyrmway.source = { system, uuid, revision }`, so later upstream changes to the original can be spotted.
4. **Register** the pack in `system.wyrmway.json` `packs[]`.
5. **Build** with `pnpm run build:packs --system=wyrmway`. Validation catches bad images, broken links and naming
   errors.
6. **Test in Foundry** with `pnpm run link` and `pnpm run hot --system=wyrmway`.
7. **Optional round trip:** edit in the Foundry UI, then `pnpm extractPacks <pack> --system=wyrmway` and commit.

### Open design question: content strategy

There are two ways to get PF2e content into Wyrmway:

- **Copy.** Generate committed JSON in `packs/wyrmway/` once, then edit it by hand. Everything is visible and
  editable, but upstream pf2e fixes have to be pulled in deliberately (the provenance flag makes that possible).
- **Inherit at build time**, as sf2e does with `duplicates.json`. PF2e content we haven't changed is pulled from
  `packs/pf2e/` during the Wyrmway build and transformed on the fly. Upstream fixes arrive for free, but the content
  isn't in our tree, so the transforms must be reliable.

A **hybrid** is likely to work best: inherit PF2e documents that are unchanged or changed only mechanically, and
copy documents once we start editing them by hand. That choice should wait until the rules delta shows how much PF2e
content changes.
