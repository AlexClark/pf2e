import type { ActorPF2e } from "@actor";
import { ItemPF2e } from "@item";
import type { CompanionTypeSource, CompanionTypeSystemData } from "./data.ts";

class CompanionTypePF2e<TParent extends ActorPF2e | null = ActorPF2e | null> extends ItemPF2e<TParent> {}

interface CompanionTypePF2e<TParent extends ActorPF2e | null = ActorPF2e | null> extends ItemPF2e<TParent> {
    readonly _source: CompanionTypeSource;
    system: CompanionTypeSystemData;
}

export { CompanionTypePF2e };
