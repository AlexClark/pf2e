import type { CharacterSnapshot, IndexedFeat, PrereqAtom } from "./types.ts";

interface FamilyFeat {
    name: string;
    traits: readonly string[];
    clauses: readonly (readonly PrereqAtom[])[];
}

function collectFeatNames(atoms: readonly PrereqAtom[], insideNot: boolean, into: Set<string>): void {
    for (const atom of atoms) {
        if (atom.kind === "feat") {
            if (!insideNot) into.add(atom.name);
        } else if (atom.kind === "not") {
            collectFeatNames([atom.atom], true, into);
        } else if (atom.kind === "or") {
            for (const branch of atom.any) collectFeatNames(branch, insideNot, into);
        }
    }
}

/** Dedication name to every feat name in that family, including the dedication. */
function dedicationFamilies(feats: readonly FamilyFeat[]): Map<string, Set<string>> {
    const families = new Map<string, Set<string>>();
    for (const feat of feats) {
        if (feat.traits.includes("dedication")) families.set(feat.name, new Set([feat.name]));
    }

    let grew = true;
    while (grew) {
        grew = false;
        for (const feat of feats) {
            const names = new Set<string>();
            for (const clause of feat.clauses) collectFeatNames(clause, false, names);
            for (const [dedication, members] of families) {
                if (members.has(feat.name)) continue;
                for (const name of names) {
                    if (name !== dedication && !members.has(name)) continue;
                    members.add(feat.name);
                    grew = true;
                    break;
                }
            }
        }
    }

    return families;
}

function hasClassArchetype(snapshot: CharacterSnapshot): boolean {
    if (snapshot.grantedClassArchetypeDedicationIds.length > 0) return true;
    const full = new Set(snapshot.classArchetypeDedicationIds);
    return snapshot.feats.some((feat) => feat.sourceId !== null && full.has(feat.sourceId));
}

/** `one class archetype`, or null when this dedication is still allowed. */
function classArchetypeFailure(feat: IndexedFeat, snapshot: CharacterSnapshot): string | null {
    if (!snapshot.classArchetypeDedicationIds.includes(feat.id)) return null;
    if (!hasClassArchetype(snapshot)) return null;
    if (snapshot.grantedClassArchetypeDedicationIds.includes(feat.id)) return null;
    return "one class archetype";
}

function takenDedications(snapshot: CharacterSnapshot, families: ReadonlyMap<string, ReadonlySet<string>>): string[] {
    const names = new Set(snapshot.feats.map((feat) => feat.name));
    return [...families.keys()].filter((name) => names.has(name));
}

/** One phrase per taken dedication that still has fewer than two other family feats. */
function newDedicationFailures(
    feat: IndexedFeat,
    snapshot: CharacterSnapshot,
    families: ReadonlyMap<string, ReadonlySet<string>>,
): string[] {
    if (!feat.traits.includes("dedication")) return [];
    const failures: string[] = [];
    for (const name of takenDedications(snapshot, families)) {
        const members = families.get(name);
        if (!members) continue;
        const others = snapshot.feats.filter((taken) => taken.name !== name && members.has(taken.name)).length;
        if (others < 2) failures.push(`two other feats from ${name}`);
    }
    return failures;
}

function ownClassFailure(feat: IndexedFeat, snapshot: CharacterSnapshot): string | null {
    if (!feat.traits.includes("dedication") || !snapshot.className) return null;
    if (!feat.name.endsWith(" Dedication")) return null;
    const className = feat.name.slice(0, -" Dedication".length);
    if (className.toLowerCase() !== snapshot.className.toLowerCase()) return null;
    return "your class";
}

/**
 * GrantItem uuids on one class feature. A uuid containing `{` is a template and is dropped.
 * `isDedication` is the already-loaded feat index. Predicates on the rule are ignored.
 */
function dedicationUuidsFromRules(rules: readonly unknown[], isDedication: (uuid: string) => boolean): string[] {
    const kept: string[] = [];
    for (const rule of rules) {
        if (typeof rule !== "object" || rule === null) continue;
        if (!("key" in rule) || rule.key !== "GrantItem") continue;
        if (!("uuid" in rule) || typeof rule.uuid !== "string") continue;
        if (rule.uuid.includes("{")) continue;
        if (!isDedication(rule.uuid)) continue;
        kept.push(rule.uuid);
    }
    return kept;
}

export {
    classArchetypeFailure,
    dedicationFamilies,
    dedicationUuidsFromRules,
    newDedicationFailures,
    ownClassFailure,
};
