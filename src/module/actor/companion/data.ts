import { CharacterPF2e } from "@actor";
import type {
    Abilities,
    BaseCreatureSource,
    CreatureAttributes,
    CreatureDetails,
    CreatureMovementData,
    CreaturePerceptionData,
    CreatureResources,
    CreatureSaves,
    CreatureTraitsData,
    SkillData,
} from "@actor/creature/data.ts";
import type { ActorHitPoints } from "@actor/data/base.ts";
import { ActorSystemModel, ActorSystemSchema } from "@actor/data/model.ts";
import { ActorSizePF2e } from "@actor/data/size.ts";
import type { Modifier } from "@actor/modifiers.ts";
import type { Language } from "@actor/creature/types.ts";
import type {
    ActorAlliance,
    AttributeString,
    ImmunityType,
    ResistanceType,
    SaveType,
    WeaknessType,
} from "@actor/types.ts";
import type { ModelPropsFromSchema, SourceFromSchema } from "@common/data/fields.d.mts";
import type { NPCAttackAction } from "@actor/npc/data.ts";
import { LaxArrayField } from "@system/schema-data-fields.ts";
import { COMPANION_PROFILES, COMPANION_SIZES, COMPANION_SPEEDS, COMPANION_STAGES } from "./values.ts";
import { PROFILES } from "./profiles.ts";
import type { CompanionPF2e } from "./document.ts";
import fields = foundry.data.fields;

type CompanionSource = BaseCreatureSource<"companion", CompanionSystemSource>;

class CompanionSystemData extends ActorSystemModel<CompanionPF2e, CompanionSystemSchema> {
    declare traits: CreatureTraitsData;
    declare perception: CreaturePerceptionData;
    declare saves: CreatureSaves;
    declare skills: Record<string, SkillData>;
    declare resources: CreatureResources;
    declare movement: CreatureMovementData;
    declare abilities: Abilities;
    declare actions: NPCAttackAction[];

