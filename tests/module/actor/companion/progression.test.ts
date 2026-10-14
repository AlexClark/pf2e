import { resolveCompanionGrants } from "@actor/companion/grants.ts";
import { buildCompanion } from "@actor/companion/progression.ts";
import { customizationSlots } from "@actor/companion/slots.ts";
import type { CompanionTypeInput } from "@actor/companion/values.ts";

const wolf: CompanionTypeInput = {
    sizes: ["sm"],
    abilities: { str: 2, dex: 3, con: 2, int: -4, wis: 1, cha: 0 },
    ancestryHp: 6,
    attacks: [
        {
            slug: "jaws",
            name: "Jaws",
            damage: { dice: 1, die: "d8", type: "piercing" },
            traits: ["finesse"],
        },
    ],
    skills: ["survival"],
    speeds: { land: 40 },
};

const agile: CompanionTypeInput = {
    sizes: ["sm", "med"],
    abilities: { str: 1, dex: 3, con: 2, int: -4, wis: 2, cha: -1 },
    ancestryHp: 6,
    attacks: [
        {
            slug: "blade",
            name: "Blade",
            damage: { dice: 1, die: "d6", type: "slashing" },
            traits: ["agile", "finesse", "versatile-p"],
        },
    ],
    skills: ["stealth"],
    speeds: { land: 40, climb: 20 },
};

describe("companion progression", () => {
    test("level 5 mature wolf", () => {
        const built = buildCompanion({
            profile: "animal",
            level: 5,
            stage: "mature",
            advanced: "",
            specializations: [],
            type: wolf,
        });

        expect(built.size).toBe("med");
        expect(built.abilities).toMatchObject({ str: 3, dex: 4, con: 3, int: -4, wis: 2, cha: 0 });
        expect(built.ranks.skills.survival).toBe(2);
        expect(built.ranks.skills.intimidation).toBe(1);
        expect(built.ranks.skills.stealth).toBe(1);
        expect(built.ranks.perception).toBe(2);
        expect(built.ranks.saves).toMatchObject({ fortitude: 2, reflex: 2, will: 2 });
        expect(built.ranks.unarmed).toBe(1);
        expect(built.ranks.unarmored).toBe(1);
        expect(built.attacks[0]).toMatchObject({
            dice: 2,
            die: "d8",
            stageDamageBonus: 0,
            strengthDamage: 3,
            attackModifier: 11,
            magical: false,
        });
        expect(built.ac).toBe(21);
        expect(built.hpMax).toBe(51);
        expect(built.advancedManeuver).toBe(false);
    });

    test("specialized agility ambusher wolf", () => {
        const built = buildCompanion({
            profile: "animal",
            level: 5,
            stage: "specialized",
            advanced: "agility",
            specializations: ["ambusher"],
            type: wolf,
        });

        expect(built.size).toBe("med");
        expect(built.abilities).toMatchObject({ str: 4, dex: 8, con: 4, wis: 3, int: -2, cha: 0 });
        expect(built.hpMax).toBe(56);
        expect(built.attacks[0]).toMatchObject({ dice: 3, die: "d8", stageDamageBonus: 4, magical: true });
        expect(built.ranks.unarmed).toBe(2);
        expect(built.ranks.unarmored).toBe(2);
        expect(built.ranks.simple).toBe(2);
        expect(built.ranks.martial).toBe(2);
        expect(built.ranks.light).toBe(1);
        expect(built.ranks.perception).toBe(3);
        expect(built.ranks.saves.fortitude).toBe(3);
        expect(built.ranks.skills).toMatchObject({
            acrobatics: 2,
            athletics: 1,
            survival: 2,
            stealth: 2,
            intimidation: 1,
        });
    });

    test("specialized power wrecker wolf", () => {
        const built = buildCompanion({
            profile: "animal",
            level: 5,
            stage: "specialized",
            advanced: "power",
            specializations: ["wrecker"],
            type: wolf,
        });

        expect(built.size).toBe("lg");
        expect(built.abilities).toMatchObject({ str: 6, dex: 6, con: 4, wis: 3, int: -2 });
        expect(built.attacks[0].stageDamageBonus).toBe(6);
        expect(built.ranks.skills.athletics).toBe(3);
    });

    test("agility is the full total from young, not mature stacked again", () => {
        const built = buildCompanion({
            profile: "animal",
            level: 5,
            stage: "agility",
            advanced: "",
            specializations: [],
            type: wolf,
        });

        expect(built.abilities.dex).toBe(6);
        expect(built.abilities.str).toBe(4);
        expect(built.attacks[0]).toMatchObject({ dice: 2, stageDamageBonus: 2, magical: true });
        expect(built.size).toBe("med");
        expect(built.advancedManeuver).toBe(true);
        expect(built.hpMax).toBe(56);
    });

    test("level 1 agile chassis", () => {
        const built = buildCompanion({
            profile: "robot",
            level: 1,
            stage: "initial",
            advanced: "",
            specializations: [],
            type: agile,
        });

        expect(built.size).toBe("sm");
        expect(built.abilities).toMatchObject({ str: 1, dex: 3, con: 2, int: -4, wis: 2, cha: -1 });
        expect(built.hpMax).toBe(14);
        expect(built.ac).toBe(16);
        expect(built.attacks[0]).toMatchObject({
            dice: 1,
            die: "d6",
            stageDamageBonus: 0,
            attackModifier: 6,
            magical: false,
        });
        expect(built.ranks.skills.stealth).toBe(1);
    });

    test("a robot that does not grow stays small at mature", () => {
        const built = buildCompanion({
            profile: "robot",
            level: 5,
            stage: "mature",
            advanced: "",
            specializations: [],
            type: agile,
            grow: { mature: false, power: false },
        });

        expect(built.size).toBe("sm");
        expect(built.abilities.str).toBe(2);
        expect(built.abilities.dex).toBe(4);
    });

    test("hardened chassis raises hit points per level", () => {
        const built = buildCompanion({
            profile: "animal",
            level: 5,
            stage: "mature",
            advanced: "",
            specializations: [],
            type: wolf,
            hpPerLevel: 8,
        });

        expect(built.hpMax).toBe(61);
    });

    test("specialized with an empty track still produces agility numbers", () => {
        const built = buildCompanion({
            profile: "animal",
            level: 5,
            stage: "specialized",
            advanced: "",
            specializations: [],
            type: wolf,
        });

        expect(built.advanced).toBe("agility");
        expect(built.attacks[0].stageDamageBonus).toBe(4);
        expect(built.abilities.dex).toBe(7);
    });
});

