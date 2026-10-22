import type { Size } from "@module/data.ts";

type Ability = "str" | "dex" | "con" | "int" | "wis" | "cha";
type Save = "fortitude" | "reflex" | "will";
type Attack = "simple" | "martial" | "advanced" | "unarmed";
type Defense = "unarmored" | "light" | "medium" | "heavy";
type SpeedMode = "swim" | "fly" | "climb" | "burrow";
type Rank = 1 | 2 | 3 | 4;
type Tradition = "arcane" | "divine" | "occult" | "primal";
type SpellSource = "focus" | "innate" | "slot" | "repertoire";
type SizeCompare = "exact" | "at-least" | "at-most";

type PrereqAtom =
    | { kind: "proficiency"; statistic: string; minRank: Rank }
    | { kind: "attribute"; ability: Ability; minMod: number }
    | { kind: "feat"; name: string; uuid?: string }
    | { kind: "feature"; name: string; uuid?: string }
    | { kind: "trait"; trait: string }
    | { kind: "tag"; tag: string }
    | { kind: "sense"; sense: string }
    | { kind: "speed"; mode: SpeedMode; feet?: number }
    | { kind: "focus-pool"; min: number }
    | { kind: "class"; slug: string }
    | { kind: "class-hp"; max: number }
    | {
          kind: "spellcasting";
          tradition?: Tradition;
          /** Prepared or spontaneous entry, the spellcasting class feature. */
          classFeature?: boolean;
          prepared?: boolean;
          spontaneous?: boolean;
          innate?: boolean;
          focus?: boolean;
      }
    | { kind: "spell"; slug?: string; trait?: string; source?: SpellSource; tradition?: Tradition }
    | { kind: "spell-rank"; min: number }
    | { kind: "deity"; slug?: string; font?: "heal" | "harm"; sanctification?: "holy" | "unholy" }
    | { kind: "size"; size: Size; compare: SizeCompare }
    | { kind: "hands"; min: number }
    | { kind: "versatile" }
    | { kind: "selection"; key: string; value: string }
    | { kind: "tradition"; source: "mystic" | "bloodline" | "witch"; tradition: Tradition }
    | { kind: "casting-skill"; source: "bloodline" | "patron" | "paradox"; minRank: Rank }
    | { kind: "kinetic"; min: number; max?: number }
    | { kind: "action"; name: string }
    | { kind: "language"; slug?: string; min?: number }
    | { kind: "not"; atom: PrereqAtom }
    | { kind: "or"; any: PrereqAtom[][] }
    | { kind: "unparsed"; text: string };

/** One pack document the parser may name. Heritages are features that also take the heritage label. */
interface CatalogDocument {
    name: string;
    group: "feat" | "feature" | "heritage";
    otherTags: readonly string[];
}

interface CompiledPrerequisites {
    version: number;
    clauses: PrereqAtom[][];
}

/** One `system.prerequisites.value` entry. `checked` replaces the sentence when `checkedFor` still matches it. */
interface PrerequisiteClause {
    value: string;
    checked?: PrereqAtom[];
    checkedFor?: string;
}

/** Skill labels plus the exact document names a sentence may be. */
interface ParseContext {
    /** Slug to the book label, for example `arcana` to `Arcana`. */
    skills: ReadonlyMap<string, string>;
    featNames: ReadonlySet<string>;
    featureNames: ReadonlySet<string>;
    /** Heritage document names. The heritage label matches only this set. */
    heritageNames?: ReadonlySet<string>;
    /** otherTag to the documents that carry it. Label words such as muse bind here. */
    tagged?: ReadonlyMap<string, readonly { name: string; kind: "feat" | "feature" }[]>;
}

interface SpellcastingFact {
    classFeature: boolean;
    prepared: boolean;
    spontaneous: boolean;
    innate: boolean;
    focus: boolean;
    tradition: Tradition | null;
    /** Highest spell slot rank with at least one slot. 0 when the entry has none. */
    slotRank: number;
}

interface KnownSpell {
    slug: string;
    source: "focus" | "innate" | "spell";
    tradition: Tradition | null;
    traits: string[];
    prepared: boolean;
    spontaneous: boolean;
}

interface CharacterSnapshot {
    level: number;
    className: string | null;
    classSlug: string | null;
    /** Hit Points per level from the class, before Constitution. 0 when the character has no class. */
    classHp: number;
    countsAs: string[];
    abilities: Record<Ability, number>;
    skills: Record<string, number>;
    perception: number;
    saves: Record<Save, number>;
    attacks: Record<Attack, number>;
    defenses: Record<Defense, number>;
    feats: { name: string; slug: string; category: string; sourceId: string | null }[];
    features: { name: string; slug: string; otherTags: string[]; sourceId: string | null }[];
    /** Union of the pack grant map. The same list for every character. */
    classArchetypeDedicationIds: string[];
    /** Dedications granted by class-archetype features on this actor. */
    grantedClassArchetypeDedicationIds: string[];
    speeds: Partial<Record<SpeedMode, number>>;
    focusMax: number;
    traits: string[];
    /** Sense type slugs, for example `low-light-vision`. */
    senses: string[];
    size: Size;
    /** Total hands, from `hands.max.value`. */
    hands: number;
    versatile: boolean;
    deity: {
        slug: string;
        name: string;
        fonts: ("heal" | "harm")[];
        sanctification: ("holy" | "unholy")[];
    } | null;
    /** Prepared, spontaneous, innate, and focus entries. Rituals and trick magic are omitted. */
    spellcasting: SpellcastingFact[];
    spells: KnownSpell[];
    /** ChoiceSet selections copied off embedded items. */
    selections: { key: string; value: string }[];
    mysticTradition: Tradition | null;
    witchTradition: Tradition | null;
    paradoxTradition: Tradition | null;
    patronSkill: string | null;
    bloodlineTraditions: Tradition[];
    kineticElements: string[];
    /** Names of embedded actions, including ones a feat granted. */
    actions: string[];
    languages: string[];
}

type EligibilityStatus = "legal" | "illegal" | "unchecked";

interface EligibilityResult {
    status: EligibilityStatus;
    /** Character-term phrases. Empty unless illegal. */
    failures: string[];
    /** Joined prerequisite sentences. Set when unchecked. */
    sentence: string | null;
}

interface SlotContext {
    groupId: string;
    level: number;
}

interface IndexedFeat {
    id: string;
    name: string;
    slug: string;
    category: string;
    traits: string[];
    level: number;
    onlyLevel1: boolean;
    /** Omitted means once. Null means no limit. */
    maxTakable?: number | null;
    clauses: PrereqAtom[][];
    /** Dedication name to the names in that family. The index shares one map. */
    families?: ReadonlyMap<string, ReadonlySet<string>>;
}

export type {
    Ability,
    Attack,
    CharacterSnapshot,
    CompiledPrerequisites,
    Defense,
    EligibilityResult,
    EligibilityStatus,
    IndexedFeat,
    CatalogDocument,
    ParseContext,
    PrereqAtom,
    PrerequisiteClause,
    KnownSpell,
    Rank,
    Save,
    SizeCompare,
    SlotContext,
    SpeedMode,
    SpellcastingFact,
    SpellSource,
    Tradition,
};
