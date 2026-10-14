import type { CompanionGrantData } from "@actor/companion/grants.ts";
import { STAGE_RANK, type CompanionStage, type CustomizationGrade } from "@actor/companion/values.ts";
import type { ActorType } from "@actor/types.ts";
import { RuleElement } from "./base.ts";
import { ModelPropsFromRESchema, RuleElementSchema } from "./data.ts";
import fields = foundry.data.fields;

const GRADES = ["commercial", "tactical", "advanced", "superior"] as const;

/**
 * A feat that advances the owner's companion. The companion reads these during its own prepare.
 * If the feat's prerequisite is not met, the grant does not apply.
 * @category RuleElement
 */
class CompanionGrantRuleElement extends RuleElement<CompanionGrantSchema> {
    static override validActorTypes: ActorType[] = ["character"];

    static override defineSchema(): CompanionGrantSchema {
        return {
            ...super.defineSchema(),
            profile: new fields.StringField({
                required: true,
                nullable: false,
                blank: true,
                choices: ["", "animal", "robot"],
                initial: "",
            }),
            stage: new fields.StringField({ required: false, nullable: true, blank: true, initial: null }),
            specialization: new fields.StringField({ required: false, nullable: true, blank: true, initial: null }),
            independent: new fields.BooleanField({ required: true, initial: false }),
            role: new fields.StringField({
                required: true,
                nullable: false,
                blank: true,
                choices: ["", "drone"],
                initial: "",
            }),
            extraSlots: new fields.ArrayField(
                new fields.SchemaField({
                    grade: new fields.StringField({ required: true, nullable: false, choices: GRADES }),
                    count: new fields.NumberField({
                        required: true,
                        nullable: false,
                        integer: true,
                        min: 1,
                        initial: 1,
                    }),
                    once: new fields.BooleanField({ required: false, initial: false }),
                }),
                { required: true, initial: [] },
            ),
        };
    }

    override beforePrepareData(): void {
        if (this.ignored || !this.actor.isOfType("character") || !this.#prerequisitesMet()) return;

        const stage = this.#resolveStage();
        const specialization = this.#resolveText(this.specialization);
        const grant: CompanionGrantData = {
            profile: this.profile,
            independent: this.independent,
            role: this.role === "drone" ? "drone" : "",
            extraSlots: this.extraSlots.flatMap((slot) => {
                if (!GRADES.includes(slot.grade)) return [];
                return [{ grade: slot.grade, count: slot.count, once: slot.once || undefined }];
            }),
        };
        if (stage) grant.stage = stage;
        if (specialization) grant.specialization = specialization;
        this.actor.synthetics.companionGrants.push(grant);
    }

    /** ChoiceSet runs first. An unresolved or invalid stage is ignored, and the sheet value stands. */
    #resolveStage(): CompanionStage | undefined {
        const raw = this.stage;
        if (!raw) return undefined;
        const resolved = this.resolveInjectedProperties(raw).trim();
        if (!resolved || resolved.includes("{") || !(resolved in STAGE_RANK)) return undefined;
        return resolved as CompanionStage;
    }

    #resolveText(value: string | null): string {
        if (!value) return "";
        const resolved = this.resolveInjectedProperties(value).trim();
        return resolved.includes("{") ? "" : resolved;
    }

    /**
     * Every prerequisite string has to match some other owned item.
     * The granting item is excluded, so Mature Animal Companion does not satisfy its own "Animal Companion" line.
     * A short name such as "Drone" still satisfies "drone exocortex".
     */
    #prerequisitesMet(): boolean {
        const system = this.item.system as { prerequisites?: { value?: { value?: string }[] } };
        const prereqs = (system.prerequisites?.value ?? [])
            .map((entry) => entry.value?.trim().toLowerCase() ?? "")
            .filter((entry) => entry.length > 0);
        if (prereqs.length === 0) return true;

        return prereqs.every((prereq) =>
            this.actor.items.some((item) => {
                if (item === this.item) return false;
                const name = item.name.toLowerCase();
                if (name.includes(prereq)) return true;
                if (name.length >= 5 && prereq.includes(name)) return true;
                const tags = (item.system.traits as { otherTags?: string[] } | undefined)?.otherTags ?? [];
                return prereq.includes("drone") && prereq.includes("exocortex") && tags.includes("mechanic-exocortex");
            }),
        );
    }
}

interface CompanionGrantRuleElement
    extends RuleElement<CompanionGrantSchema>, ModelPropsFromRESchema<CompanionGrantSchema> {}

type CompanionGrantSchema = RuleElementSchema & {
    profile: fields.StringField<"" | "animal" | "robot", "" | "animal" | "robot", true, false, true>;
    stage: fields.StringField<string, string, false, true, true>;
    specialization: fields.StringField<string, string, false, true, true>;
    independent: fields.BooleanField;
    role: fields.StringField<"" | "drone", "" | "drone", true, false, true>;
    extraSlots: fields.ArrayField<
        fields.SchemaField<{
            grade: fields.StringField<CustomizationGrade, CustomizationGrade, true, false, false>;
            count: fields.NumberField<number, number, true, false, true>;
            once: fields.BooleanField<boolean, boolean, false, false, true>;
        }>
    >;
};

export { CompanionGrantRuleElement };
