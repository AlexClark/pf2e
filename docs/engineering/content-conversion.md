# Content conversion

How Wyrmway gets Pathfinder content, and how that content stays current when upstream changes. Agreed 2026-10-05.

The rules themselves live in [../design/rules-delta.md](../design/rules-delta.md). This document is the pipeline those rules run through. [wyrmway-build-target.md](wyrmway-build-target.md) is the earlier milestone: a third system id that still plays as PF2e. The converter described here is added once a rule needs it.

## What is committed

`packs/pf2e/` stays the source library. The Wyrmway pack build reads it and writes LevelDB to `dist/wyrmway/packs/`.

Git holds a Wyrmway document only when a person has edited or removed it:

- `packs/wyrmway/<pack>/<slug>.json` replaces the inherited document of the same slug.
- An exclusion list drops a document that has no replacement. A removed class, and the feats that exist only for that class, are exclusions.

Everything else is rebuilt. A full copy of the library, and bringing documents across one file at a time, were both rejected. The universal changes (proficiency, advantage, spell points) touch most creatures and spellcasting entries, so a committed copy would conflict with every upstream errata pass.

Starfinder packs are not part of the baseline. A Starfinder document that is wanted later is an explicit inclusion, run through the same converter.

Packs enter through an allow-list. The first list is the packs a campaign needs (conditions, actions, classes, class features, ancestries, backgrounds, feats, spells, equipment, Monster Core, NPC Core). An adventure bestiary is added by listing it, and the same converter covers it.

## What the converter stores

The converter splits a baked Pathfinder number into the inputs the new model needs. It does not write the final Wyrmway number.

A creature save, skill, strike, armor class, or spell DC keeps:

- the proficiency rank
- the ability that feeds it
- the residual left after the Pathfinder formula accounts for level and rank

A creature that sits off the Pathfinder curve keeps that offset as the residual. The Pathfinder formula stays in the converter permanently, as the splitter, including after the game itself has stopped using it.

Spellcasting entries keep the input a spell-point rule needs (the slot array, or a budget derived from it). Condition data keeps the input an advantage rule needs. Spell text, rank, and tradition stay as inherited fields.

The proficiency, spell-point, and advantage code compute the live DC, pool, and roll when the actor is prepared. The proficiency formula and the shared core-proficiency schedule are in [../design/rules-delta.md](../design/rules-delta.md). Creature defenses move with that on-rate bonus. A residual taken from today's stat block preserves today's hit rate only while the character's bonus is unchanged. Trying a different formula is a code change. Packs are rebuilt when Pathfinder source changes, or when the converter's idea of an input changes.

## Passes

One pipeline, fixed order, each pass pure:

1. Split baked numbers into rank, ability, and residual.
2. Map condition references onto the advantage model.
3. Convert spellcasting entries into spell-point inputs.
4. Apply exclusions.
5. Apply any hand-written file from `packs/wyrmway/`.

The LevelDB pack is the output of the last pass. Alongside the new fields, every built document still gets the id rewrites from the build-target plan: `Compendium.wyrmway`, `flags.wyrmway`, `systems/wyrmway/`, and `_stats.systemId` of `wyrmway`. Pack ids stay the Pathfinder ids.

Each built document records the Pathfinder uuid and source revision it came from. When upstream edits a file that also has a hand-written override, the build names that file.

`pnpm extractPacks --system=wyrmway` must not write the converted library back into `packs/wyrmway/`. Extraction is for hand-written documents only.

## How large a model change can be

Change the data model when that is what makes a rule tunable. Proficiency is the example: player characters already compute their statistics, and creatures store finished integers (`base` on skills, `value` on saves, `mod` on perception, `value` on armor class, `spelldc` on a spellcasting entry). Those integers become inputs plus a computed result, so the sheet, the strike, and the spell DC all read the same calculator.

New behavior goes in new fields and new files. An upstream file gets a thin hook. Rewriting a shared model such as `src/module/actor/npc/data.ts` in place makes every later merge from `upstream/v14-dev` a rewrite of the same work.

A model change waits on the rule it serves. Proficiency, roll mode, and spell points qualify because they are universal. Other subsystems stay as they are until a rule needs them.
