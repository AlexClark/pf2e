import { applySpecialization } from "./specializations.ts";
import {
    ALWAYS_TRAINED_SKILLS,
    MATURE_SKILLS,
    atMostMedium,
    emptyAbilities,
    proficiencyBonus,
    stepSize,
    type AbilityMods,
    type AdvancedTrack,
    type CompanionProfile,
    type CompanionSize,
    type CompanionSpeed,
    type CompanionStage,
    type CompanionTypeInput,
    type SaveRanks,
    type StoredTrack,
} from "./values.ts";

/** Ability increases from the young companion, already including mature. These do not stack with each other. */
const STAGE_ABILITY: Record<"initial" | "mature" | "agility" | "power", AbilityMods> = {
    initial: emptyAbilities(),
    mature: { str: 1, dex: 1, con: 1, int: 0, wis: 1, cha: 0 },
    agility: { str: 2, dex: 3, con: 2, int: 0, wis: 2, cha: 0 },
    power: { str: 3, dex: 2, con: 2, int: 0, wis: 2, cha: 0 },
};

interface SkillAdjustment {
    skill: string;
    /** floor sets a minimum rank. upgrade is expert, or master if already expert. */
    mode: "floor" | "upgrade";
    rank?: number;
}

interface ProgressionInput {
    profile: CompanionProfile;
    level: number;
    stage: CompanionStage;
    /** Required once the companion is specialized, so damage knows +4 from +6. Empty means agility. */
    advanced: StoredTrack;
    specializations: string[];
    type: CompanionTypeInput;
    sizeChoice?: CompanionSize | null;
    /** Robots only. Animals always grow. */
    grow?: { mature: boolean; power: boolean };
    /** 6, or 8 with Hardened Chassis. */
    hpPerLevel?: number;
    sapient?: boolean;
    /** Unlocks Charisma skills and Common. */
    artificialPersonality?: boolean;
    glowUp?: boolean;
    skillAdjustments?: SkillAdjustment[];
}

interface BuiltAttack {
    slug: string;
    name: string;
    dice: number;
    die: string;
    damageType: string;
    /** The +2/+3/+4/+6 from the stage. Strength is separate. */
    stageDamageBonus: number;
    strengthDamage: number;
    magical: boolean;
    traits: string[];
    range: number | null;
    attackAttribute: "str" | "dex";
    attackModifier: number;
    damageFormula: string;
}

interface ProgressionResult {
    stage: CompanionStage;
    advanced: AdvancedTrack;
    abilities: AbilityMods;
    size: CompanionSize;
    ranks: {
        perception: number;
        saves: SaveRanks;
        unarmed: number;
        unarmored: number;
        light: number;
        heavy: number;
        simple: number;
        martial: number;
        skills: Record<string, number>;
    };
    attacks: BuiltAttack[];
    hpMax: number;
    /** 10 + Dexterity + unarmored proficiency, before item bonuses. */
    ac: number;
    magical: boolean;
    advancedManeuver: boolean;
    speeds: Partial<Record<CompanionSpeed, number>>;
    racer: boolean;
    denyAdvantage: boolean;
    ignoresHalfHardness: boolean;
    extraTraits: string[];
    languages: string[];
    charismaSkills: boolean;
    mentalSkills: boolean;
}

function trackFor(stage: CompanionStage, advanced: StoredTrack): AdvancedTrack {
    if (stage === "power") return "power";
    if (stage === "agility") return "agility";
    if (stage === "specialized") return advanced === "power" ? "power" : "agility";
    return "agility";
}

function stageDamageBonus(stage: CompanionStage, track: AdvancedTrack): number {
    if (stage === "specialized") return track === "power" ? 6 : 4;
    if (stage === "agility") return 2;
    if (stage === "power") return 3;
    return 0;
}

function attackDice(base: number, stage: CompanionStage): number {
    if (stage === "initial") return base;
    const mature = base === 1 ? 2 : base;
    return stage === "specialized" ? mature + 1 : mature;
}

function startingSize(type: CompanionTypeInput, choice: CompanionSize | null | undefined): CompanionSize {
    if (choice && type.sizes.includes(choice)) return choice;
    return type.sizes[0] ?? "sm";
}

function resolveSize(
    start: CompanionSize,
    stage: CompanionStage,
    track: AdvancedTrack,
    grow: { mature: boolean; power: boolean },
): CompanionSize {
    let size = start;
    const powerTrack = track === "power" && (stage === "power" || stage === "specialized");
    if (grow.mature && stage !== "initial" && atMostMedium(size)) size = stepSize(size);
    if (grow.power && powerTrack && atMostMedium(size)) size = stepSize(size);
    return size;
}

function addMods(base: AbilityMods, delta: AbilityMods): AbilityMods {
    return {
        str: base.str + delta.str,
        dex: base.dex + delta.dex,
        con: base.con + delta.con,
        int: base.int + delta.int,
        wis: base.wis + delta.wis,
        cha: base.cha + delta.cha,
    };
}

function signed(value: number): string {
    if (value === 0) return "";
    return value > 0 ? `+${value}` : `${value}`;
}

