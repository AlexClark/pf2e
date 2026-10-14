const COMPANION_PROFILES = ["animal", "robot"] as const;
const COMPANION_STAGES = ["initial", "mature", "agility", "power", "specialized"] as const;
const ADVANCED_TRACKS = ["agility", "power"] as const;
const CUSTOMIZATION_GRADES = ["commercial", "tactical", "advanced", "superior"] as const;
const COMPANION_SIZES = ["tiny", "sm", "med", "lg", "huge", "grg"] as const;
const COMPANION_SPEEDS = ["land", "burrow", "climb", "fly", "swim"] as const;
const ABILITY_ABBRS = ["str", "dex", "con", "int", "wis", "cha"] as const;
const SAVE_ABBRS = ["fortitude", "reflex", "will"] as const;

/** Young trained skills that every companion has, plus the three mature raises. */
const ALWAYS_TRAINED_SKILLS = ["acrobatics", "athletics"] as const;
const MATURE_SKILLS = ["intimidation", "stealth", "survival"] as const;

const STAGE_RANK: Record<CompanionStage, number> = {
    initial: 0,
    mature: 1,
    agility: 2,
    power: 2,
    specialized: 3,
};

type CompanionProfile = (typeof COMPANION_PROFILES)[number];
type CompanionStage = (typeof COMPANION_STAGES)[number];
type AdvancedTrack = (typeof ADVANCED_TRACKS)[number];
type StoredTrack = "" | AdvancedTrack;
type CustomizationGrade = (typeof CUSTOMIZATION_GRADES)[number];
type CompanionSize = (typeof COMPANION_SIZES)[number];
type CompanionSpeed = (typeof COMPANION_SPEEDS)[number];
type AbilityAbbr = (typeof ABILITY_ABBRS)[number];
type SaveAbbr = (typeof SAVE_ABBRS)[number];
type AbilityMods = Record<AbilityAbbr, number>;
type SaveRanks = Record<SaveAbbr, number>;

interface CompanionAttackSpec {
    slug: string;
    name: string;
    /** Young die count. Mature raises a 1-die attack to 2; specialized adds one more. */
    damage: { dice: number; die: string; type: string };
    traits: string[];
    range?: number | null;
}

interface CompanionTypeInput {
    sizes: CompanionSize[];
    abilities: AbilityMods;
    ancestryHp: number;
    attacks: CompanionAttackSpec[];
    skills: string[];
    speeds: Partial<Record<CompanionSpeed, number>>;
    senses?: { type: string; acuity?: string; range?: number }[];
    traits?: string[];
    replacesCreatureTrait?: string | null;
    resistances?: { type: string; formula: number | "half-level" }[];
    mount?: boolean;
    imitator?: boolean;
}

function emptyAbilities(value = 0): AbilityMods {
    return { str: value, dex: value, con: value, int: value, wis: value, cha: value };
}

function proficiencyBonus(rank: number, level: number): number {
    if (rank <= 0) return 0;
    return level + 2 * rank;
}

function atMostMedium(size: CompanionSize): boolean {
    return COMPANION_SIZES.indexOf(size) <= COMPANION_SIZES.indexOf("med");
}

function stepSize(size: CompanionSize): CompanionSize {
    const index = COMPANION_SIZES.indexOf(size);
    return COMPANION_SIZES[Math.min(index + 1, COMPANION_SIZES.length - 1)] ?? size;
}

/** Stages a companion still counts as. A nimble companion is still mature. */
function impliedStages(stage: CompanionStage, advanced: StoredTrack): CompanionStage[] {
    if (stage === "initial") return ["initial"];
    const stages: CompanionStage[] = ["initial", "mature"];
    if (stage === "mature") return stages;
    const track: AdvancedTrack = stage === "specialized" ? (advanced === "power" ? "power" : "agility") : stage;
    stages.push(track);
    if (stage === "specialized") stages.push("specialized");
    return stages;
}

export {
    ABILITY_ABBRS,
    ADVANCED_TRACKS,
    ALWAYS_TRAINED_SKILLS,
    COMPANION_PROFILES,
    COMPANION_SIZES,
    COMPANION_SPEEDS,
    COMPANION_STAGES,
    CUSTOMIZATION_GRADES,
    MATURE_SKILLS,
    SAVE_ABBRS,
    STAGE_RANK,
    atMostMedium,
    emptyAbilities,
    impliedStages,
    proficiencyBonus,
    stepSize,
};
export type {
    AbilityAbbr,
    AbilityMods,
    AdvancedTrack,
    CompanionAttackSpec,
    CompanionProfile,
    CompanionSize,
    CompanionSpeed,
    CompanionStage,
    CompanionTypeInput,
    CustomizationGrade,
    SaveAbbr,
    SaveRanks,
    StoredTrack,
};
