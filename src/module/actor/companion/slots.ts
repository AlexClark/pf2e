import { STAGE_RANK, type CompanionProfile, type CompanionStage, type CustomizationGrade } from "./values.ts";

/**
 * The stage itself grants one slot of the matching grade.
 * A drone adds two commercial slots on top of the one every robot starts with.
 * Feat extras are added by the caller. Animals have no customization slots.
 */
function customizationSlots(
    profile: CompanionProfile,
    stage: CompanionStage,
    role: "" | "drone",
    extra: Record<CustomizationGrade, number>,
): Record<CustomizationGrade, number> {
    if (profile !== "robot") {
        return { commercial: 0, tactical: 0, advanced: 0, superior: 0 };
    }
    const height = STAGE_RANK[stage];
    const advanced = stage === "agility" || stage === "power" || stage === "specialized";
    return {
        commercial: 1 + (role === "drone" ? 2 : 0) + (extra.commercial ?? 0),
        tactical: (height >= STAGE_RANK.mature ? 1 : 0) + (extra.tactical ?? 0),
        advanced: (advanced ? 1 : 0) + (extra.advanced ?? 0),
        superior: (stage === "specialized" ? 1 : 0) + (extra.superior ?? 0),
    };
}

export { customizationSlots };
