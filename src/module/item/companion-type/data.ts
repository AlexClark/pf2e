import { ItemSystemModel, ItemSystemSchema } from "@item/base/data/model.ts";
import type { BaseItemSourcePF2e, ItemSystemSource, OtherTagsOnly } from "@item/base/data/system.ts";
import type { SenseAcuity } from "@actor/creature/types.ts";
import type { Rarity } from "@module/data.ts";
import { SlugField } from "@system/schema-data-fields.ts";
import { COMPANION_PROFILES, COMPANION_SIZES } from "@actor/companion/values.ts";
import type { CompanionTypePF2e } from "./document.ts";
import fields = foundry.data.fields;

type CompanionTypeSource = BaseItemSourcePF2e<"companionType", CompanionTypeSystemSource>;

class CompanionTypeSystemData extends ItemSystemModel<CompanionTypePF2e, CompanionTypeSystemSchema> {
    static override defineSchema(): CompanionTypeSystemSchema {
        const ability = (): fields.NumberField<number, number, true, false, true> =>
            new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 });
        const speed = (): fields.NumberField<number, number, true, false, true> =>
            new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 });
        return {
            ...super.defineSchema(),
            profile: new fields.StringField({
                required: true,
                nullable: false,
                choices: COMPANION_PROFILES,
                initial: "animal",
            }),
            kind: new fields.StringField({
                required: true,
                nullable: false,
                choices: ["type", "specialization"],
                initial: "type",
            }),
            sizes: new fields.ArrayField(
                new fields.StringField({ required: true, nullable: false, choices: COMPANION_SIZES }),
            ),
            abilities: new fields.SchemaField({
                str: ability(),
                dex: ability(),
                con: ability(),
                int: ability(),
                wis: ability(),
                cha: ability(),
            }),
            ancestryHp: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 6 }),
            attacks: new fields.ArrayField(
                new fields.SchemaField({
                    slug: new SlugField({ required: true, nullable: false }),
                    name: new fields.StringField({ required: true, nullable: false, blank: false }),
                    damage: new fields.SchemaField({
                        dice: new fields.NumberField({
                            required: true,
                            nullable: false,
                            integer: true,
                            min: 0,
                            initial: 1,
                        }),
                        die: new fields.StringField({ required: true, nullable: false, initial: "d6" }),
                        type: new fields.StringField({ required: true, nullable: false, initial: "bludgeoning" }),
                    }),
                    traits: new fields.ArrayField(
                        new fields.StringField({ required: true, nullable: false, blank: false }),
                    ),
                    range: new fields.NumberField({
                        required: true,
                        nullable: true,
                        integer: true,
                        min: 0,
                        initial: null,
                    }),
                }),
            ),
            skills: new fields.ArrayField(new SlugField({ required: true, nullable: false })),
            senses: new fields.ArrayField(
                new fields.SchemaField({
                    type: new fields.StringField({ required: true, nullable: false, blank: false }),
                    acuity: new fields.StringField({
                        required: true,
                        nullable: false,
                        choices: ["precise", "imprecise", "vague"],
                        initial: "precise",
                    }),
                    range: new fields.NumberField({ required: true, nullable: false, min: 0, initial: 0 }),
                }),
            ),
            speeds: new fields.SchemaField({
                land: speed(),
                burrow: speed(),
                climb: speed(),
                fly: speed(),
                swim: speed(),
            }),
            creatureTraits: new fields.ArrayField(new SlugField({ required: true, nullable: false })),
            replacesCreatureTrait: new fields.StringField({
                required: true,
                nullable: true,
                blank: false,
                initial: null,
            }),
            support: new fields.HTMLField({ required: true, nullable: false, initial: "" }),
            advancedManeuver: new fields.StringField({ required: true, nullable: false, blank: true, initial: "" }),
            resistances: new fields.ArrayField(
                new fields.SchemaField({
                    type: new fields.StringField({ required: true, nullable: false, blank: false }),
                    formula: new fields.StringField({ required: true, nullable: false, initial: "0" }),
                }),
            ),
            imitator: new fields.BooleanField({ required: true, initial: false }),
            mount: new fields.BooleanField({ required: true, initial: false }),
            rarity: new fields.StringField({
                required: true,
                nullable: false,
                choices: ["common", "uncommon", "rare", "unique"],
                initial: "common",
            }),
        };
    }
}

interface CompanionTypeSystemData
    extends
        ItemSystemModel<CompanionTypePF2e, CompanionTypeSystemSchema>,
        Omit<fields.ModelPropsFromSchema<CompanionTypeSystemSchema>, "description"> {
    traits: OtherTagsOnly;
}

type CompanionTypeSystemSchema = ItemSystemSchema & {
    profile: fields.StringField<"animal" | "robot", "animal" | "robot", true, false, true>;
    kind: fields.StringField<"type" | "specialization", "type" | "specialization", true, false, true>;
    sizes: fields.ArrayField<
        fields.StringField<(typeof COMPANION_SIZES)[number], (typeof COMPANION_SIZES)[number], true, false, false>
    >;
    abilities: fields.SchemaField<{
        str: fields.NumberField<number, number, true, false, true>;
        dex: fields.NumberField<number, number, true, false, true>;
        con: fields.NumberField<number, number, true, false, true>;
        int: fields.NumberField<number, number, true, false, true>;
        wis: fields.NumberField<number, number, true, false, true>;
        cha: fields.NumberField<number, number, true, false, true>;
    }>;
    ancestryHp: fields.NumberField<number, number, true, false, true>;
    attacks: fields.ArrayField<
        fields.SchemaField<{
            slug: SlugField<true, false, false>;
            name: fields.StringField<string, string, true, false, false>;
            damage: fields.SchemaField<{
                dice: fields.NumberField<number, number, true, false, true>;
                die: fields.StringField<string, string, true, false, true>;
                type: fields.StringField<string, string, true, false, true>;
            }>;
            traits: fields.ArrayField<fields.StringField<string, string, true, false, false>>;
            range: fields.NumberField<number, number, true, true, true>;
        }>
    >;
    skills: fields.ArrayField<SlugField<true, false, false>>;
    senses: fields.ArrayField<
        fields.SchemaField<{
            type: fields.StringField<string, string, true, false, false>;
            acuity: fields.StringField<SenseAcuity, SenseAcuity, true, false, true>;
            range: fields.NumberField<number, number, true, false, true>;
        }>
    >;
    speeds: fields.SchemaField<{
        land: fields.NumberField<number, number, true, false, true>;
        burrow: fields.NumberField<number, number, true, false, true>;
        climb: fields.NumberField<number, number, true, false, true>;
        fly: fields.NumberField<number, number, true, false, true>;
        swim: fields.NumberField<number, number, true, false, true>;
    }>;
    creatureTraits: fields.ArrayField<SlugField<true, false, false>>;
    replacesCreatureTrait: fields.StringField<string, string, true, true, true>;
    support: fields.HTMLField<string, string, true, false, true>;
    advancedManeuver: fields.StringField<string, string, true, false, true>;
    resistances: fields.ArrayField<
        fields.SchemaField<{
            type: fields.StringField<string, string, true, false, false>;
            formula: fields.StringField<string, string, true, false, true>;
        }>
    >;
    imitator: fields.BooleanField;
    mount: fields.BooleanField;
    rarity: fields.StringField<Rarity, Rarity, true, false, true>;
};

type CompanionTypeSystemSource = ItemSystemSource &
    fields.SourceFromSchema<CompanionTypeSystemSchema> & {
        traits: OtherTagsOnly;
    };

export { CompanionTypeSystemData };
export type { CompanionTypeSource };
