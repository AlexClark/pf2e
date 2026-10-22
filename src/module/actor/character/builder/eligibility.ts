import { classArchetypeFailure, newDedicationFailures, ownClassFailure } from "./archetype-gate.ts";
import type { Size } from "@module/data.ts";
import type {
    Attack,
    CharacterSnapshot,
    Defense,
    EligibilityResult,
    IndexedFeat,
    KnownSpell,
    PrereqAtom,
    Rank,
    Save,
    SlotContext,
    Tradition,
} from "./types.ts";

const SIZE_RANKS: Record<Size, number> = { tiny: 0, sm: 1, med: 2, lg: 3, huge: 4, grg: 5 };
const SIZE_WORDS: Record<Size, string> = {
    tiny: "Tiny",
    sm: "Small",
    med: "Medium",
    lg: "Large",
    huge: "Huge",
    grg: "Gargantuan",
};
const TRADITION_SKILLS: Record<Tradition, string> = {
    arcane: "arcana",
    divine: "religion",
    occult: "occultism",
    primal: "nature",
};
const RECALL_SKILLS = ["arcana", "computers", "crafting", "medicine", "nature", "occultism", "religion", "society"];

const RANK_WORDS: Record<Rank, string> = {
    1: "trained",
    2: "expert",
    3: "master",
    4: "legendary",
};

const ABILITY_NAMES = {
    str: "Strength",
    dex: "Dexterity",
    con: "Constitution",
    int: "Intelligence",
    wis: "Wisdom",
    cha: "Charisma",
} as const;

const ATTACK_LABELS: Record<Attack, string> = {
    simple: "simple weapons",
    martial: "martial weapons",
    advanced: "advanced weapons",
    unarmed: "unarmed attacks",
};

const DEFENSE_LABELS: Record<Defense, string> = {
    unarmored: "unarmored defense",
    light: "light armor",
    medium: "medium armor",
    heavy: "heavy armor",
};

const SAVE_LABELS: Record<Save, string> = {
    fortitude: "Fortitude saves",
    reflex: "Reflex saves",
    will: "Will saves",
};

/** Groups that list the categories they accept. An unknown group does not add a category failure. */
const SUPPORTED: Record<string, readonly string[]> = {
    ancestry: ["ancestry"],
    class: ["class"],
    archetype: ["class"],
    skill: ["skill"],
    general: ["general", "skill"],
    ancestryfeature: ["ancestryfeature"],
    classfeature: ["classfeature"],
};

const EMPTY_FAMILIES: ReadonlyMap<string, ReadonlySet<string>> = new Map();

function spellcastingPhrase(atom: Extract<PrereqAtom, { kind: "spellcasting" }>): string {
    const tradition = atom.tradition ? `${atom.tradition} ` : "";
    if (atom.focus) return `${tradition}focus spells`;
    if (atom.innate) return `${tradition}innate spells`;
    if (atom.prepared) return `${tradition}prepared spells`;
    if (atom.spontaneous) return `${tradition}spell repertoire`;
    if (atom.classFeature) return `${tradition}spellcasting class feature`;
    return tradition.length > 0 ? `${atom.tradition} spells` : "spellcasting";
}

function spellPhrase(atom: Extract<PrereqAtom, { kind: "spell" }>): string {
    if (atom.slug) return titleWords(atom.slug);
    if (atom.trait) return `${atom.trait} spell`;
    if (atom.tradition && atom.source === "innate") return `${atom.tradition} innate spell`;
    return atom.tradition ? `${atom.tradition} spell` : "spell";
}

function deityPhrase(atom: Extract<PrereqAtom, { kind: "deity" }>): string {
    if (atom.slug) return titleWords(atom.slug);
    if (atom.font) return `${atom.font} font`;
    if (atom.sanctification) return atom.sanctification;
    return "a deity";
}

function sizePhrase(atom: Extract<PrereqAtom, { kind: "size" }>): string {
    const name = SIZE_WORDS[atom.size];
    if (atom.compare === "at-least") return `${name} or larger`;
    if (atom.compare === "at-most") return `${name} or smaller`;
    return name;
}

