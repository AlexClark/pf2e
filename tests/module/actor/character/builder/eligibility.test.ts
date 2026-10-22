import { readFileSync } from "node:fs";
import {
    classArchetypeFailure,
    dedicationFamilies,
    dedicationUuidsFromRules,
    newDedicationFailures,
} from "@actor/character/builder/archetype-gate.ts";
import { evaluateEligibility } from "@actor/character/builder/eligibility.ts";
import type { CharacterSnapshot, IndexedFeat, PrereqAtom } from "@actor/character/builder/types.ts";

const BLOODRAGER = "Compendium.pf2e.feats-srd.Item.Bloodrager Dedication";
const HARBINGER = "Compendium.pf2e.feats-srd.Item.Battle Harbinger Dedication";
const WIZARD = "Compendium.pf2e.feats-srd.Item.Wizard Dedication";

function snapshot(patch: Partial<CharacterSnapshot> = {}): CharacterSnapshot {
    return {
        level: 1,
        className: "Barbarian",
        classSlug: "barbarian",
        countsAs: [],
        abilities: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
        skills: {},
        perception: 0,
        saves: { fortitude: 0, reflex: 0, will: 0 },
        attacks: { simple: 0, martial: 0, advanced: 0, unarmed: 0 },
        defenses: { unarmored: 0, light: 0, medium: 0, heavy: 0 },
        feats: [],
        features: [{ name: "Bloodrager", slug: "bloodrager", otherTags: ["class-archetype"], sourceId: null }],
        classArchetypeDedicationIds: [BLOODRAGER, HARBINGER],
        grantedClassArchetypeDedicationIds: [BLOODRAGER],
        speeds: {},
        focusMax: 0,
        traits: [],
        senses: [],
        classHp: 8,
        size: "med",
        hands: 2,
        versatile: false,
        deity: null,
        spellcasting: [],
        spells: [],
        selections: [],
        mysticTradition: null,
        witchTradition: null,
        paradoxTradition: null,
        patronSkill: null,
        bloodlineTraditions: [],
        kineticElements: [],
        actions: [],
        languages: [],
        ...patch,
    };
}

function feat(patch: Partial<IndexedFeat> & Pick<IndexedFeat, "id" | "name">): IndexedFeat {
    return {
        slug: "feat",
        category: "class",
        traits: ["dedication", "archetype"],
        level: 2,
        onlyLevel1: false,
        maxTakable: 1,
        clauses: [],
        ...patch,
    };
}

function rulesOf(path: string): unknown[] {
    const document = JSON.parse(readFileSync(path, "utf8")) as { system: { rules: unknown[] } };
    return document.system.rules;
}

describe("dedication families", () => {
    const alterEgo: PrereqAtom[][] = [
        [
            {
                kind: "or",
                any: [
                    [{ kind: "feat", name: "Alter Ego Dedication" }],
                    [{ kind: "feat", name: "Archaeologist Dedication" }],
                ],
            },
        ],
    ];
    const families = dedicationFamilies([
        { name: "Alter Ego Dedication", traits: ["dedication"], clauses: [] },
        { name: "Archaeologist Dedication", traits: ["dedication"], clauses: [] },
        { name: "Acrobat Dedication", traits: ["dedication"], clauses: [] },
        { name: "We're on the List", traits: ["archetype", "skill"], clauses: alterEgo },
        {
            name: "Quick Spring",
            traits: ["archetype", "skill"],
            clauses: [[{ kind: "feat", name: "Acrobat Dedication" }]],
        },
        {
            name: "Not an Acrobat",
            traits: [],
            clauses: [[{ kind: "not", atom: { kind: "feat", name: "Acrobat Dedication" } }]],
        },
    ]);

    test("an or of two dedication names joins both families", () => {
        expect(families.get("Alter Ego Dedication")?.has("We're on the List")).toBe(true);
        expect(families.get("Archaeologist Dedication")?.has("We're on the List")).toBe(true);
    });

    test("a feat atom inside not does not join, and Quick Spring stays a skill", () => {
        expect(families.get("Acrobat Dedication")?.has("Not an Acrobat")).toBe(false);
        expect(families.get("Acrobat Dedication")?.has("Quick Spring")).toBe(true);
        const quickSpring = feat({
            id: "quick-spring",
            name: "Quick Spring",
            slug: "quick-spring",
            category: "skill",
            traits: ["archetype", "skill"],
            clauses: [[{ kind: "feat", name: "Acrobat Dedication" }]],
            families,
        });
        const result = evaluateEligibility(quickSpring, snapshot(), { groupId: "class", level: 14 });
        expect(result.status).toBe("illegal");
        expect(result.failures).toContain("skill");
    });
});