    static override defineSchema(): CompanionSystemSchema {
        const ability = (): fields.NumberField<number, number, true, false, true> =>
            new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 });
        const optionalInteger = (min?: number): fields.NumberField<number, number, true, true, true> =>
            new fields.NumberField({
                required: true,
                nullable: true,
                integer: true,
                initial: null,
                min,
            });
        const manualFlag = (): fields.BooleanField => new fields.BooleanField({ required: true, initial: false });
        const immunityTypes: Record<ImmunityType, string> = CONFIG.PF2E.immunityTypes;
        const weaknessTypes: Record<WeaknessType, string> = CONFIG.PF2E.weaknessTypes;
        const resistanceTypes: Record<ResistanceType, string> = CONFIG.PF2E.resistanceTypes;
        const iwrValue = (): fields.NumberField<number, number, true, false, true> =>
            new fields.NumberField({ required: true, nullable: false, integer: true, min: 1, initial: 1 });
        return {
            ...super.defineSchema(),
            master: new fields.SchemaField({
                id: new fields.ForeignDocumentField(CharacterPF2e, {
                    idOnly: true,
                    required: true,
                    nullable: true,
                    initial: null,
                }),
            }),
            profile: new fields.StringField({
                required: true,
                nullable: false,
                choices: COMPANION_PROFILES,
                initial: "animal",
            }),
            typeUuid: new fields.StringField({ required: true, nullable: false, blank: true, initial: "" }),
            stage: new fields.StringField({
                required: true,
                nullable: false,
                choices: COMPANION_STAGES,
                initial: "initial",
            }),
            advanced: new fields.StringField({
                required: true,
                nullable: false,
                blank: true,
                choices: ["", "agility", "power"],
                initial: "",
            }),
            specializations: new fields.ArrayField(
                new fields.StringField({ required: true, nullable: false, blank: false }),
            ),
            sizeChoice: new fields.StringField({
                required: true,
                nullable: false,
                blank: true,
                choices: ["", ...COMPANION_SIZES],
                initial: "",
            }),
            grow: new fields.SchemaField({
                mature: new fields.BooleanField({ required: true, initial: false }),
                power: new fields.BooleanField({ required: true, initial: false }),
            }),
            role: new fields.StringField({
                required: true,
                nullable: false,
                blank: true,
                choices: ["", "drone"],
                initial: "",
            }),
            active: new fields.BooleanField({ required: true, initial: true }),
            shutdown: new fields.BooleanField({ required: true, initial: false }),
            destroyed: new fields.BooleanField({ required: true, initial: false }),
            brokenAt: new fields.ArrayField(new fields.NumberField({ required: true, nullable: false })),
            racerSpeed: new fields.StringField({
                required: true,
                nullable: false,
                choices: COMPANION_SPEEDS,
                initial: "land",
            }),
            imitator: new fields.SchemaField({
                size: new fields.StringField({ required: true, blank: true, initial: "" }),
                speed: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0 }),
                attack: new fields.StringField({ required: true, blank: true, initial: "" }),
            }),
            details: new fields.SchemaField({
                level: new fields.SchemaField({
                    value: new fields.NumberField({
                        required: true,
                        nullable: false,
                        integer: true,
                        min: 0,
                        initial: 0,
                    }),
                }),
                languages: new fields.SchemaField({
                    value: new fields.ArrayField(
                        new fields.StringField<Language, Language, true, false, false>({
                            required: true,
                            blank: false,
                        }),
                        { initial: [] },
                    ),
                    details: new fields.StringField({ required: true, blank: true, initial: "" }),
                }),
            }),
            attributes: new fields.SchemaField({
                hp: new fields.SchemaField({
                    value: new fields.NumberField({
                        required: true,
                        nullable: false,
                        integer: true,
                        min: 0,
                        initial: 6,
                    }),
                    temp: new fields.NumberField({
                        required: true,
                        nullable: false,
                        integer: true,
                        min: 0,
                        initial: 0,
                    }),
                    tempSource: new fields.StringField({ required: false, blank: false, initial: undefined }),
                }),
                immunities: new LaxArrayField(
                    new fields.SchemaField({
                        type: new fields.StringField({
                            required: true,
                            nullable: false,
                            choices: immunityTypes,
                            initial: undefined,
                        }),
                        exceptions: new LaxArrayField(
                            new fields.StringField({
                                required: true,
                                nullable: false,
                                choices: immunityTypes,
                                initial: undefined,
                            }),
                        ),
                    }),
                ),
                weaknesses: new LaxArrayField(
                    new fields.SchemaField({
                        type: new fields.StringField({
                            required: true,
                            nullable: false,
                            choices: weaknessTypes,
                            initial: undefined,
                        }),
                        value: iwrValue(),
                        exceptions: new LaxArrayField(
                            new fields.StringField({
                                required: true,
                                nullable: false,
                                choices: weaknessTypes,
                                initial: undefined,
                            }),
                        ),
                    }),
                ),
                resistances: new LaxArrayField(
                    new fields.SchemaField({
                        type: new fields.StringField({
                            required: true,
                            nullable: false,
                            choices: resistanceTypes,
                            initial: undefined,
                        }),
                        value: iwrValue(),
                        exceptions: new LaxArrayField(
                            new fields.StringField({
                                required: true,
                                nullable: false,
                                choices: resistanceTypes,
                                initial: undefined,
                            }),
                        ),
                        doubleVs: new LaxArrayField(
                            new fields.StringField({
                                required: true,
                                nullable: false,
                                choices: resistanceTypes,
                                initial: undefined,
                            }),
                        ),
                    }),
                ),
            }),
            abilities: new fields.SchemaField({
                str: new fields.SchemaField({ mod: ability() }),
                dex: new fields.SchemaField({ mod: ability() }),
                con: new fields.SchemaField({ mod: ability() }),
                int: new fields.SchemaField({ mod: ability() }),
                wis: new fields.SchemaField({ mod: ability() }),
                cha: new fields.SchemaField({ mod: ability() }),
            }),
            /** Empty means the book value. A typed number, including 0, replaces it. */
            abilityOverrides: new fields.SchemaField({
                str: optionalInteger(),
                dex: optionalInteger(),
                con: optionalInteger(),
                int: optionalInteger(),
                wis: optionalInteger(),
                cha: optionalInteger(),
            }),
            /** Empty means the book slot total. A typed number, including 0, is the cap. */
            slotOverrides: new fields.SchemaField({
                commercial: optionalInteger(0),
                tactical: optionalInteger(0),
                advanced: optionalInteger(0),
                superior: optionalInteger(0),
            }),
            /** True once the sheet value was chosen by hand, so a later grant does not replace it. */
            manual: new fields.SchemaField({
                stage: manualFlag(),
                advanced: manualFlag(),
                specializations: manualFlag(),
                role: manualFlag(),
            }),
            initiativeStatistic: new fields.StringField({
                required: true,
                nullable: false,
                blank: false,
                initial: "perception",
            }),
            customModifiers: new fields.ObjectField<Record<string, Modifier[]>>(),
        };
    }

    /** Traits and level have to exist before creature preparation reads them. */
    override prepareBaseData(): void {
        super.prepareBaseData();
        const master = this.parent.master;
        const profile = PROFILES[this.profile] ?? PROFILES.animal;

        const storedLanguages = this.details.languages;
        this.details = {
            alliance: (master?.alliance ?? "party") as ActorAlliance,
            level: { value: master?.level ?? 0 },
            languages: {
                value: [...storedLanguages.value],
                details: storedLanguages.details,
            },
        };
        // Type traits and senses are applied once embedded items are indexed.
        this.traits = {
            value: [...profile.traits] as CreatureTraitsData["value"],
            rarity: "common",
            size: new ActorSizePF2e({ value: "sm" }),
        };

        const senses = [{ type: "low-light-vision", acuity: "precise" as const, range: Infinity, source: null }];

        type PartialSystemData = {
            perception: { attribute: AttributeString; senses: typeof senses };
            skills: Record<string, Partial<SkillData>>;
            saves: Record<SaveType, object>;
            details: { level: { value: number }; alliance: ActorAlliance };
        };
        const system = this as unknown as PartialSystemData;
        system.perception = { attribute: "wis", senses };
        system.skills = {};
        system.saves = { fortitude: {}, reflex: {}, will: {} };
        this.actions = [];
    }
}

