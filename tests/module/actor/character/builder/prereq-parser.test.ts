import { parseClause } from "@actor/character/builder/prereq-parser.ts";
import type { ParseContext } from "@actor/character/builder/types.ts";

const ctx: ParseContext = {
    skills: new Map([
        ["acrobatics", "Acrobatics"],
        ["arcana", "Arcana"],
        ["athletics", "Athletics"],
        ["crafting", "Crafting"],
        ["deception", "Deception"],
        ["diplomacy", "Diplomacy"],
        ["intimidation", "Intimidation"],
        ["medicine", "Medicine"],
        ["nature", "Nature"],
        ["occultism", "Occultism"],
        ["performance", "Performance"],
        ["religion", "Religion"],
        ["society", "Society"],
        ["stealth", "Stealth"],
        ["survival", "Survival"],
        ["thievery", "Thievery"],
    ]),
    featNames: new Set([
        "Power Attack",
        "Alter Ego Dedication",
        "Archaeologist Dedication",
        "Acrobat Dedication",
        "Acute Scent",
    ]),
    featureNames: new Set(["Bloodrager"]),
};

describe("prerequisite parser", () => {
    test("proficiency, attributes, names, speed, and focus pool", () => {
        expect(parseClause("trained in Arcana", ctx)).toEqual([
            { kind: "proficiency", statistic: "arcana", minRank: 1 },
        ]);
        expect(parseClause("expert in Perception", ctx)).toEqual([
            { kind: "proficiency", statistic: "perception", minRank: 2 },
        ]);
        expect(parseClause("legendary Stealth", ctx)).toEqual([
            { kind: "proficiency", statistic: "stealth", minRank: 4 },
        ]);
        expect(parseClause("legendary in Intimidation", ctx)).toEqual([
            { kind: "proficiency", statistic: "intimidation", minRank: 4 },
        ]);
        expect(parseClause("trained in martial weapons", ctx)).toEqual([
            { kind: "proficiency", statistic: "martial", minRank: 1 },
        ]);
        expect(parseClause("trained in light armor", ctx)).toEqual([
            { kind: "proficiency", statistic: "light", minRank: 1 },
        ]);
        expect(parseClause("expert in Fortitude saves", ctx)).toEqual([
            { kind: "proficiency", statistic: "fortitude", minRank: 2 },
        ]);
        expect(parseClause("master in Games Lore", ctx)).toEqual([
            { kind: "proficiency", statistic: "games-lore", minRank: 3 },
        ]);
        expect(parseClause("Charisma +2", ctx)).toEqual([{ kind: "attribute", ability: "cha", minMod: 2 }]);
        expect(parseClause("Power Attack", ctx)).toEqual([{ kind: "feat", name: "Power Attack" }]);
        expect(parseClause("Bloodrager", ctx)).toEqual([{ kind: "feature", name: "Bloodrager" }]);
        expect(parseClause("Acrobat Dedication", ctx)).toEqual([{ kind: "feat", name: "Acrobat Dedication" }]);
        expect(parseClause("swim speed", ctx)).toEqual([{ kind: "speed", mode: "swim" }]);
        expect(parseClause("a fly speed 20 feet", ctx)).toEqual([{ kind: "speed", mode: "fly", feet: 20 }]);
        expect(parseClause("focus pool", ctx)).toEqual([{ kind: "focus-pool", min: 1 }]);
        expect(parseClause("focus pool 2", ctx)).toEqual([{ kind: "focus-pool", min: 2 }]);
    });

    test("a later skill name inherits the rank, and a partial or stays unparsed", () => {
        expect(parseClause("expert in Society or Survival", ctx)).toEqual([
            {
                kind: "or",
                any: [
                    [{ kind: "proficiency", statistic: "society", minRank: 2 }],
                    [{ kind: "proficiency", statistic: "survival", minRank: 2 }],
                ],
            },
        ]);
        expect(parseClause("Alter Ego Dedication or Archaeologist Dedication", ctx)).toEqual([
            {
                kind: "or",
                any: [
                    [{ kind: "feat", name: "Alter Ego Dedication" }],
                    [{ kind: "feat", name: "Archaeologist Dedication" }],
                ],
            },
        ]);
        expect(parseClause("Charisma +2 or ability to cast spells from spell slots", ctx)).toEqual([
            {
                kind: "or",
                any: [
                    [{ kind: "attribute", ability: "cha", minMod: 2 }],
                    [{ kind: "spellcasting", classFeature: true }],
                ],
            },
        ]);
        expect(parseClause("Charisma +2 or a signed letter from the society", ctx)).toEqual([
            { kind: "unparsed", text: "Charisma +2 or a signed letter from the society" },
        ]);
        expect(parseClause("trained in Lore about a specific terrain", ctx)).toEqual([
            { kind: "unparsed", text: "trained in Lore about a specific terrain" },
        ]);
        expect(parseClause("You are at least 5th level", ctx)).toEqual([
            { kind: "unparsed", text: "You are at least 5th level" },
        ]);
    });

    test("a name that is both a feat and a feature is either one", () => {
        const both: ParseContext = {
            ...ctx,
            featNames: new Set(["Shield Block"]),
            featureNames: new Set(["Shield Block"]),
        };
        expect(parseClause("Shield Block", both)).toEqual([
            {
                kind: "or",
                any: [[{ kind: "feat", name: "Shield Block" }], [{ kind: "feature", name: "Shield Block" }]],
            },
        ]);
    });

    test("labels, case, articles, and a shared last word", () => {
        const labeled: ParseContext = {
            ...ctx,
            featNames: new Set([
                "Familiar",
                "Animal Companion",
                "Armor Innovation",
                "Construct Innovation",
                "Weapon Innovation",
            ]),
            featureNames: new Set([
                "Fierce Ysoki",
                "Summerborn Ryphorian",
                "Winterborn Ryphorian",
                "Sharp-Eyed Sarcesian",
                "Drone",
                "Turret",
                "Warrior",
                "Enigma",
            ]),
            heritageNames: new Set([
                "Fierce Ysoki",
                "Summerborn Ryphorian",
                "Winterborn Ryphorian",
                "Sharp-Eyed Sarcesian",
            ]),
            tagged: new Map([
                [
                    "mechanic-exocortex",
                    [
                        { name: "Drone", kind: "feature" },
                        { name: "Turret", kind: "feature" },
                    ],
                ],
                [
                    "bard-muse",
                    [
                        { name: "Warrior", kind: "feature" },
                        { name: "Enigma", kind: "feature" },
                    ],
                ],
            ]),
        };
        expect(parseClause("leaf order", { ...ctx, featureNames: new Set(["Leaf Order"]) })).toEqual([
            { kind: "feature", name: "Leaf Order" },
        ]);
        expect(parseClause("Fierce Ysoki heritage", labeled)).toEqual([{ kind: "feature", name: "Fierce Ysoki" }]);
        expect(parseClause("summerborn or winterborn ryphorian heritage", labeled)).toEqual([
            {
                kind: "or",
                any: [
                    [{ kind: "feature", name: "Summerborn Ryphorian" }],
                    [{ kind: "feature", name: "Winterborn Ryphorian" }],
                ],
            },
        ]);
        expect(parseClause("sharp-eyed heritage", labeled)).toEqual([
            { kind: "feature", name: "Sharp-Eyed Sarcesian" },
        ]);
        expect(parseClause("drone or turret exocortex", labeled)).toEqual([
            {
                kind: "or",
                any: [[{ kind: "feature", name: "Drone" }], [{ kind: "feature", name: "Turret" }]],
            },
        ]);
        expect(parseClause("warrior muse", labeled)).toEqual([{ kind: "feature", name: "Warrior" }]);
        expect(parseClause("a familiar", labeled)).toEqual([{ kind: "feat", name: "Familiar" }]);
        expect(parseClause("trained in Crafting and Thievery", ctx)).toEqual([
            { kind: "proficiency", statistic: "crafting", minRank: 1 },
            { kind: "proficiency", statistic: "thievery", minRank: 1 },
        ]);
        expect(parseClause("armor, construct, or weapon innovation", labeled)).toEqual([
            {
                kind: "or",
                any: [
                    [{ kind: "feat", name: "Armor Innovation" }],
                    [{ kind: "feat", name: "Construct Innovation" }],
                    [{ kind: "feat", name: "Weapon Innovation" }],
                ],
            },
        ]);
        expect(parseClause("You have a climb Speed", ctx)).toEqual([{ kind: "speed", mode: "climb" }]);
        expect(parseClause("ardande trait, plant trait, or wood trait", ctx)).toEqual([
            {
                kind: "or",
                any: [
                    [{ kind: "trait", trait: "ardande" }],
                    [{ kind: "trait", trait: "plant" }],
                    [{ kind: "trait", trait: "wood" }],
                ],
            },
        ]);
        expect(parseClause("low-light vision", ctx)).toEqual([{ kind: "sense", sense: "low-light-vision" }]);
        expect(parseClause("trained in all martial weapons", ctx)).toEqual([
            { kind: "unparsed", text: "trained in all martial weapons" },
        ]);
    });

    test("spellcasting, class, deity, size, and stored choices", () => {
        expect(parseClause("spellcasting class feature", ctx)).toEqual([{ kind: "spellcasting", classFeature: true }]);
        expect(parseClause("You have a focus pool and a spellcasting class feature that grants arcane spells.", ctx)).toEqual([
            { kind: "focus-pool", min: 1 },
            { kind: "spellcasting", classFeature: true, tradition: "arcane" },
        ]);
        expect(parseClause("able to cast arcane or occult spells", ctx)).toEqual([
            {
                kind: "or",
                any: [
                    [{ kind: "spellcasting", tradition: "arcane" }],
                    [{ kind: "spellcasting", tradition: "occult" }],
                ],
            },
        ]);
        expect(parseClause("ability to cast fireball", ctx)).toEqual([{ kind: "spell", slug: "fireball" }]);
        expect(parseClause("can cast 3rd rank spells", ctx)).toEqual([{ kind: "spell-rank", min: 3 }]);
        expect(parseClause("lay on hands", ctx)).toEqual([{ kind: "spell", slug: "lay-on-hands", source: "focus" }]);
        expect(parseClause("connection with primal spellcasting", ctx)).toEqual([
            { kind: "tradition", source: "mystic", tradition: "primal" },
        ]);
        expect(parseClause("bloodline that grants divine or occult spells", ctx)).toEqual([
            {
                kind: "or",
                any: [
                    [{ kind: "tradition", source: "bloodline", tradition: "divine" }],
                    [{ kind: "tradition", source: "bloodline", tradition: "occult" }],
                ],
            },
        ]);
        expect(parseClause("divine or occult patron", ctx)).toEqual([
            {
                kind: "or",
                any: [
                    [{ kind: "tradition", source: "witch", tradition: "divine" }],
                    [{ kind: "tradition", source: "witch", tradition: "occult" }],
                ],
            },
        ]);
        expect(parseClause("master in Arcana or Occultism, depending on paradox", ctx)).toEqual([
            { kind: "casting-skill", source: "paradox", minRank: 3 },
        ]);
        expect(parseClause("You must be a gunslinger.", ctx)).toEqual([{ kind: "class", slug: "gunslinger" }]);
        expect(parseClause("class granting no more Hit Points per level than 8 + your Constitution modifier", ctx)).toEqual([
            { kind: "class-hp", max: 8 },
        ]);
        expect(parseClause("size Large or larger", ctx)).toEqual([{ kind: "size", size: "lg", compare: "at-least" }]);
        expect(parseClause("Medium or Small size", ctx)).toEqual([
            {
                kind: "or",
                any: [
                    [{ kind: "size", size: "med", compare: "exact" }],
                    [{ kind: "size", size: "sm", compare: "exact" }],
                ],
            },
        ]);
        expect(parseClause("three or more hands", ctx)).toEqual([{ kind: "hands", min: 3 }]);
        expect(parseClause("You have a versatile heritage.", ctx)).toEqual([{ kind: "versatile" }]);
        expect(parseClause("You don't worship a deity.", ctx)).toEqual([{ kind: "not", atom: { kind: "deity" } }]);
        expect(parseClause("worshipper of Yaraesa", ctx)).toEqual([{ kind: "deity", slug: "yaraesa" }]);
        expect(parseClause("follower of a specific religion", ctx)).toEqual([
            { kind: "unparsed", text: "follower of a specific religion" },
        ]);
        expect(parseClause("healing font", ctx)).toEqual([{ kind: "selection", key: "divineFont", value: "heal" }]);
        expect(parseClause("Ancestral Unarmed Attack (burning tendril or solar flare)", ctx)).toEqual([
            {
                kind: "or",
                any: [
                    [{ kind: "selection", key: "ancestralUnarmedAttack", value: "burning-tendril" }],
                    [{ kind: "selection", key: "ancestralUnarmedAttack", value: "solar-flare" }],
                ],
            },
        ]);
        expect(parseClause("Iruxi Armaments (Claws)", ctx)).toEqual([
            { kind: "selection", key: "iruxiArmaments", value: "claw" },
        ]);
        expect(parseClause("exactly one kinetic element", ctx)).toEqual([{ kind: "kinetic", min: 1, max: 1 }]);
        expect(parseClause("Shift Skin", ctx)).toEqual([{ kind: "action", name: "Shift Skin" }]);
        expect(parseClause("trained in a skill with the Recall Knowledge action", ctx)).toEqual([
            { kind: "proficiency", statistic: "recall-knowledge", minRank: 1 },
        ]);
        expect(parseClause("legendary in one or more Lore skills", ctx)).toEqual([
            { kind: "proficiency", statistic: "any-lore", minRank: 4 },
        ]);
        expect(parseClause("Erutaki or Jotun language", ctx)).toEqual([
            {
                kind: "or",
                any: [
                    [{ kind: "language", slug: "erutaki" }],
                    [{ kind: "language", slug: "jotun" }],
                ],
            },
        ]);
        expect(parseClause("You speak at least three languages.", ctx)).toEqual([{ kind: "language", min: 3 }]);
        expect(parseClause("Wis +2 or ability to cast occult spells", ctx)).toEqual([
            {
                kind: "or",
                any: [
                    [{ kind: "attribute", ability: "wis", minMod: 2 }],
                    [{ kind: "spellcasting", tradition: "occult" }],
                ],
            },
        ]);
        expect(parseClause("Counterspell", ctx)).toEqual([{ kind: "unparsed", text: "Counterspell" }]);
        expect(parseClause("master in the skill associated with your patron's tradition", ctx)).toEqual([
            { kind: "casting-skill", source: "patron", minRank: 3 },
        ]);
        expect(parseClause("You speak Muan", ctx)).toEqual([{ kind: "language", slug: "muan" }]);
        expect(parseClause("not a worshipper of Walkena", ctx)).toEqual([
            { kind: "not", atom: { kind: "deity", slug: "walkena" } },
        ]);
        expect(parseClause("deity is Achaekek", ctx)).toEqual([{ kind: "deity", slug: "achaekek" }]);
        expect(parseClause("You don't have a swim Speed.", ctx)).toEqual([
            { kind: "not", atom: { kind: "speed", mode: "swim" } },
        ]);
        expect(parseClause("Strength or Dexterity +2", ctx)).toEqual([
            {
                kind: "or",
                any: [
                    [{ kind: "attribute", ability: "str", minMod: 2 }],
                    [{ kind: "attribute", ability: "dex", minMod: 2 }],
                ],
            },
        ]);
        expect(parseClause("master at Deception", ctx)).toEqual([
            { kind: "proficiency", statistic: "deception", minRank: 3 },
        ]);
        expect(parseClause("at least one primal innate spell", ctx)).toEqual([
            { kind: "spell", source: "innate", tradition: "primal" },
        ]);
        expect(parseClause("divine spells", ctx)).toEqual([{ kind: "spellcasting", tradition: "divine" }]);
        expect(parseClause("bloodline the grants occult spells", ctx)).toEqual([
            { kind: "tradition", source: "bloodline", tradition: "occult" },
        ]);
        expect(parseClause("at least one innate spell gained from an ancestry feat", ctx)).toEqual([
            { kind: "unparsed", text: "at least one innate spell gained from an ancestry feat" },
        ]);
        const classes: ParseContext = { ...ctx, featureNames: new Set(["Cleric", "Bloodrager"]) };
        expect(parseClause("Cleric", classes)).toEqual([{ kind: "class", slug: "cleric" }]);
        expect(parseClause("Bloodrager", classes)).toEqual([{ kind: "feature", name: "Bloodrager" }]);
        expect(parseClause("ability to cast a ritual", ctx)).toEqual([
            { kind: "unparsed", text: "ability to cast a ritual" },
        ]);
        expect(parseClause("Viper programming language", ctx)).toEqual([
            { kind: "unparsed", text: "Viper programming language" },
        ]);
    });

    test("any skill, paired ranks, senses, and closed sentences", () => {
        expect(parseClause("trained in at least one skill", ctx)).toEqual([
            { kind: "proficiency", statistic: "any-skill", minRank: 1 },
        ]);
        expect(parseClause("master in any skill", ctx)).toEqual([
            { kind: "proficiency", statistic: "any-skill", minRank: 3 },
        ]);
        expect(parseClause("expert in at least one saving throw", ctx)).toEqual([
            { kind: "proficiency", statistic: "any-save", minRank: 2 },
        ]);
        expect(parseClause("trained in at least one skill and expert in at least one skill", ctx)).toEqual([
            { kind: "proficiency", statistic: "any-skill", minRank: 2 },
        ]);
        expect(parseClause("master in Crafting, Performance, or a Lore skill", ctx)).toEqual([
            {
                kind: "or",
                any: [
                    [{ kind: "proficiency", statistic: "crafting", minRank: 3 }],
                    [{ kind: "proficiency", statistic: "performance", minRank: 3 }],
                    [{ kind: "proficiency", statistic: "any-lore", minRank: 3 }],
                ],
            },
        ]);
        expect(parseClause("legendary in either Arcana or Nature and master in the other", ctx)).toEqual([
            {
                kind: "or",
                any: [
                    [
                        { kind: "proficiency", statistic: "arcana", minRank: 4 },
                        { kind: "proficiency", statistic: "nature", minRank: 3 },
                    ],
                    [
                        { kind: "proficiency", statistic: "nature", minRank: 4 },
                        { kind: "proficiency", statistic: "arcana", minRank: 3 },
                    ],
                ],
            },
        ]);
        expect(parseClause("master in either Arcana or Nature and expert in the other", ctx)).toEqual([
            {
                kind: "or",
                any: [
                    [
                        { kind: "proficiency", statistic: "arcana", minRank: 3 },
                        { kind: "proficiency", statistic: "nature", minRank: 2 },
                    ],
                    [
                        { kind: "proficiency", statistic: "nature", minRank: 3 },
                        { kind: "proficiency", statistic: "arcana", minRank: 2 },
                    ],
                ],
            },
        ]);
        const magical = parseClause(
            "trained in at least one of Arcana, Nature, Occultism, or Religion and expert in at least one other",
            ctx,
        );
        expect(magical).toHaveLength(1);
        const magicalOr = magical[0];
        expect(magicalOr?.kind).toBe("or");
        if (magicalOr?.kind !== "or") return;
        expect(magicalOr.any).toHaveLength(4);
        const experts = magicalOr.any.map((branch) => {
            const lead = branch[0];
            return lead?.kind === "proficiency" ? lead.statistic : "";
        });
        expect(experts.sort()).toEqual(["arcana", "nature", "occultism", "religion"]);
        for (const branch of magicalOr.any) {
            const lead = branch[0];
            const rest = branch[1];
            expect(lead).toMatchObject({ kind: "proficiency", minRank: 2 });
            expect(rest?.kind).toBe("or");
            if (lead?.kind !== "proficiency" || rest?.kind !== "or") continue;
            const others = rest.any.map((side) => (side[0]?.kind === "proficiency" ? side[0].statistic : ""));
            expect(others).toHaveLength(3);
            expect(others).not.toContain(lead.statistic);
        }
        expect(
            parseClause("trained in Society, Thievery, and your choice of Arcana, Nature, Occultism, or Religion", ctx),
        ).toEqual([
            { kind: "proficiency", statistic: "society", minRank: 1 },
            { kind: "proficiency", statistic: "thievery", minRank: 1 },
            {
                kind: "or",
                any: [
                    [{ kind: "proficiency", statistic: "arcana", minRank: 1 }],
                    [{ kind: "proficiency", statistic: "nature", minRank: 1 }],
                    [{ kind: "proficiency", statistic: "occultism", minRank: 1 }],
                    [{ kind: "proficiency", statistic: "religion", minRank: 1 }],
                ],
            },
        ]);
        expect(parseClause("You must have a class that casts spells with a spell repertoire.", ctx)).toEqual([
            { kind: "spellcasting", classFeature: true, spontaneous: true },
        ]);
        expect(
            parseClause(
                "You must have a class, such as clerics, druids, witches, and wizards, that prepares spells in spell slots using the same number of prepared spells per day.",
                ctx,
            ),
        ).toEqual([{ kind: "spellcasting", classFeature: true, prepared: true }]);
        expect(parseClause("low-light vision or scent", ctx)).toEqual([
            {
                kind: "or",
                any: [[{ kind: "sense", sense: "low-light-vision" }], [{ kind: "sense", sense: "scent" }]],
            },
        ]);
        expect(parseClause("Acute Scent or scent", ctx)).toEqual([
            {
                kind: "or",
                any: [[{ kind: "feat", name: "Acute Scent" }], [{ kind: "sense", sense: "scent" }]],
            },
        ]);
        expect(parseClause("you can't already use the Rage action", ctx)).toEqual([
            { kind: "not", atom: { kind: "action", name: "Rage" } },
        ]);
        expect(parseClause("You're not a fey.", ctx)).toEqual([{ kind: "not", atom: { kind: "trait", trait: "fey" } }]);
        expect(parseClause("living creature", ctx)).toEqual([
            { kind: "not", atom: { kind: "trait", trait: "undead" } },
            { kind: "not", atom: { kind: "trait", trait: "construct" } },
        ]);
        expect(parseClause("any oracle mystery", ctx)).toEqual([{ kind: "tag", tag: "oracle-mystery" }]);
        expect(parseClause("you aren't photosynthetic", ctx)).toEqual([
            { kind: "unparsed", text: "you aren't photosynthetic" },
        ]);
        expect(parseClause("trained in at least one skill to Decipher Writing", ctx)).toEqual([
            { kind: "unparsed", text: "trained in at least one skill to Decipher Writing" },
        ]);
        expect(
            parseClause(
                "trained in Belkzen Lore, Orc Lore, Orc Pantheon Lore, or (at the GM's discretion) a related Lore skill",
                ctx,
            ),
        ).toEqual([
            {
                kind: "unparsed",
                text: "trained in Belkzen Lore, Orc Lore, Orc Pantheon Lore, or (at the GM's discretion) a related Lore skill",
            },
        ]);
    });
});
