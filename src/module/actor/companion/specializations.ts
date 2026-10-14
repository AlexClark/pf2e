import type { AbilityMods, SaveRanks } from "./values.ts";

const SPECIALIZATION_SLUGS = ["ambusher", "bully", "daredevil", "racer", "tracker", "wrecker"] as const;

type SpecializationSlug = (typeof SPECIALIZATION_SLUGS)[number];

interface SpecializationState {
    abilities: AbilityMods;
    skills: Record<string, number>;
    unarmored: number;
    saves: SaveRanks;
}

/** Expert, or master when the rank is already expert or higher. */
function upgradeRank(rank: number): number {
    return rank >= 2 ? Math.max(rank, 3) : 2;
}

function floorRank(rank: number, min: number): number {
    return Math.max(rank, min);
}

/**
 * Ability and rank changes from one specialization.
 * Daredevil and wrecker name master outright. Racer names legendary Fortitude.
 * The others use the upgrade pattern.
 */
function applySpecialization(slug: string, state: SpecializationState): void {
    const { abilities, skills, saves } = state;
    switch (slug) {
        case "ambusher":
            abilities.dex += 1;
            skills.stealth = upgradeRank(skills.stealth ?? 0);
            state.unarmored = floorRank(state.unarmored, 2);
            break;
        case "bully":
            abilities.str += 1;
            abilities.cha += 3;
            skills.athletics = upgradeRank(skills.athletics ?? 0);
            skills.intimidation = upgradeRank(skills.intimidation ?? 0);
            break;
        case "daredevil":
            abilities.dex += 1;
            skills.acrobatics = floorRank(skills.acrobatics ?? 0, 3);
            state.unarmored = floorRank(state.unarmored, 2);
            break;
        case "racer":
            abilities.con += 1;
            saves.fortitude = floorRank(saves.fortitude, 4);
            break;
        case "tracker":
            abilities.wis += 1;
            skills.survival = upgradeRank(skills.survival ?? 0);
            break;
        case "wrecker":
            abilities.str += 1;
            skills.athletics = floorRank(skills.athletics ?? 0, 3);
            break;
        default:
            break;
    }
}

function isSpecializationSlug(slug: string): slug is SpecializationSlug {
    return (SPECIALIZATION_SLUGS as readonly string[]).includes(slug);
}

export { SPECIALIZATION_SLUGS, applySpecialization, isSpecializationSlug, upgradeRank };
export type { SpecializationSlug, SpecializationState };