interface CompanionSystemData
    extends
        foundry.abstract.TypeDataModel<CompanionPF2e, CompanionSystemSchema>,
        ModelPropsFromSchema<CompanionSystemSchema> {
    abilities: Abilities;
    attributes: CreatureAttributes;
    details: CreatureDetails;
}

type CompanionAttributesSchema = {
    hp: fields.SchemaField<
        {
            value: fields.NumberField<number, number, true, false, true>;
            temp: fields.NumberField<number, number, true, false, true>;
            tempSource: fields.StringField<string, string, false, false, false>;
        },
        SourceFromSchema<{
            value: fields.NumberField<number, number, true, false, true>;
            temp: fields.NumberField<number, number, true, false, true>;
            tempSource: fields.StringField<string, string, false, false, false>;
        }>,
        ActorHitPoints
    >;
    immunities: fields.ArrayField<
        fields.SchemaField<{
            type: fields.StringField<ImmunityType, ImmunityType, true, false, false>;
            exceptions: fields.ArrayField<fields.StringField<ImmunityType, ImmunityType, true, false, false>>;
        }>
    >;
    weaknesses: fields.ArrayField<
        fields.SchemaField<{
            type: fields.StringField<WeaknessType, WeaknessType, true, false, false>;
            value: fields.NumberField<number, number, true, false, true>;
            exceptions: fields.ArrayField<fields.StringField<WeaknessType, WeaknessType, true, false, false>>;
        }>
    >;
    resistances: fields.ArrayField<
        fields.SchemaField<{
            type: fields.StringField<ResistanceType, ResistanceType, true, false, false>;
            value: fields.NumberField<number, number, true, false, true>;
            exceptions: fields.ArrayField<fields.StringField<ResistanceType, ResistanceType, true, false, false>>;
            doubleVs: fields.ArrayField<fields.StringField<ResistanceType, ResistanceType, true, false, false>>;
        }>
    >;
};

