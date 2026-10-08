# Rules delta: PF2e → Wyrmway Saga

This is the authoritative list of places where Wyrmway Saga departs from Pathfinder 2e rules. Any rule not listed
here works exactly as in PF2e.

Each entry records:

- **Change:** what is different, stated precisely enough to implement
- **Source:** where it comes from, such as the D&D 5.5e/SRD 5.2 rule or a homebrew rule
- **Rationale:** why we're making the change
- **Status:** proposed, agreed, implemented or tested
- **Implementation notes:** the data model, rule elements and code areas the change touches

## Changes

### Proficiency bonus

- **Change:** A proficiency bonus is `ceil(level / 4) + rankBonus`. The rank bonuses are untrained +0, trained +1, expert +3, master +5, legendary +7. This replaces `level + rankBonus` with rank bonuses +0, +2, +4, +6, +8. Where an untrained statistic still adds level today (saving throws, perception, and attacks), it adds `ceil(level / 4)` instead. Untrained skills that add no level today still add none.
- **Source:** Homebrew. Trained rank tracks the D&D 5e proficiency bonus. Expert, master, and legendary are finer steps across the range of 5e expertise.
- **Rationale:** Full level-to-proficiency makes content a few levels away trivial or impossible. The smaller level term keeps a wider band of creatures and hazards usable. See [philosophy.md](philosophy.md).
- **Status:** agreed
- **Implementation notes:** Character statistics get the bonus from `createProficiencyModifier` in `src/module/actor/modifiers.ts`. The rank table there is `[0, 2, 4, 6, 8]`, and the level term is added for rank greater than 0 unless the caller passes `addLevel`. This is not the proficiency-without-level variant: that variant drops the level term and keeps its own bonus table. Creatures, hazards, and items store finished numbers. The converter in [../engineering/content-conversion.md](../engineering/content-conversion.md) splits those numbers with the Pathfinder formula and stores the residual. The live total is computed from this rule.

### Incapacitation, legendary saves, legendary actions

- **Change:** The incapacitation trait is removed from every effect. A result is the degree that was rolled. In its place, a creature can have legendary saves and legendary actions. These are two separate pools, assigned by the GM, not text on the spell or feat.
  - **Legendary save.** When the creature fails a saving throw, it may spend one use to treat that save as a success. It chooses which failures to spend on. A spent use is gone for the day. The result becomes a success, not a critical success. One use does not merely improve the degree by one step.
  - **How many.** The elite adjustment grants 1 legendary save. A boss has 2 to 4 legendary saves and 1 to 3 legendary actions. The GM may give more of either to a larger party. There is no fixed formula for party size.
  - **Legendary action.** At the end of another creature's turn, the creature may spend one use to take one legendary action. It regains spent uses at the start of its own turn. It cannot take one while it is unable to act. Only one option is used at a time.
- **Source:** D&D 5e legendary resistance and legendary actions, including the SRD 5.2 wording of legendary resistance: if the creature fails a saving throw, it can choose to succeed instead. Wyrmway uses "legendary save" for that resistance. The elite and boss counts are a Wyrmway assignment, not the 5e stat block.
- **Rationale:** Incapacitation is permanent, so a disabling effect against the creature that matters is wasted unless the d20 is a 1. A legendary save is a shield with a count. The party burns through it, and then the effect lands at full strength. Legendary actions give a boss actions across the round, so the fight does not need minions whose only purpose is to balance the action economy. See [philosophy.md](philosophy.md).
- **Status:** agreed
- **Implementation notes:** Elite is already an adjustment on NPCs (`attributes.adjustment` in `src/module/actor/npc/data.ts`, applied in `document.ts`). A legendary save count is a new field on that adjustment, not a change to the elite numbers for AC, saves, hit points, and attacks. Bosses are not an existing template. The action menu for a legendary action is still per creature. A boss with a pool and no authored options needs a default menu before the pool does anything. Effects that incapacitate through an attack roll, rather than a saving throw, are not covered by a legendary save. Player characters do not gain legendary saves from this rule. Removing incapacitation also removes it from effects used against the party.

### Core proficiency