function titleWords(slug: string): string {
    return slug
        .split("-")
        .map((word) => (word.length === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
        .join(" ");
}

function statisticLabel(statistic: string): string {
    if (statistic === "recall-knowledge") return "Recall Knowledge";
    if (statistic === "any-lore") return "a Lore skill";
    if (statistic === "any-skill") return "any skill";
    if (statistic === "any-save") return "any saving throw";
    if (statistic === "perception") return "Perception";
    if (statistic in SAVE_LABELS) return SAVE_LABELS[statistic as Save];
    if (statistic in ATTACK_LABELS) return ATTACK_LABELS[statistic as Attack];
    if (statistic in DEFENSE_LABELS) return DEFENSE_LABELS[statistic as Defense];
    if (statistic === "lore") return "Lore";
    if (statistic.endsWith("-lore")) return `${titleWords(statistic.slice(0, -"-lore".length))} Lore`;
    return titleWords(statistic);
}

function phrase(atom: PrereqAtom): string {
    switch (atom.kind) {
        case "proficiency":
            return `${RANK_WORDS[atom.minRank]} in ${statisticLabel(atom.statistic)}`;
        case "attribute":
            return `${ABILITY_NAMES[atom.ability]} +${atom.minMod}`;
        case "feat":
        case "feature":
            return atom.name;
        case "tag":
            return atom.tag;
        case "sense":
            return atom.sense;
        case "speed":
            return atom.feet === undefined ? `${atom.mode} speed` : `${atom.mode} speed ${atom.feet} feet`;
        case "focus-pool":
            return `focus pool ${atom.min}`;
        case "class":
            return titleWords(atom.slug);
        case "class-hp":
            return `class hit points ${atom.max}`;
        case "spellcasting":
            return spellcastingPhrase(atom);
        case "spell":
            return spellPhrase(atom);
        case "spell-rank":
            return `${atom.min}th-rank spells`;
        case "deity":
            return deityPhrase(atom);
        case "size":
            return sizePhrase(atom);
        case "hands":
            return `${atom.min} hands`;
        case "versatile":
            return "versatile heritage";
        case "selection":
            return `${atom.key} ${atom.value}`;
        case "tradition":
            return `${atom.source} ${atom.tradition}`;
        case "casting-skill":
            return `${RANK_WORDS[atom.minRank]} in ${atom.source} tradition`;
        case "kinetic":
            return atom.max === 1 ? "one kinetic element" : `${atom.min} kinetic elements`;
        case "action":
            return atom.name;
        case "language":
            return atom.min ? `${atom.min} languages` : (atom.slug ?? "language");
        case "trait":
            return atom.trait;
        case "not":
            return `not ${phrase(atom.atom)}`;
        case "or":
            return atom.any.map((branch) => branch.map(phrase).join("; ")).join(" or ");
        case "unparsed":
            return atom.text;
    }
}

function bestSkill(snapshot: CharacterSnapshot, slugs: readonly string[]): number {
    let best = 0;
    for (const slug of slugs) best = Math.max(best, snapshot.skills[slug] ?? 0);
    return best;
}

function bestLore(snapshot: CharacterSnapshot): number {
    let best = 0;
    for (const [slug, rank] of Object.entries(snapshot.skills)) {
        if (slug === "lore" || slug.endsWith("-lore")) best = Math.max(best, rank);
    }
    return best;
}

function bestAnySkill(snapshot: CharacterSnapshot): number {
    let best = 0;
    for (const rank of Object.values(snapshot.skills)) best = Math.max(best, rank);
    return best;
}

function bestSave(snapshot: CharacterSnapshot): number {
    return Math.max(snapshot.saves.fortitude, snapshot.saves.reflex, snapshot.saves.will);
}

function statisticRank(snapshot: CharacterSnapshot, statistic: string): number {
    if (statistic === "recall-knowledge") return Math.max(bestSkill(snapshot, RECALL_SKILLS), bestLore(snapshot));
    if (statistic === "any-lore") return bestLore(snapshot);
    if (statistic === "any-skill") return bestAnySkill(snapshot);
    if (statistic === "any-save") return bestSave(snapshot);
    if (statistic === "perception") return snapshot.perception;
    if (statistic in snapshot.saves) return snapshot.saves[statistic as Save];
    if (statistic in snapshot.attacks) return snapshot.attacks[statistic as Attack];
    if (statistic in snapshot.defenses) return snapshot.defenses[statistic as Defense];
    return snapshot.skills[statistic] ?? 0;
}

function spellcastingMet(snapshot: CharacterSnapshot, atom: Extract<PrereqAtom, { kind: "spellcasting" }>): boolean {
    return snapshot.spellcasting.some((entry) => {
        if (atom.classFeature && !entry.classFeature) return false;
        if (atom.prepared && !entry.prepared) return false;
        if (atom.spontaneous && !entry.spontaneous) return false;
        if (atom.innate && !entry.innate) return false;
        if (atom.focus && !entry.focus) return false;
        if (atom.tradition && entry.tradition !== atom.tradition) return false;
        return true;
    });
}

function spellMet(spell: KnownSpell, atom: Extract<PrereqAtom, { kind: "spell" }>): boolean {
    if (atom.slug && spell.slug !== atom.slug) return false;
    if (atom.trait && !spell.traits.includes(atom.trait)) return false;
    if (atom.tradition && spell.tradition !== atom.tradition) return false;
    if (atom.source === "focus") return spell.source === "focus";
    if (atom.source === "innate") return spell.source === "innate";
    if (atom.source === "repertoire") return spell.spontaneous;
    if (atom.source === "slot") return spell.prepared || spell.spontaneous;
    return true;
}

function deityMet(snapshot: CharacterSnapshot, atom: Extract<PrereqAtom, { kind: "deity" }>): boolean {
    const deity = snapshot.deity;
    if (!deity) return false;
    if (atom.slug && deity.slug !== atom.slug) return false;
    if (atom.font && !deity.fonts.includes(atom.font)) return false;
    if (atom.sanctification && !deity.sanctification.includes(atom.sanctification)) return false;
    return true;
}

function sizeMet(snapshot: CharacterSnapshot, atom: Extract<PrereqAtom, { kind: "size" }>): boolean {
    const rank = SIZE_RANKS[snapshot.size];
    const target = SIZE_RANKS[atom.size];
    if (atom.compare === "at-least") return rank >= target;
    if (atom.compare === "at-most") return rank <= target;
    return rank === target;
}

function traditionMet(snapshot: CharacterSnapshot, atom: Extract<PrereqAtom, { kind: "tradition" }>): boolean {
    if (atom.source === "mystic") return snapshot.mysticTradition === atom.tradition;
    if (atom.source === "witch") return snapshot.witchTradition === atom.tradition;
    return snapshot.bloodlineTraditions.includes(atom.tradition);
}

function castingSkillMet(snapshot: CharacterSnapshot, atom: Extract<PrereqAtom, { kind: "casting-skill" }>): boolean {
    const traditions =
        atom.source === "patron"
            ? [snapshot.witchTradition]
            : atom.source === "paradox"
              ? [snapshot.paradoxTradition]
              : snapshot.bloodlineTraditions;
    const skills =
        atom.source === "patron" && snapshot.patronSkill
            ? [snapshot.patronSkill]
            : traditions.flatMap((tradition) => (tradition ? [TRADITION_SKILLS[tradition]] : []));
    return skills.some((skill) => (snapshot.skills[skill] ?? 0) >= atom.minRank);
}

function languageMet(snapshot: CharacterSnapshot, atom: Extract<PrereqAtom, { kind: "language" }>): boolean {
    if (atom.min !== undefined && snapshot.languages.length < atom.min) return false;
    if (atom.slug && !snapshot.languages.includes(atom.slug)) return false;
    return atom.min !== undefined || atom.slug !== undefined;
}

type AtomCheck = { ok: true } | { ok: false; failure: string };

function evaluateAtom(atom: PrereqAtom, snapshot: CharacterSnapshot): AtomCheck {
    switch (atom.kind) {
        case "proficiency":
            return statisticRank(snapshot, atom.statistic) >= atom.minRank
                ? { ok: true }
                : { ok: false, failure: phrase(atom) };
        case "attribute":
            return snapshot.abilities[atom.ability] >= atom.minMod
                ? { ok: true }
                : { ok: false, failure: phrase(atom) };
        case "feat":
            return snapshot.feats.some((feat) => (atom.uuid ? feat.sourceId === atom.uuid : feat.name === atom.name))
                ? { ok: true }
                : { ok: false, failure: phrase(atom) };
        case "feature":
            return snapshot.features.some((feature) =>
                atom.uuid ? feature.sourceId === atom.uuid : feature.name === atom.name,
            )
                ? { ok: true }
                : { ok: false, failure: phrase(atom) };
        case "tag":
            return snapshot.features.some((feature) => feature.otherTags.includes(atom.tag))
                ? { ok: true }
                : { ok: false, failure: phrase(atom) };
        case "sense":
            return snapshot.senses.includes(atom.sense) ? { ok: true } : { ok: false, failure: phrase(atom) };
        case "trait":
            return snapshot.traits.includes(atom.trait) ? { ok: true } : { ok: false, failure: phrase(atom) };
        case "speed": {
            const value = snapshot.speeds[atom.mode];
            const met = value !== undefined && (atom.feet === undefined || value >= atom.feet);
            return met ? { ok: true } : { ok: false, failure: phrase(atom) };
        }
        case "focus-pool":
            return snapshot.focusMax >= atom.min ? { ok: true } : { ok: false, failure: phrase(atom) };
        case "class":
            return snapshot.classSlug === atom.slug ? { ok: true } : { ok: false, failure: phrase(atom) };
        case "class-hp":
            return snapshot.classHp > 0 && snapshot.classHp <= atom.max
                ? { ok: true }
                : { ok: false, failure: phrase(atom) };
        case "spellcasting":
            return spellcastingMet(snapshot, atom) ? { ok: true } : { ok: false, failure: phrase(atom) };
        case "spell":
            return snapshot.spells.some((spell) => spellMet(spell, atom))
                ? { ok: true }
                : { ok: false, failure: phrase(atom) };
        case "spell-rank":
            return snapshot.spellcasting.some((entry) => entry.classFeature && entry.slotRank >= atom.min)
                ? { ok: true }
                : { ok: false, failure: phrase(atom) };
        case "deity":
            return deityMet(snapshot, atom) ? { ok: true } : { ok: false, failure: phrase(atom) };
        case "size":
            return sizeMet(snapshot, atom) ? { ok: true } : { ok: false, failure: phrase(atom) };
        case "hands":
            return snapshot.hands >= atom.min ? { ok: true } : { ok: false, failure: phrase(atom) };
        case "versatile":
            return snapshot.versatile ? { ok: true } : { ok: false, failure: phrase(atom) };
        case "selection":
            return snapshot.selections.some((selection) => selection.key === atom.key && selection.value === atom.value)
                ? { ok: true }
                : { ok: false, failure: phrase(atom) };
        case "tradition":
            return traditionMet(snapshot, atom) ? { ok: true } : { ok: false, failure: phrase(atom) };
        case "casting-skill":
            return castingSkillMet(snapshot, atom) ? { ok: true } : { ok: false, failure: phrase(atom) };
        case "kinetic":
            return snapshot.kineticElements.length >= atom.min &&
                (atom.max === undefined || snapshot.kineticElements.length <= atom.max)
                ? { ok: true }
                : { ok: false, failure: phrase(atom) };
        case "action":
            return snapshot.actions.includes(atom.name) ? { ok: true } : { ok: false, failure: phrase(atom) };
        case "language":
            return languageMet(snapshot, atom) ? { ok: true } : { ok: false, failure: phrase(atom) };
        case "not": {
            const inner = evaluateAtom(atom.atom, snapshot);
            return inner.ok ? { ok: false, failure: phrase(atom) } : { ok: true };
        }
        case "or": {
            const branchFailures: string[] = [];
            for (const branch of atom.any) {
                const failures: string[] = [];
                for (const inner of branch) {
                    const result = evaluateAtom(inner, snapshot);
                    if (!result.ok) failures.push(result.failure);
                }
                if (failures.length === 0) return { ok: true };
                branchFailures.push(failures.join("; "));
            }
            return { ok: false, failure: branchFailures.join(" or ") };
        }
        case "unparsed":
            return { ok: true };
    }
}

function atomIsChecked(atom: PrereqAtom): boolean {
    switch (atom.kind) {
        case "unparsed":
            return false;
        case "not":
            return atomIsChecked(atom.atom);
        case "or":
            return atom.any.every((branch) => branch.every(atomIsChecked));
        default:
            return true;
    }
}

function hardFailures(feat: IndexedFeat, snapshot: CharacterSnapshot, slot: SlotContext): string[] {
    const failures: string[] = [];
    if (feat.onlyLevel1 && slot.level !== 1) failures.push("1st level");

    const supported = SUPPORTED[slot.groupId];
    if (supported && !supported.includes(feat.category)) {
        failures.push(feat.category);
    } else if (slot.groupId === "archetype" && !feat.traits.includes("archetype")) {
        failures.push("archetype");
    }

    const limit = feat.maxTakable === null ? null : (feat.maxTakable ?? 1);
    if (limit !== null) {
        const taken = snapshot.feats.filter(
            (owned) => owned.slug === feat.slug && owned.category === feat.category,
        ).length;
        if (taken >= limit) failures.push("already taken");
    }

    failures.push(...newDedicationFailures(feat, snapshot, feat.families ?? EMPTY_FAMILIES));
    const ownClass = ownClassFailure(feat, snapshot);
    if (ownClass) failures.push(ownClass);
    const classArchetype = classArchetypeFailure(feat, snapshot);
    if (classArchetype) failures.push(classArchetype);
    return failures;
}

function evaluateEligibility(feat: IndexedFeat, snapshot: CharacterSnapshot, slot: SlotContext): EligibilityResult {
    const failures = hardFailures(feat, snapshot, slot);
    const unchecked: string[] = [];

    for (const clause of feat.clauses) {
        if (clause.length === 0) continue;
        if (!clause.every(atomIsChecked)) {
            const text = clause
                .filter((atom): atom is { kind: "unparsed"; text: string } => atom.kind === "unparsed")
                .map((atom) => atom.text)
                .join(", ");
            if (text.length > 0) unchecked.push(text);
            continue;
        }
        for (const atom of clause) {
            const result = evaluateAtom(atom, snapshot);
            if (!result.ok) failures.push(result.failure);
        }
    }

    if (failures.length > 0) return { status: "illegal", failures, sentence: null };
    if (unchecked.length > 0) return { status: "unchecked", failures: [], sentence: unchecked.join(", ") };
    return { status: "legal", failures: [], sentence: null };
}

export { evaluateEligibility, phrase };
