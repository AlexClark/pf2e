import type { CharacterPF2e } from "@actor/character/document.ts";
import type { SpellPF2e } from "@item";
import { sluggify } from "@util";
import type {
    Attack,
    CharacterSnapshot,
    Defense,
    KnownSpell,
    Save,
    SpeedMode,
    SpellcastingFact,
    Tradition,
} from "./types.ts";

const TRADITIONS = new Set<Tradition>(["arcane", "divine", "occult", "primal"]);

function asTradition(value: unknown): Tradition | null {
    return typeof value === "string" && TRADITIONS.has(value as Tradition) ? (value as Tradition) : null;
}

function slotRank(slots: Record<string, { max?: number }> | undefined): number {
    if (!slots) return 0;
    let best = 0;
    for (let rank = 1; rank <= 10; rank += 1) {
        const max = slots[`slot${rank}`]?.max ?? 0;
        if (max > 0) best = rank;
    }
    return best;
}

function spellcastingFacts(actor: CharacterPF2e): SpellcastingFact[] {
    const facts: SpellcastingFact[] = [];
    for (const entry of actor.spellcasting?.regular ?? []) {
        const category = entry.system?.prepared?.value;
        const prepared = category === "prepared";
        const spontaneous = category === "spontaneous";
        const innate = category === "innate";
        const focus = category === "focus";
        if (!prepared && !spontaneous && !innate && !focus) continue;
        facts.push({
            classFeature: prepared || spontaneous,
            prepared,
            spontaneous,
            innate,
            focus,
            tradition: asTradition(entry.tradition),
            slotRank: slotRank(entry.system?.slots),
        });
    }
    return facts;
}

function knownSpell(spell: SpellPF2e): KnownSpell {
    const category = spell.spellcasting?.system?.prepared?.value;
    const traits = spell.system.traits.value;
    const focus = category === "focus" || traits.includes("focus");
    const innate = !focus && category === "innate";
    const traditions = spell.system.traits.traditions;
    return {
        slug: spell.slug || sluggify(spell.name),
        source: focus ? "focus" : innate ? "innate" : "spell",
        tradition: asTradition(spell.spellcasting?.tradition) ?? traditions[0] ?? null,
        traits: [...traits],
        prepared: category === "prepared",
        spontaneous: category === "spontaneous",
    };
}

function stringSelections(actor: CharacterPF2e): { key: string; value: string }[] {
    const selections: { key: string; value: string }[] = [];
    for (const item of actor.items) {
        const rulesSelections = item.flags[SYSTEM_ID]?.rulesSelections;
        if (!rulesSelections) continue;
        for (const [key, value] of Object.entries(rulesSelections)) {
            if (typeof value === "string" && value.length > 0) selections.push({ key, value });
        }
    }
    return selections;
}

function kineticElements(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    const elements: string[] = [];
    for (const element of value) {
        if (typeof element === "string" && element.length > 0) elements.push(element);
        else if (element && typeof element === "object" && "value" in element) {
            const stored = element.value;
            if (typeof stored === "string" && stored.length > 0) elements.push(stored);
        }
    }
    return elements;
}

function bloodlineTraditions(actor: CharacterPF2e): Tradition[] {
    const traditions: Tradition[] = [];
    for (const [key, on] of Object.entries(actor.rollOptions?.all ?? {})) {
        if (!on) continue;
        const tradition = asTradition(/^feature:bloodline:tradition:(.+)$/.exec(key)?.[1]);
        if (tradition && !traditions.includes(tradition)) traditions.push(tradition);
    }
    return traditions;
}

const SAVES = ["fortitude", "reflex", "will"] as const;
const ATTACKS = ["simple", "martial", "advanced", "unarmed"] as const;
const DEFENSES = ["unarmored", "light", "medium", "heavy"] as const;
const SPEEDS = ["swim", "fly", "climb", "burrow"] as const;

