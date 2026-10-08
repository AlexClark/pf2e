# Proficiency conversion tooling

Plan for the tool that rewrites baked Pathfinder numbers onto the Wyrmway proficiency formula. The formula itself is in [../design/rules-delta.md](../design/rules-delta.md). This document is how that formula gets onto documents, including ones that do not live in this repo.

Do not build this until the `wyrmway` system id builds. The pack pipeline that calls it is [content-conversion.md](content-conversion.md).

## What already exists

Player characters do not store the proficiency bonus. `createProficiencyModifier` in `src/module/actor/modifiers.ts` adds `level` plus a rank bonus of 0, 2, 4, 6, or 8. Changing that function updates character sheets. The proficiency-without-level variant is the same function with the level term removed and a separate bonus table. Wyrmway keeps those rank bonuses and replaces the level term with `floor((level - 1) / 4)`. It is not that variant.

Creatures, hazards, and many adventure checks store the finished number. A spellcasting entry on a creature keeps both the rank (`system.proficiency.value`) and the finished DC (`system.spelldc.dc` and `system.spelldc.value`). A strike stores only `system.bonus.value` on the melee item. Saves store `system.saves.*.value`. Perception stores `system.perception.mod`. Skills store `system.skills.*.base`. Armor class stores `system.attributes.ac.value`. None of those four store a rank.

Level-based DCs that go through `calculateDC` in `src/module/dc.ts` (identification, recall knowledge, and the standard DC table) update when that function learns the new curve. A DC written as a literal number in a journal, a feat, or an action does not.

[pf2e-flatten](https://github.com/League-of-Foundry-Developers/pf2e-flatten) is the Foundry module that applies proficiency without level to NPCs. It subtracts the creature's level from saves, skills, attacks, and spell DCs. It can reverse that, and it can do it when an NPC is dragged out of a compendium. It records the level it used, and it skips a creature it has already flattened, including one stored back into a compendium and dragged out again. It does not touch items, spells, feats, hazards, or journals, and it has no notion of a rank-bonus change.

That drag-and-skip behavior is the part worth copying. Adventure paths and Society modules ship as their own Foundry packages, with LevelDB compendiums, and they keep doing so after we stop importing their JSON. A converter that only reads `packs/pf2e/` never sees them.

## One function, two callers

The converter is a pure function over a plain document. It does not import Foundry. It takes the document, the actor level when the document is an embedded item, and a formula revision. It returns the new document and a report line.

`build/wyrmway/proficiency/` holds it. The pack build calls it while inheriting `packs/pf2e/`. A hook in the wyrmway system calls the same function when a compendium document is imported into a world, and a GM command runs it across a whole pack. The hook is how Kingmaker, Society scenarios, and any other pf2e module get a minimal conversion without us forking the module.

Both callers write `flags.wyrmway.proficiency` with the formula revision, the level used, and the previous value of each field they changed. A document that already carries the current revision is left alone. The stored values are what a reverse command puts back. Elite and weak are applied later, as a +2 or −2 on top of the stored base (`NPCDocument.prepareDerivedData`). The converter reads and writes the base, and it uses `details.level.base` when that differs from the displayed level.

## The adjustment

When the rank is known and is trained or better, the rank bonus stays. The new number is the old number minus `level`, plus `floor((level - 1) / 4)`. Spellcasting entries are this case. `proficiency.value` is 1 through 4, and both `spelldc.value` and `spelldc.dc` move by the same amount. A stored rank of 0 that still included level uses half the trained bonus, rounded down, in place of that level term.

When the rank is not stored, the minimal pass treats a combat statistic as trained or better. Attacks, armor class, saves, and perception on a creature or hazard include the creature's level and a rank bonus that does not change. The adjustment is `floor((level - 1) / 4) - level`. The report says the rank was assumed.

A listed skill is adjusted the same way when its base is at least the creature's level. A base below level is left as written and named in the report. An untrained skill that never included level, and a skill that is only a small ability modifier, both look like that, and the minimal pass does not guess between them.

A literal DC is adjusted when it matches the standard DC for a stated level, including the usual easy, hard, very hard, and incredibly hard steps from `src/module/dc.ts`. Any other literal is left as written and named in the report. `calculateDC` itself grows the Wyrmway curve so checks that already call it, such as recall knowledge, follow the formula without a document edit.

Damage, hit points, speeds, ability modifiers, and prices are not proficiency and are not changed by this tool.

## What the minimal pass walks

| Document | Fields |
|---|---|
| NPC | Armor class, three saves, perception, listed skills, each melee item's attack bonus, each spellcasting entry's DC and modifier |
| Hazard, vehicle | Stealth DC, attack actions, any stored save or skill modifier on the same shape as an NPC |
| Item | A stored DC or attack bonus on the item itself. An item with no such field is unchanged. |
| Spell | No stored proficiency. Inline check DCs in the description follow the literal-DC rule. |
| Feat, action, journal | Inline `@Check` DCs and other literal DCs follow the literal-DC rule. A feat that only sets a proficiency rank needs no rewrite. The character formula supplies the bonus. |

Rule elements that add a flat modifier equal to the actor's level are listed in the report and left for the editorial pass. Rewriting them blindly changes features that add level for a reason other than proficiency.

## Report

Every document produces one line: fields changed, the level used, whether the rank was read or assumed, and any number left untouched. A module conversion is reviewable from that list. Kingmaker does not need a hand pass over every actor before the first session. It needs a pass over the lines the tool refused to guess.

## Tests

Fixtures, not a live world. A level 1, 5, and 20 creature. A spellcasting entry whose rank is stored. A skill below the creature's level. An elite creature, converted from its base. A document run twice, with the second run changing nothing. A standard DC rewritten. A nonstandard DC left alone. The same fixture through the JSON caller and through a simulated import, with the same flag and the same numbers.

## Later than this tool

The full split into rank, ability, and residual, from [content-conversion.md](content-conversion.md), replaces the assumed-rank shortcut for documents we inherit from `packs/pf2e/`. The import hook can keep the minimal adjustment for third-party documents, which have no build step and often have no stored rank. Hand-written files in `packs/wyrmway/` are applied after either pass and are not rewritten.