describe("companion grants", () => {
    test("highest stage wins and a grant with no stage leaves it alone", () => {
        const resolved = resolveCompanionGrants(
            [{ profile: "animal" }, { profile: "animal", stage: "mature" }, { profile: "animal", stage: "agility" }],
            "animal",
            "",
        );

        expect(resolved.stage).toBe("agility");
        expect(resolved.advanced).toBe("agility");
    });

    test("no stage grant leaves the sheet stage alone", () => {
        const resolved = resolveCompanionGrants([{ profile: "animal", role: "drone" }], "animal", "");
        expect(resolved.stage).toBeNull();
        expect(resolved.role).toBe("drone");
    });

    test("specializations append and once-slots count once", () => {
        const slot = { grade: "superior" as const, count: 1, once: true };
        const resolved = resolveCompanionGrants(
            [
                { profile: "robot", stage: "specialized", specialization: "ambusher", extraSlots: [slot] },
                { profile: "robot", stage: "specialized", specialization: "wrecker", extraSlots: [slot] },
                { profile: "robot", stage: "specialized", specialization: "ambusher", extraSlots: [slot] },
            ],
            "robot",
            "agility",
        );

        expect(resolved.specializations).toEqual(["ambusher", "wrecker"]);
        expect(resolved.extraSlots.superior).toBe(1);
        expect(resolved.advanced).toBe("agility");
    });

    test("independent is OR and an equal agility or power tie keeps the sheet track", () => {
        const resolved = resolveCompanionGrants(
            [
                { profile: "animal", stage: "agility" },
                { profile: "animal", stage: "power", independent: true },
            ],
            "animal",
            "agility",
        );

        expect(resolved.stage).toBe("agility");
        expect(resolved.independent).toBe(true);
    });

    test("without a sheet track the last equal grant wins", () => {
        const resolved = resolveCompanionGrants(
            [
                { profile: "animal", stage: "agility" },
                { profile: "animal", stage: "power" },
            ],
            "animal",
            "",
        );
        expect(resolved.stage).toBe("power");
    });
});

describe("customization slots", () => {
    const none = { commercial: 0, tactical: 0, advanced: 0, superior: 0 };

    test("a drone grant's commercial extras are not added on top of the role", () => {
        const resolved = resolveCompanionGrants(
            [
                {
                    profile: "robot",
                    role: "drone",
                    extraSlots: [{ grade: "commercial", count: 2 }],
                },
                { profile: "robot", extraSlots: [{ grade: "tactical", count: 1 }] },
            ],
            "robot",
            "",
        );

        expect(resolved.role).toBe("drone");
        expect(resolved.extraSlots.commercial).toBe(0);
        expect(resolved.extraSlots.tactical).toBe(1);
        expect(customizationSlots("robot", "initial", resolved.role, resolved.extraSlots).commercial).toBe(3);
    });

    test("animals have none and a drone starts with three commercial", () => {
        expect(customizationSlots("animal", "mature", "", none)).toEqual(none);
        expect(customizationSlots("robot", "initial", "", none).commercial).toBe(1);
        expect(customizationSlots("robot", "initial", "drone", none).commercial).toBe(3);
    });

    test("the stage grants the matching grade and feat extras add", () => {
        const extra = { ...none, tactical: 1 };
        expect(customizationSlots("robot", "mature", "drone", extra)).toMatchObject({
            commercial: 3,
            tactical: 2,
            advanced: 0,
            superior: 0,
        });
        expect(customizationSlots("robot", "specialized", "", none)).toEqual({
            commercial: 1,
            tactical: 1,
            advanced: 1,
            superior: 1,
        });
    });
});