function snapshotFromActor(actor: CharacterPF2e, grants: ReadonlyMap<string, readonly string[]>): CharacterSnapshot {
    const embedded = actor.itemTypes.feat;
    const features = embedded.filter((feat) => feat.category === "classfeature" || feat.category === "ancestryfeature");
    const feats = embedded.filter((feat) => feat.category !== "classfeature" && feat.category !== "ancestryfeature");

    const classArchetypeDedicationIds = [...new Set([...grants.values()].flat())];
    const granted = new Set<string>();
    for (const feature of features) {
        if (feature.category !== "classfeature" || !feature.sourceId) continue;
        const ids = grants.get(feature.sourceId);
        if (!ids) continue;
        for (const id of ids) granted.add(id);
    }

    const speeds: Partial<Record<SpeedMode, number>> = {};
    for (const mode of SPEEDS) {
        const entry = actor.system.movement.speeds[mode];
        if (entry) speeds[mode] = entry.value;
    }

    const attacks = {} as Record<Attack, number>;
    for (const key of ATTACKS) attacks[key] = actor.system.proficiencies.attacks[key]?.rank ?? 0;
    const defenses = {} as Record<Defense, number>;
    for (const key of DEFENSES) defenses[key] = actor.system.proficiencies.defenses[key]?.rank ?? 0;
    const saves = {} as Record<Save, number>;
    for (const key of SAVES) saves[key] = actor.system.saves[key].rank ?? 0;

    const skills: Record<string, number> = {};
    for (const [slug, skill] of Object.entries(actor.system.skills)) skills[slug] = skill.rank ?? 0;

    const className = actor.class?.name ?? null;
    const storedFlags = actor.flags[SYSTEM_ID] as {
        mystic?: { tradition?: unknown };
        witch?: { patronSkill?: unknown };
        witchwarper?: { tradition?: unknown };
        kineticist?: { elements?: unknown };
    };
    const deityItem = actor.deity;
    return {
        level: actor.level,
        className,
        classSlug: actor.class ? (actor.class.slug ?? sluggify(actor.class.name)) : null,
        classHp: actor.system.attributes.classhp ?? 0,
        countsAs: actor.system.details.ancestry?.countsAs ?? [],
        abilities: {
            str: actor.system.abilities.str.mod,
            dex: actor.system.abilities.dex.mod,
            con: actor.system.abilities.con.mod,
            int: actor.system.abilities.int.mod,
            wis: actor.system.abilities.wis.mod,
            cha: actor.system.abilities.cha.mod,
        },
        skills,
        perception: actor.system.perception.rank ?? 0,
        saves,
        attacks,
        defenses,
        feats: feats.map((feat) => ({
            name: feat.name,
            slug: feat.slug ?? sluggify(feat.name),
            category: feat.category,
            sourceId: feat.sourceId,
        })),
        features: [
            ...features.map((feat) => ({
                name: feat.name,
                slug: feat.slug ?? sluggify(feat.name),
                otherTags: feat.system.traits.otherTags ?? [],
                sourceId: feat.sourceId,
            })),
            ...actor.itemTypes.heritage.map((heritage) => ({
                name: heritage.name,
                slug: heritage.slug ?? sluggify(heritage.name),
                otherTags: heritage.system.traits.otherTags ?? [],
                sourceId: heritage.sourceId,
            })),
            ...(actor.background
                ? [
                      {
                          name: actor.background.name,
                          slug: actor.background.slug ?? sluggify(actor.background.name),
                          otherTags: actor.background.system.traits.otherTags ?? [],
                          sourceId: actor.background.sourceId,
                      },
                  ]
                : []),
        ],
        classArchetypeDedicationIds,
        grantedClassArchetypeDedicationIds: [...granted],
        speeds,
        focusMax: actor.system.resources.focus?.max ?? 0,
        traits: [...actor.system.traits.value],
        senses: actor.system.perception.senses.map((sense) => sense.type),
        size: actor.system.traits.size.value,
        hands: actor.system.hands?.max?.value ?? 0,
        versatile: Boolean(actor.system.details.ancestry?.versatile),
        deity: deityItem
            ? {
                  slug: deityItem.slug || sluggify(deityItem.name),
                  name: deityItem.name,
                  fonts: [...deityItem.system.font],
                  sanctification: [...(deityItem.system.sanctification?.what ?? [])],
              }
            : null,
        spellcasting: spellcastingFacts(actor),
        spells: actor.itemTypes.spell.map((spell) => knownSpell(spell)),
        selections: stringSelections(actor),
        mysticTradition: asTradition(storedFlags.mystic?.tradition),
        witchTradition: asTradition(actor.system.proficiencies.aliases?.witch),
        paradoxTradition: asTradition(storedFlags.witchwarper?.tradition),
        patronSkill: typeof storedFlags.witch?.patronSkill === "string" ? storedFlags.witch.patronSkill : null,
        bloodlineTraditions: bloodlineTraditions(actor),
        kineticElements: kineticElements(storedFlags.kineticist?.elements),
        actions: actor.itemTypes.action.map((action) => action.name),
        languages: [...(actor.system.details.languages?.value ?? [])],
    };
}

export { snapshotFromActor };