describe("class archetypes and the dedication gate", () => {
    const families = dedicationFamilies([
        { name: "Bloodrager Dedication", traits: ["dedication"], clauses: [] },
        { name: "Wizard Dedication", traits: ["dedication"], clauses: [] },
        { name: "Battle Harbinger Dedication", traits: ["dedication"], clauses: [] },
    ]);

    const bloodrager = feat({
        id: BLOODRAGER,
        name: "Bloodrager Dedication",
        clauses: [[{ kind: "feature", name: "Bloodrager" }]],
        families,
    });
    const wizard = feat({
        id: WIZARD,
        name: "Wizard Dedication",
        families,
    });
    const harbinger = feat({
        id: HARBINGER,
        name: "Battle Harbinger Dedication",
        families,
    });

    test("Bloodrager Dedication is legal at 1st for a character who has the feature", () => {
        const character = snapshot();
        expect(character.grantedClassArchetypeDedicationIds).toContain(BLOODRAGER);
        expect(character.feats.some((owned) => owned.name === "Bloodrager Dedication")).toBe(false);
        const result = evaluateEligibility(bloodrager, character, { groupId: "class", level: 1 });
        expect(result.status).toBe("legal");
        expect(classArchetypeFailure(wizard, character)).toBeNull();
    });

    test("Wizard Dedication uses the two-feat gate only after Bloodrager Dedication is taken", () => {
        const before = snapshot();
        expect(newDedicationFailures(wizard, before, families)).toEqual([]);
        expect(evaluateEligibility(wizard, before, { groupId: "class", level: 2 }).status).toBe("legal");

        const after = snapshot({
            feats: [
                {
                    name: "Bloodrager Dedication",
                    slug: "bloodrager-dedication",
                    category: "class",
                    sourceId: BLOODRAGER,
                },
            ],
        });
        const result = evaluateEligibility(wizard, after, { groupId: "class", level: 2 });
        expect(result.status).toBe("illegal");
        expect(result.failures).toContain("two other feats from Bloodrager Dedication");
        expect(result.failures).not.toContain("one class archetype");
    });

    test("Battle Harbinger Dedication is a second class archetype", () => {
        const result = evaluateEligibility(harbinger, snapshot(), { groupId: "class", level: 2 });
        expect(result.failures).toContain("one class archetype");
    });

    test("a second snapshot does not keep the first character's grants", () => {
        const other = snapshot({
            grantedClassArchetypeDedicationIds: [],
            features: [],
            feats: [
                {
                    name: "Battle Harbinger Dedication",
                    slug: "battle-harbinger-dedication",
                    category: "class",
                    sourceId: HARBINGER,
                },
            ],
        });
        expect(other.grantedClassArchetypeDedicationIds).not.toContain(BLOODRAGER);
        expect(other.classArchetypeDedicationIds).toEqual([BLOODRAGER, HARBINGER]);
        const result = evaluateEligibility(bloodrager, other, { groupId: "class", level: 2 });
        expect(result.failures).toContain("one class archetype");
    });

    test("a dedication of your own class fails on its own", () => {
        const fighter = feat({
            id: "fighter-dedication",
            name: "Fighter Dedication",
            families,
        });
        const result = evaluateEligibility(
            fighter,
            snapshot({ className: "Fighter", classArchetypeDedicationIds: [], grantedClassArchetypeDedicationIds: [] }),
            { groupId: "class", level: 2 },
        );
        expect(result.failures).toContain("your class");
    });
});

describe("grant uuids", () => {
    test("creed links and the elemental template are not dedications", () => {
        const creeds = dedicationUuidsFromRules(rulesOf("packs/pf2e/class-features/battle-creed.json"), (uuid) =>
            uuid.endsWith("Battle Harbinger Dedication"),
        );
        expect(creeds).toEqual([HARBINGER]);

        const elemental = dedicationUuidsFromRules(
            rulesOf("packs/pf2e/class-features/elemental-magic.json"),
            () => true,
        );
        expect(elemental).not.toContain("{item|flags.system.rulesSelections.wizardElmentalistSchool}");
        expect(elemental).toContain("Compendium.pf2e.feats-srd.Item.Elementalist Dedication");

        const blood = dedicationUuidsFromRules(rulesOf("packs/pf2e/class-features/bloodrager.json"), (uuid) =>
            uuid.endsWith("Bloodrager Dedication"),
        );
        expect(blood).toEqual([BLOODRAGER]);
    });
});