function buildCompanion(input: ProgressionInput): ProgressionResult {
    const stage = input.stage;
    const advanced = trackFor(stage, input.advanced);
    const matureOrBetter = stage !== "initial";
    const onTrack = stage === "agility" || stage === "power" || stage === "specialized";
    const specialized = stage === "specialized";
    const abilityKey = stage === "specialized" ? advanced : stage === "initial" ? "initial" : stage;

    const abilities = addMods(input.type.abilities, STAGE_ABILITY[abilityKey]);
    if (specialized) {
        abilities.dex += 1;
        abilities.int += 2;
    }

    const skills: Record<string, number> = {};
    for (const skill of [...ALWAYS_TRAINED_SKILLS, ...input.type.skills]) {
        skills[skill] = Math.max(skills[skill] ?? 0, 1);
    }

    const saves: SaveRanks = { fortitude: 1, reflex: 1, will: 1 };
    let perception = 1;
    let unarmed = 1;
    let unarmored = 1;

    if (matureOrBetter) {
        perception = Math.max(perception, 2);
        saves.fortitude = Math.max(saves.fortitude, 2);
        saves.reflex = Math.max(saves.reflex, 2);
        saves.will = Math.max(saves.will, 2);
        for (const skill of MATURE_SKILLS) {
            skills[skill] = (skills[skill] ?? 0) >= 1 ? Math.max(skills[skill] ?? 0, 2) : 1;
        }
    }
    if (stage === "agility" || (specialized && advanced === "agility")) {
        skills.acrobatics = Math.max(skills.acrobatics ?? 0, 2);
    }
    if (stage === "power" || (specialized && advanced === "power")) {
        skills.athletics = Math.max(skills.athletics ?? 0, 2);
    }
    if (specialized) {
        perception = Math.max(perception, 3);
        saves.fortitude = Math.max(saves.fortitude, 3);
        saves.reflex = Math.max(saves.reflex, 3);
        saves.will = Math.max(saves.will, 3);
        unarmed = Math.max(unarmed, 2);
    }

    const specs = specialized ? input.specializations : [];
    const specState = { abilities, skills, unarmored, saves };
    for (const slug of specs) applySpecialization(slug, specState);
    unarmored = specState.unarmored;

    if (input.sapient) abilities.int = Math.max(abilities.int, 0);
    if (input.glowUp) {
        abilities.cha = Math.max(abilities.cha, 3);
        skills.diplomacy = (skills.diplomacy ?? 0) >= 2 ? Math.max(skills.diplomacy ?? 0, 3) : 2;
    }
    for (const adjustment of input.skillAdjustments ?? []) {
        const current = skills[adjustment.skill] ?? 0;
        skills[adjustment.skill] =
            adjustment.mode === "upgrade"
                ? current >= 2
                    ? Math.max(current, 3)
                    : 2
                : Math.max(current, adjustment.rank ?? 1);
    }

    const grow =
        input.profile === "animal" ? { mature: true, power: true } : (input.grow ?? { mature: false, power: false });
    const size = resolveSize(startingSize(input.type, input.sizeChoice), stage, advanced, grow);
    const bonus = stageDamageBonus(stage, advanced);
    const magical = onTrack;
    const level = Math.max(input.level, 0);
    const hpPerLevel = input.hpPerLevel ?? 6;
    const hpMax = Math.max(1, input.type.ancestryHp + (hpPerLevel + abilities.con) * level);
    const ac = 10 + abilities.dex + proficiencyBonus(unarmored, level);
    const attackRankBonus = proficiencyBonus(unarmed, level);

    const attacks: BuiltAttack[] = input.type.attacks.map((attack) => {
        const ranged = typeof attack.range === "number" && attack.range > 0;
        const finesse = attack.traits.includes("finesse");
        const attackAttribute = ranged || finesse ? "dex" : "str";
        const strengthDamage = ranged ? 0 : abilities.str;
        const flat = strengthDamage + bonus;
        const dice = attackDice(attack.damage.dice, stage);
        const traits =
            magical && !attack.traits.includes("magical") ? [...attack.traits, "magical"] : [...attack.traits];
        return {
            slug: attack.slug,
            name: attack.name,
            dice,
            die: attack.damage.die,
            damageType: attack.damage.type,
            stageDamageBonus: bonus,
            strengthDamage,
            magical,
            traits,
            range: attack.range ?? null,
            attackAttribute,
            attackModifier: attackRankBonus + abilities[attackAttribute],
            damageFormula: `${dice}${attack.damage.die}${signed(flat)}`,
        };
    });

    const specSet = new Set(specs);
    const languages = input.sapient || input.artificialPersonality ? ["common"] : [];

    return {
        stage,
        advanced,
        abilities,
        size,
        ranks: {
            perception,
            saves,
            unarmed,
            unarmored,
            light: 1,
            heavy: 1,
            simple: unarmed,
            martial: unarmed,
            skills,
        },
        attacks,
        hpMax,
        ac,
        magical,
        advancedManeuver: onTrack,
        speeds: { ...input.type.speeds },
        racer: specSet.has("racer"),
        denyAdvantage: specSet.has("daredevil"),
        ignoresHalfHardness: specSet.has("wrecker"),
        extraTraits: specSet.has("daredevil") ? ["deny-advantage"] : [],
        languages,
        charismaSkills: !!(input.artificialPersonality || input.sapient || input.glowUp),
        mentalSkills: !!(input.sapient || specialized),
    };
}

export { buildCompanion, stageDamageBonus };
export type { BuiltAttack, ProgressionInput, ProgressionResult, SkillAdjustment };
