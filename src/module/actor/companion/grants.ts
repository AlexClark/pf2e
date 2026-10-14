import {
    STAGE_RANK,
    type AdvancedTrack,
    type CompanionProfile,
    type CompanionStage,
    type CustomizationGrade,
    type StoredTrack,
} from "./values.ts";

interface CompanionExtraSlot {
    grade: CustomizationGrade;
    count: number;
    /** Only the first copy of this slot contributes. Superior Drone's extra superior slot. */
    once?: boolean;
}

interface CompanionGrantData {
    profile: CompanionProfile | "";
    /** Omitted when the feat does not change the stage. */
    stage?: CompanionStage;
    specialization?: string;
    independent?: boolean;
    role?: "" | "drone";
    extraSlots?: CompanionExtraSlot[];
}

interface ResolvedCompanionGrants {
    /** Null when no grant writes a stage. The sheet value stands. */
    stage: CompanionStage | null;
    advanced: StoredTrack;
    specializations: string[];
    independent: boolean;
    role: "" | "drone";
    extraSlots: Record<CustomizationGrade, number>;
}

function emptySlots(): Record<CustomizationGrade, number> {
    return { commercial: 0, tactical: 0, advanced: 0, superior: 0 };
}

function isStage(value: string): value is CompanionStage {
    return value in STAGE_RANK;
}

/**
 * Highest stage any grant actually sets wins. A grant with no stage leaves the stage alone.
 * Specializations append. Once-slots count a single time. Independent is OR.
 * Agility and power are the same height: keep the sheet's track when it is one of them, otherwise the last grant.
 */
function resolveCompanionGrants(
    grants: CompanionGrantData[],
    profile: CompanionProfile,
    sheetAdvanced: StoredTrack,
): ResolvedCompanionGrants {
    const matched = grants.filter((grant) => grant.profile === "" || grant.profile === profile);
    const setters = matched.filter(
        (grant): grant is CompanionGrantData & { stage: CompanionStage } => !!grant.stage && isStage(grant.stage),
    );

    let winner: (CompanionGrantData & { stage: CompanionStage }) | null = null;
    for (const grant of setters) {
        if (!winner) {
            winner = grant;
            continue;
        }
        const next = STAGE_RANK[grant.stage];
        const current = STAGE_RANK[winner.stage];
        if (next > current) {
            winner = grant;
        } else if (next === current && grant.stage !== winner.stage) {
            if (sheetAdvanced && grant.stage === sheetAdvanced) winner = grant;
            else if (!sheetAdvanced) winner = grant;
        }
    }

    const specializations: string[] = [];
    for (const grant of matched) {
        const slug = grant.specialization;
        if (slug && !specializations.includes(slug)) specializations.push(slug);
    }

    const extraSlots = emptySlots();
    const onceSeen = new Set<CustomizationGrade>();
    for (const grant of matched) {
        for (const slot of grant.extraSlots ?? []) {
            // The drone role already adds the two commercial slots. A grant that sets both would count them twice.
            if (grant.role === "drone" && slot.grade === "commercial") continue;
            if (slot.once) {
                if (onceSeen.has(slot.grade)) continue;
                onceSeen.add(slot.grade);
            }
            extraSlots[slot.grade] += slot.count;
        }
    }

    let advanced: StoredTrack = "";
    if (winner?.stage === "agility" || winner?.stage === "power") {
        advanced = winner.stage;
    } else if (winner?.stage === "specialized") {
        const tracks = setters
            .map((grant) => grant.stage)
            .filter((stage): stage is AdvancedTrack => stage === "agility" || stage === "power");
        if (sheetAdvanced === "agility" || sheetAdvanced === "power") advanced = sheetAdvanced;
        else advanced = tracks.at(-1) ?? "";
    }

    return {
        stage: winner?.stage ?? null,
        advanced,
        specializations,
        independent: matched.some((grant) => grant.independent === true),
        role: matched.some((grant) => grant.role === "drone") ? "drone" : "",
        extraSlots,
    };
}

export { resolveCompanionGrants };
export type { CompanionExtraSlot, CompanionGrantData, ResolvedCompanionGrants };