describe("heritage, exocortex, and authored atoms", () => {
    const ancestry = (clauses: IndexedFeat["clauses"]) =>
        feat({
            id: "ancestry-feat",
            name: "Ancestry Feat",
            category: "ancestry",
            traits: ["ancestry"],
            clauses,
        });

    test("a heritage the character has passes, and a missing heritage fails", () => {
        const clauses: IndexedFeat["clauses"] = [[{ kind: "feature", name: "Fierce Ysoki" }]];
        const has = snapshot({
            features: [{ name: "Fierce Ysoki", slug: "fierce-ysoki", otherTags: [], sourceId: null }],
        });
        expect(evaluateEligibility(ancestry(clauses), has, { groupId: "ancestry", level: 1 }).status).toBe("legal");
        const missing = evaluateEligibility(ancestry(clauses), snapshot({ features: [] }), {
            groupId: "ancestry",
            level: 1,
        });
        expect(missing.status).toBe("illegal");
        expect(missing.failures).toContain("Fierce Ysoki");
    });

    test("drone or turret exocortex accepts Drone and rejects a character with neither", () => {
        const clauses: IndexedFeat["clauses"] = [
            [
                {
                    kind: "or",
                    any: [[{ kind: "feature", name: "Drone" }], [{ kind: "feature", name: "Turret" }]],
                },
            ],
        ];
        const drone = snapshot({
            features: [{ name: "Drone", slug: "drone", otherTags: ["mechanic-exocortex"], sourceId: null }],
        });
        const classFeat = feat({ id: "exocortex-feat", name: "High Voltage", traits: ["mechanic"], clauses });
        expect(evaluateEligibility(classFeat, drone, { groupId: "class", level: 2 }).status).toBe("legal");
        expect(evaluateEligibility(classFeat, snapshot({ features: [] }), { groupId: "class", level: 2 }).status).toBe(
            "illegal",
        );
    });

    test("warrior muse does not pass on a character whose features omit that muse", () => {
        const clauses: IndexedFeat["clauses"] = [[{ kind: "feature", name: "Warrior" }]];
        const row = feat({ id: "muse-feat", name: "Muse Feat", traits: ["bard"], clauses });
        expect(evaluateEligibility(row, snapshot({ features: [] }), { groupId: "class", level: 2 }).status).toBe(
            "illegal",
        );
        const muse = snapshot({
            features: [
                {
                    name: "Warrior",
                    slug: "warrior",
                    otherTags: ["bard-muse"],
                    sourceId: "Compendium.pf2e.classfeatures.Item.Warrior",
                },
            ],
        });
        expect(evaluateEligibility(row, muse, { groupId: "class", level: 2 }).status).toBe("legal");
    });

    test("a uuid matches sourceId, a tag matches otherTags, and a sense matches the actor", () => {
        const byUuid = feat({
            id: "uuid-feat",
            name: "Uuid Feat",
            traits: ["class"],
            clauses: [
                [
                    {
                        kind: "feat",
                        name: "Breath of the Dragon (Dragonblood)",
                        uuid: "Compendium.pf2e.feats-srd.Item.Breath",
                    },
                ],
            ],
        });
        const owned = snapshot({
            feats: [
                {
                    name: "Something Else",
                    slug: "breath",
                    category: "ancestry",
                    sourceId: "Compendium.pf2e.feats-srd.Item.Breath",
                },
            ],
        });
        expect(evaluateEligibility(byUuid, owned, { groupId: "class", level: 2 }).status).toBe("legal");

        const byTag = feat({
            id: "tag-feat",
            name: "Tag Feat",
            traits: ["bard"],
            clauses: [[{ kind: "tag", tag: "bard-muse" }]],
        });
        const tagged = snapshot({
            features: [{ name: "Enigma", slug: "enigma", otherTags: ["bard-muse"], sourceId: null }],
        });
        expect(evaluateEligibility(byTag, tagged, { groupId: "class", level: 2 }).status).toBe("legal");
        expect(evaluateEligibility(byTag, snapshot({ features: [] }), { groupId: "class", level: 2 }).status).toBe(
            "illegal",
        );

        const vision = ancestry([[{ kind: "sense", sense: "low-light-vision" }]]);
        expect(
            evaluateEligibility(vision, snapshot({ senses: ["low-light-vision"] }), { groupId: "ancestry", level: 1 })
                .status,
        ).toBe("legal");
        expect(evaluateEligibility(vision, snapshot(), { groupId: "ancestry", level: 1 }).status).toBe("illegal");
    });
});