type CompanionSystemSchema = ActorSystemSchema & {
    master: fields.SchemaField<{
        id: fields.ForeignDocumentField<string, true, true, true>;
    }>;
    profile: fields.StringField<"animal" | "robot", "animal" | "robot", true, false, true>;
    typeUuid: fields.StringField<string, string, true, false, true>;
    stage: fields.StringField<
        "initial" | "mature" | "agility" | "power" | "specialized",
        "initial" | "mature" | "agility" | "power" | "specialized",
        true,
        false,
        true
    >;
    advanced: fields.StringField<"" | "agility" | "power", "" | "agility" | "power", true, false, true>;
    specializations: fields.ArrayField<fields.StringField<string, string, true, false, false>>;
    sizeChoice: fields.StringField<string, string, true, false, true>;
    grow: fields.SchemaField<{
        mature: fields.BooleanField;
        power: fields.BooleanField;
    }>;
    role: fields.StringField<"" | "drone", "" | "drone", true, false, true>;
    active: fields.BooleanField;
    shutdown: fields.BooleanField;
    destroyed: fields.BooleanField;
    brokenAt: fields.ArrayField<fields.NumberField<number, number, true, false, false>>;
    racerSpeed: fields.StringField<
        "land" | "burrow" | "climb" | "fly" | "swim",
        "land" | "burrow" | "climb" | "fly" | "swim",
        true,
        false,
        true
    >;
    imitator: fields.SchemaField<{
        size: fields.StringField<string, string, true, false, true>;
        speed: fields.NumberField<number, number, true, false, true>;
        attack: fields.StringField<string, string, true, false, true>;
    }>;
    details: fields.SchemaField<{
        level: fields.SchemaField<{
            value: fields.NumberField<number, number, true, false, true>;
        }>;
        languages: fields.SchemaField<{
            value: fields.ArrayField<fields.StringField<Language, Language, true, false, false>>;
            details: fields.StringField<string, string, true, false, true>;
        }>;
    }>;
    attributes: fields.SchemaField<
        CompanionAttributesSchema,
        SourceFromSchema<CompanionAttributesSchema>,
        CreatureAttributes
    >;
    abilities: fields.SchemaField<{
        str: fields.SchemaField<{ mod: fields.NumberField<number, number, true, false, true> }>;
        dex: fields.SchemaField<{ mod: fields.NumberField<number, number, true, false, true> }>;
        con: fields.SchemaField<{ mod: fields.NumberField<number, number, true, false, true> }>;
        int: fields.SchemaField<{ mod: fields.NumberField<number, number, true, false, true> }>;
        wis: fields.SchemaField<{ mod: fields.NumberField<number, number, true, false, true> }>;
        cha: fields.SchemaField<{ mod: fields.NumberField<number, number, true, false, true> }>;
    }>;
    abilityOverrides: fields.SchemaField<{
        str: fields.NumberField<number, number, true, true, true>;
        dex: fields.NumberField<number, number, true, true, true>;
        con: fields.NumberField<number, number, true, true, true>;
        int: fields.NumberField<number, number, true, true, true>;
        wis: fields.NumberField<number, number, true, true, true>;
        cha: fields.NumberField<number, number, true, true, true>;
    }>;
    slotOverrides: fields.SchemaField<{
        commercial: fields.NumberField<number, number, true, true, true>;
        tactical: fields.NumberField<number, number, true, true, true>;
        advanced: fields.NumberField<number, number, true, true, true>;
        superior: fields.NumberField<number, number, true, true, true>;
    }>;
    manual: fields.SchemaField<{
        stage: fields.BooleanField;
        advanced: fields.BooleanField;
        specializations: fields.BooleanField;
        role: fields.BooleanField;
    }>;
    initiativeStatistic: fields.StringField<string, string, true, false, true>;
    customModifiers: fields.ObjectField<Record<string, Modifier[]>>;
};

/** Prepared fields stay off the source so the actor-source union still has the keys other actors declare. */
interface CompanionSystemSource extends SourceFromSchema<CompanionSystemSchema> {
    perception?: never;
    resources?: never;
    saves?: never;
    skills?: never;
    traits?: never;
    /** Legacy location of `MigrationRecord` */
    schema?: object;
}

export { CompanionSystemData };
export type { CompanionSource, CompanionSystemSource };
