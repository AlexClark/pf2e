import type { AdvancedTrack, CompanionProfile, CompanionStage, StoredTrack } from "./values.ts";

interface ProfileRules {
    /** Creature traits before the type's own traits. `replacesCreatureTrait` drops the first of these. */
    traits: string[];
    sizeGrowth: "required" | "optional";
    /** Item bonus to AC cannot exceed this. */
    acItemBonusCap: number;
    hpPerLevel: number;
    companionDc: "own" | "master-class";
    incapacitation: "dying" | "broken";
}

const PROFILES: Record<CompanionProfile, ProfileRules> = {
    animal: {
        traits: ["animal", "minion"],
        sizeGrowth: "required",
        acItemBonusCap: 3,
        hpPerLevel: 6,
        companionDc: "own",
        incapacitation: "dying",
    },
    robot: {
        traits: ["construct", "robot", "tech", "minion"],
        sizeGrowth: "optional",
        acItemBonusCap: 3,
        hpPerLevel: 6,
        companionDc: "master-class",
        incapacitation: "broken",
    },
};

function stageLabel(profile: CompanionProfile, stage: CompanionStage, advanced: StoredTrack, systemId: string): string {
    if (profile === "robot") {
        switch (stage) {
            case "initial":
                return "Commercial";
            case "mature":
                return "Tactical";
            case "agility":
                return "Advanced (Deft)";
            case "power":
                return "Advanced (Burly)";
            case "specialized":
                return advanced === "power" ? "Superior (Burly)" : "Superior (Deft)";
        }
    }
    const deft = systemId === "sf2e";
    switch (stage) {
        case "initial":
            return "Young";
        case "mature":
            return "Mature";
        case "agility":
            return deft ? "Deft" : "Nimble";
        case "power":
            return deft ? "Burly" : "Savage";
        case "specialized":
            return "Specialized";
    }
}

function trackLabel(track: AdvancedTrack, systemId: string): string {
    const deft = systemId === "sf2e";
    return track === "power" ? (deft ? "Burly" : "Savage") : deft ? "Deft" : "Nimble";
}

export { PROFILES, stageLabel, trackLabel };
export type { ProfileRules };