describe("hard checks", () => {
    test("an omitted maxTakable counts as 1 and null is unlimited", () => {
        const owned = {
            name: "Fleet",
            slug: "fleet",
            category: "general",
            sourceId: null,
        };
        const once = feat({
            id: "fleet",
            name: "Fleet",
            slug: "fleet",
            category: "general",
            traits: ["general"],
            maxTakable: undefined,
        });
        const unlimited = feat({ ...once, maxTakable: null });
        const character = snapshot({
            classArchetypeDedicationIds: [],
            grantedClassArchetypeDedicationIds: [],
            feats: [owned],
        });
        expect(evaluateEligibility(once, character, { groupId: "general", level: 1 }).failures).toContain(
            "already taken",
        );
        expect(evaluateEligibility(unlimited, character, { groupId: "general", level: 1 }).status).toBe("legal");
    });

    test("a failed rank is named, and an unparsed clause does not hide a real failure", () => {
        const tough = feat({
            id: "tough",
            name: "Something Tough",
            slug: "something-tough",
            category: "skill",
            traits: ["skill"],
            clauses: [
                [{ kind: "proficiency", statistic: "arcana", minRank: 1 }],
                [{ kind: "unparsed", text: "member of a specific organization" }],
            ],
        });
        const result = evaluateEligibility(tough, snapshot({ skills: {} }), { groupId: "skill", level: 2 });
        expect(result.status).toBe("illegal");
        expect(result.failures).toEqual(["trained in Arcana"]);
        expect(result.sentence).toBeNull();
    });

    test("nothing else failing leaves the book sentence unchecked", () => {
        const odd = feat({
            id: "odd",
            name: "Odd Feat",
            slug: "odd-feat",
            category: "general",
            traits: ["general"],
            clauses: [[{ kind: "unparsed", text: "member of a specific organization" }]],
        });
        const result = evaluateEligibility(odd, snapshot(), { groupId: "general", level: 1 });
        expect(result).toEqual({
            status: "unchecked",
            failures: [],
            sentence: "member of a specific organization",
        });
    });
});

function probe(clauses: PrereqAtom[][], character: CharacterSnapshot) {
    return evaluateEligibility(
        feat({
            id: "probe",
            name: "Probe",
            slug: "probe",
            category: "general",
            traits: ["general"],
            clauses,
        }),
        character,
        { groupId: "general", level: 1 },
    ).status;
}