- **Change:** Weapon proficiency that is a class's main attack, and spell attack plus spell DC for a class whose main attack is magic, use one schedule. Trained at 1st, expert at 5th, master at 9th, legendary at 15th. A class whose job is both weapons and spells uses that schedule for both. Spell attack rolls and spell DCs gain an item bonus on the weapon potency schedule: +1 from 2nd level, +2 from 10th, +3 from 16th.
- **Source:** Homebrew. The success-rate target is the observed preference for roughly a two-in-three chance on an on-identity action against a fair challenge.
- **Rationale:** The fighter's extra rank is a standing bonus to hit, and casters pay for their spells with delayed ranks and no item bonus. Players then favor the option that succeeds. See [philosophy.md](philosophy.md).
- **Status:** agreed.
- **Implementation notes:** Today's gates are class features. Fighter Weapon Mastery is 5th and reaches master in one group. Weapon Legend is 13th and reaches legendary in one group. Weapon Expertise is 5th and reaches expert for most other classes. Weapon Mastery is 13th. Expert Spellcaster is 7th, Master Spellcaster is 15th, Legendary Spellcaster is 19th for the full casters. The potency schedule lives in `src/module/actor/character/automatic-bonus-progression.ts` (`level < 2 ? 0 : level < 10 ? 1 : level < 16 ? 2 : 3`). Armor, saves, perception, and skills are unchanged. Half damage on a successful basic save is unchanged. Creature defenses were built for these old gaps. The converter keeps today's hit rate only while the character's bonus stays the same. This change raises most classes' core bonus, so the expected defense moves with the new on-rate bonus.

### Specialty proficiency (experiment)

- **Change:** A class may offer one narrow specialty that advances ahead of the shared schedule. A fighter or gunslinger chooses one weapon group at 1st. A wizard would choose one school. The character is not expert in every weapon or every school. The specialty stays within one rank of the shared schedule, so the gap is at most the +2 between adjacent ranks. It never leaves one character at trained or expert while another is master or legendary in the same kind of attack.
- **Source:** Homebrew, drawn from the fighter's weapon-group mastery and scaled back.
- **Rationale:** A specialty gives flavor and a real choice. A wider lead brings back accuracy as a class dial.
- **Status:** proposed. The extra +2, and how long it lasts before the shared schedule catches up, needs playtesting before it is agreed.
- **Implementation notes:** Do not build this until the shared schedule is in place. The shape to test is one rank ahead of the shared gates, ending when the shared schedule reaches legendary at 15th.

### Crafting and consumable prices

- **Change:** Revamp the Craft downtime activity, and lower the prices of consumables. Crafting should be a reason to make an item rather than a slower way to pay for it. A class built around consumables should function on those prices, rather than on a daily batch of free items that exists to get around them.
- **Source:** Homebrew.
- **Rationale:** The current activity spends half the Price in materials, 2 days of setup (1 with a formula), and then reduces the remainder at the Earn Income rate for the crafter's level and Crafting rank. Paying the rest immediately costs the full Price plus the setup days. Working the remainder off is Earn Income aimed at half the item, after the setup. Feat chains do not change that comparison. See the Craft action and [philosophy.md](philosophy.md).
- **Status:** agreed as a goal. The new procedure and the new prices are not written yet.
- **Implementation notes:** The activity is `packs/pf2e/actions/skill/craft.json`. Character-side crafting support is `src/module/actor/character/crafting/`. Alchemist daily items are the class features Infused Reagents and Advanced Alchemy. Leave those in place until the prices and the activity are redesigned together. Specific numbers wait for that pass.

### Feat pools

- **Change:** Repeated ancestry feats and repeated class feats become one feat in a shared pool. Access is a tag granted by the class, archetype, or ancestry. The starting examples, with names still open, are a basic ancestry pool (ancestral lore, ancestral weaponry), a martial pool (Sudden Charge, Reactive Strike), and a spellcaster pool (spellshape feats, extra cantrips). A tradition tag can limit a spellcaster feat to arcane, primal, occult, or divine. A feat that is actually unique to one class or ancestry stays on that list. A feat whose power assumed a short list of classes may be adjusted once the tag makes it widely available.
- **Source:** The Starfinder standardized ancestry feats, extended to class feats. See `packs/sf2e/feats/ancestry/standardized-ancestry-feats/`.
- **Rationale:** Reprinting the same option, or giving an archetype its own copy so it can dodge the multiclass dedication's half-level cap, is bookkeeping. The character who should have the option gets it from a tag. See [philosophy.md](philosophy.md).
- **Status:** agreed as a goal. The tag names, which feats move, and any power adjustments are not written yet.
- **Implementation notes:** Pathfinder already has a shared class-feat folder. Reactive Strike is `packs/pf2e/feats/class/shared-class-feats/level-6/reactive-strike.json`, with a trait per class. Sudden Charge is the level-1 file beside it, traits `barbarian` and `fighter`. The pool replaces that trait list with a tag the class or archetype grants. Do not start moving feats until a pass over the lists decides the first pools.