describe("stored character facts", () => {
    const prepared: CharacterSnapshot["spellcasting"][number] = {
        classFeature: true,
        prepared: true,
        spontaneous: false,
        innate: false,
        focus: false,
        tradition: "arcane",
        slotRank: 3,
    };

    test("class, class hit points, size, hands, and a versatile heritage", () => {
        const gunslinger = snapshot({ classSlug: "gunslinger", classHp: 8, size: "lg", hands: 4, versatile: true });
        expect(probe([[{ kind: "class", slug: "gunslinger" }]], gunslinger)).toBe("legal");
        expect(probe([[{ kind: "class", slug: "wizard" }]], gunslinger)).toBe("illegal");
        expect(probe([[{ kind: "class-hp", max: 8 }]], gunslinger)).toBe("legal");
        expect(probe([[{ kind: "class-hp", max: 8 }]], snapshot({ classHp: 10 }))).toBe("illegal");
        expect(probe([[{ kind: "class-hp", max: 8 }]], snapshot({ classHp: 0 }))).toBe("illegal");
        expect(probe([[{ kind: "size", size: "lg", compare: "at-least" }]], gunslinger)).toBe("legal");
        expect(probe([[{ kind: "size", size: "lg", compare: "at-least" }]], snapshot({ size: "med" }))).toBe("illegal");
        expect(probe([[{ kind: "hands", min: 3 }]], gunslinger)).toBe("legal");
        expect(probe([[{ kind: "hands", min: 3 }]], snapshot({ hands: 2 }))).toBe("illegal");
        expect(probe([[{ kind: "versatile" }]], gunslinger)).toBe("legal");
        expect(probe([[{ kind: "versatile" }]], snapshot())).toBe("illegal");
    });

    test("spellcasting entries, known spells, and slot rank", () => {
        const caster = snapshot({
            spellcasting: [prepared],
            spells: [
                {
                    slug: "fireball",
                    source: "spell",
                    tradition: "arcane",
                    traits: ["fire"],
                    prepared: true,
                    spontaneous: false,
                },
                {
                    slug: "lay-on-hands",
                    source: "focus",
                    tradition: "divine",
                    traits: ["focus", "healing"],
                    prepared: false,
                    spontaneous: false,
                },
            ],
        });
        expect(probe([[{ kind: "spellcasting", classFeature: true, tradition: "arcane" }]], caster)).toBe("legal");
        expect(probe([[{ kind: "spellcasting", tradition: "divine" }]], caster)).toBe("illegal");
        expect(probe([[{ kind: "spellcasting" }]], snapshot())).toBe("illegal");
        expect(probe([[{ kind: "spell", slug: "fireball" }]], caster)).toBe("legal");
        expect(probe([[{ kind: "spell", slug: "lay-on-hands", source: "focus" }]], caster)).toBe("legal");
        expect(probe([[{ kind: "spell", trait: "necromancy" }]], caster)).toBe("illegal");
        expect(probe([[{ kind: "spell-rank", min: 3 }]], caster)).toBe("legal");
        expect(probe([[{ kind: "spell-rank", min: 4 }]], caster)).toBe("illegal");
    });

    test("deity, selections, traditions, and the skill a tradition names", () => {
        const faithful = snapshot({
            deity: { slug: "yaraesa", name: "Yaraesa", fonts: ["heal"], sanctification: ["holy"] },
            selections: [{ key: "divineFont", value: "heal" }],
            mysticTradition: "primal",
            paradoxTradition: "occult",
            skills: { occultism: 3 },
        });
        expect(probe([[{ kind: "deity", slug: "yaraesa" }]], faithful)).toBe("legal");
        expect(probe([[{ kind: "deity", font: "harm" }]], faithful)).toBe("illegal");
        expect(probe([[{ kind: "not", atom: { kind: "deity" } }]], snapshot())).toBe("legal");
        expect(probe([[{ kind: "not", atom: { kind: "deity" } }]], faithful)).toBe("illegal");
        expect(probe([[{ kind: "selection", key: "divineFont", value: "heal" }]], faithful)).toBe("legal");
        expect(probe([[{ kind: "tradition", source: "mystic", tradition: "primal" }]], faithful)).toBe("legal");
        expect(probe([[{ kind: "casting-skill", source: "paradox", minRank: 3 }]], faithful)).toBe("legal");
        expect(probe([[{ kind: "casting-skill", source: "paradox", minRank: 3 }]], snapshot())).toBe("illegal");
    });

    test("kinetic elements, granted actions, languages, and Recall Knowledge", () => {
        const character = snapshot({
            kineticElements: ["fire", "water"],
            actions: ["Shift Skin"],
            languages: ["erutaki", "jotun", "common"],
            skills: { arcana: 2, "farming-lore": 3 },
        });
        expect(probe([[{ kind: "kinetic", min: 2 }]], character)).toBe("legal");
        expect(probe([[{ kind: "kinetic", min: 1, max: 1 }]], character)).toBe("illegal");
        expect(probe([[{ kind: "action", name: "Shift Skin" }]], character)).toBe("legal");
        expect(probe([[{ kind: "language", slug: "erutaki" }]], character)).toBe("legal");
        expect(probe([[{ kind: "language", min: 3 }]], character)).toBe("legal");
        expect(probe([[{ kind: "language", min: 4 }]], character)).toBe("illegal");
        expect(probe([[{ kind: "proficiency", statistic: "recall-knowledge", minRank: 2 }]], character)).toBe("legal");
        expect(probe([[{ kind: "proficiency", statistic: "any-lore", minRank: 3 }]], character)).toBe("legal");
        expect(probe([[{ kind: "proficiency", statistic: "any-lore", minRank: 4 }]], character)).toBe("illegal");
        expect(probe([[{ kind: "proficiency", statistic: "any-skill", minRank: 3 }]], character)).toBe("legal");
        expect(
            probe(
                [[{ kind: "proficiency", statistic: "any-skill", minRank: 2 }]],
                snapshot({ skills: { acrobatics: 1 } }),
            ),
        ).toBe("illegal");
        expect(
            probe(
                [[{ kind: "proficiency", statistic: "any-save", minRank: 2 }]],
                snapshot({ saves: { fortitude: 2, reflex: 0, will: 1 } }),
            ),
        ).toBe("legal");
        expect(probe([[{ kind: "proficiency", statistic: "any-save", minRank: 1 }]], snapshot())).toBe("illegal");
    });
});
