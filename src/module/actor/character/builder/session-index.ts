import { dedicationFamilies, dedicationUuidsFromRules } from "@actor/character/builder/archetype-gate.ts";
import { compileClauses } from "@actor/character/builder/compile.ts";
import { PARSER_VERSION, skillLabels } from "@actor/character/builder/prereq-parser.ts";
import type { IndexedFeat, ParseContext, PrereqAtom } from "@actor/character/builder/types.ts";
import type { FeatPF2e } from "@item/feat/document.ts";
import { adjustFeatTraitsAndCategory } from "@item/feat/helpers.ts";
import { sluggify } from "@util";

const INDEX_ITEM_TYPES = new Set(["feat", "heritage", "background", "class", "ancestry"]);
const CLASS_FEATURES_PACK = SYSTEM_ID === "sf2e" ? "sf2e.class-features" : "pf2e.classfeatures";

const FEAT_INDEX_FIELDS = [
    "img",
    "system.slug",
    "system.category",
    "system.level.value",
    "system.maxTakable",
    "system.onlyLevel1",
    "system.prerequisites.value",
    "system.prerequisites.compiled",
    "system.traits",
    "system.publication",
];

interface IndexSystem {
    slug?: string | null;
    category?: string;
    level?: { value?: number };
    maxTakable?: number | null;
    onlyLevel1?: boolean;
    prerequisites?: {
        value?: { value?: string }[];
        compiled?: { version?: number; clauses?: object[][] };
    };
    traits?: { value?: string[]; rarity?: string; otherTags?: string[] };
    publication?: { title?: string };
    rules?: readonly unknown[];
}

interface IndexEntry {
    _id: string;
    name: string;
    type?: string;
    img?: string;
    uuid?: string;
    originalName?: string;
    system?: IndexSystem;
}

/** A feat the browser can classify. `id` is the document uuid, matching class-archetype grant ids. */
interface BrowserFeat extends IndexedFeat {
    uuid: string;
    img: string;
    originalName?: string;
    rarity: string;
    otherTags: string[];
    prerequisites: string[];
    publicationTitle: string;
}

interface SessionFeatIndex {
    feats: BrowserFeat[];
    /** Class-feature uuid to the dedication uuids that feature grants. The same map for every character. */
    classArchetypeGrants: ReadonlyMap<string, readonly string[]>;
}

let session: SessionFeatIndex | null = null;
let building: Promise<SessionFeatIndex | null> | null = null;
/** Bumped on drop so an in-flight build cannot write its result back. */
let generation = 0;
const dropListeners = new Set<() => void>();

function peekSessionFeatIndex(): SessionFeatIndex | null {
    return session;
}

function onFeatIndexDrop(listener: () => void): () => void {
    dropListeners.add(listener);
    return () => dropListeners.delete(listener);
}

/** Forget the cached feats and tell open browsers to close. The next open builds again. */
function dropSessionFeatIndex(): void {
    generation += 1;
    session = null;
    building = null;
    for (const listener of [...dropListeners]) listener();
}

function getSessionFeatIndex(): Promise<SessionFeatIndex | null> {
    if (session) return Promise.resolve(session);
    if (!building) {
        const started = generation;
        const promise = SessionFeatIndexBuild.build().then(
            (index): SessionFeatIndex | null => {
                // Drop won. Leave the cache empty so the next open builds again.
                if (generation !== started) return null;
                session = index;
                if (building === promise) building = null;
                return index;
            },
            (error: unknown) => {
                if (generation === started && building === promise) building = null;
                throw error;
            },
        );
        building = promise;
    }
    return building;
}

function adjustedFeat(system: IndexSystem): {
    category: string;
    traits: string[];
    onlyLevel1: boolean;
    maxTakable: number | null | undefined;
} {
    const traits = Array.isArray(system.traits?.value) ? [...system.traits.value] : [];
    const draft = { category: system.category ?? "bonus", traits: { value: traits } };
    adjustFeatTraitsAndCategory(draft as FeatPF2e["system"]);
    let onlyLevel1 = system.onlyLevel1 ?? false;
    let maxTakable: number | null | undefined = "maxTakable" in system ? system.maxTakable : undefined;
    // Same order as FeatPF2e.prepareBaseData: lineage forces level 1, and that forces a single take.
    if (traits.includes("lineage")) onlyLevel1 = true;
    if (onlyLevel1) maxTakable = 1;
    return { category: draft.category, traits, onlyLevel1, maxTakable };
}

function clausesFrom(system: IndexSystem, ctx: ParseContext): PrereqAtom[][] {
    const compiled = system.prerequisites?.compiled;
    if (compiled?.version === PARSER_VERSION && Array.isArray(compiled.clauses)) {
        return compiled.clauses as PrereqAtom[][];
    }
    const entries = system.prerequisites?.value;
    const clauses = Array.isArray(entries) ? entries.map((entry) => ({ value: entry?.value ?? "" })) : [];
    return compileClauses(clauses, ctx, () => "").atoms;
}

function prerequisiteTexts(system: IndexSystem): string[] {
    const entries = system.prerequisites?.value;
    if (!Array.isArray(entries)) return [];
    return entries.flatMap((entry) => (typeof entry?.value === "string" ? [entry.value] : []));
}

function rememberName(category: string, name: string, featNames: Set<string>, featureNames: Set<string>): void {
    const into = category === "classfeature" || category === "ancestryfeature" ? featureNames : featNames;
    into.add(name);
}

async function addPackNames(packId: string, into: Set<string>): Promise<void> {
    const pack = game.packs.get(packId);
    const user = game.user;
    if (!pack || !user || !pack.testUserPermission(user, "LIMITED")) return;
    const index = await pack.getIndex();
    for (const entry of index) {
        if (entry.name) into.add(entry.name);
    }
}

function resolveFeatUuid(uuid: string, byId: Map<string, string>, byName: Map<string, string>): string | null {
    if (uuid.includes("{")) return null;
    const match = /^Compendium\.[^.]+\.([^.]+)\.Item\.(.+)$/.exec(uuid);
    if (!match?.[1] || !match[2]) return null;
    const key = `${match[1]}\0${match[2]}`;
    return byId.get(key) ?? byName.get(key) ?? null;
}

async function classArchetypeGrants(feats: BrowserFeat[]): Promise<Map<string, string[]>> {
    const grants = new Map<string, string[]>();
    const pack = game.packs.get(CLASS_FEATURES_PACK);
    const user = game.user;
    if (!pack || !user || !pack.testUserPermission(user, "LIMITED")) return grants;

    const byUuid = new Map(feats.map((feat) => [feat.uuid, feat]));
    const byId = new Map<string, string>();
    const byName = new Map<string, string>();
    for (const feat of feats) {
        const match = /^Compendium\.[^.]+\.([^.]+)\.Item\.(.+)$/.exec(feat.uuid);
        if (!match?.[1] || !match[2]) continue;
        byId.set(`${match[1]}\0${match[2]}`, feat.uuid);
        byName.set(`${match[1]}\0${feat.name}`, feat.uuid);
    }

    const index = await pack.getIndex({ fields: ["system.traits.otherTags", "system.rules"] });
    for (const entry of index as Collection<string, IndexEntry>) {
        const otherTags = entry.system?.traits?.otherTags;
        if (!Array.isArray(otherTags) || !otherTags.includes("class-archetype")) continue;
        const featureUuid = entry.uuid;
        if (!featureUuid) continue;
        const rules = entry.system?.rules;
        const raw = dedicationUuidsFromRules(Array.isArray(rules) ? rules : [], (uuid) => {
            const resolved = resolveFeatUuid(uuid, byId, byName);
            return !!resolved && (byUuid.get(resolved)?.traits.includes("dedication") ?? false);
        });
        const dedications = raw.flatMap((uuid) => {
            const resolved = resolveFeatUuid(uuid, byId, byName);
            return resolved ? [resolved] : [];
        });
        if (dedications.length > 0) grants.set(featureUuid, dedications);
    }
    return grants;
}

const SessionFeatIndexBuild = {
    async build(): Promise<SessionFeatIndex> {
        const user = game.user;
        if (!user) throw new Error("No user");

        const pending: { entry: IndexEntry; uuid: string; system: IndexSystem }[] = [];
        const packIds = game.pf2e.compendiumBrowser.loadedPacks("feat");
        for (const packId of packIds) {
            const pack = game.packs.get(packId);
            if (!pack || pack.documentName !== "Item" || !pack.testUserPermission(user, "LIMITED")) continue;
            const index = await pack.getIndex({ fields: FEAT_INDEX_FIELDS });
            for (const entry of index as Collection<string, IndexEntry>) {
                if (entry.type !== "feat" || !entry.system) continue;
                const uuid = entry.uuid ?? `Compendium.${packId}.Item.${entry._id}`;
                pending.push({ entry, uuid, system: entry.system });
            }
        }

        for (const item of game.items) {
            if (!item.isOfType("feat") || !item.testUserPermission(user, "LIMITED")) continue;
            const system = item._source.system;
            const originalName = item.getFlag("babele", "originalName");
            pending.push({
                entry: {
                    _id: item.id,
                    name: item.name,
                    type: "feat",
                    img: item.img,
                    uuid: item.uuid,
                    originalName: typeof originalName === "string" ? originalName : undefined,
                },
                uuid: item.uuid,
                system,
            });
        }

        const featNames = new Set<string>();
        const featureNames = new Set<string>();
        const adjusted = pending.map((row) => {
            const traits = adjustedFeat(row.system);
            rememberName(traits.category, row.entry.name, featNames, featureNames);
            return { ...row, ...traits };
        });

        const heritageNames = new Set<string>();
        await addPackNames(`${SYSTEM_ID}.heritages`, heritageNames);
        for (const name of heritageNames) featureNames.add(name);
        for (const folder of ["backgrounds", "classes"] as const) {
            await addPackNames(`${SYSTEM_ID}.${folder}`, featureNames);
        }
        for (const item of game.items) {
            if (!item.testUserPermission(user, "LIMITED")) continue;
            if (item.isOfType("heritage")) heritageNames.add(item.name);
            if (item.isOfType("heritage", "background", "class")) featureNames.add(item.name);
        }

        const ctx: ParseContext = {
            skills: skillLabels(SYSTEM_ID),
            featNames,
            featureNames,
            heritageNames,
        };

        const feats: BrowserFeat[] = adjusted.map((row) => ({
            id: row.uuid,
            uuid: row.uuid,
            name: row.entry.name,
            originalName: typeof row.entry.originalName === "string" ? row.entry.originalName : undefined,
            img: row.entry.img ?? "",
            slug: row.system.slug || sluggify(row.entry.name),
            category: row.category,
            traits: row.traits,
            otherTags: Array.isArray(row.system.traits?.otherTags) ? [...row.system.traits.otherTags] : [],
            level: row.system.level?.value ?? 0,
            onlyLevel1: row.onlyLevel1,
            maxTakable: row.maxTakable,
            rarity: row.system.traits?.rarity ?? "common",
            prerequisites: prerequisiteTexts(row.system),
            publicationTitle: row.system.publication?.title ?? "",
            clauses: clausesFrom(row.system, ctx),
        }));

        const families = dedicationFamilies(feats);
        for (const feat of feats) feat.families = families;
        return { feats, classArchetypeGrants: await classArchetypeGrants(feats) };
    },
};

function onIndexItem(document: unknown): void {
    if (typeof document !== "object" || document === null || !("type" in document)) return;
    if (typeof document.type !== "string" || !INDEX_ITEM_TYPES.has(document.type)) return;
    dropSessionFeatIndex();
}

// A feat, heritage, background, class, or ancestry edit invalidates parsed names. Do not rebuild in the hook.
Hooks.on("createItem", onIndexItem);
Hooks.on("updateItem", onIndexItem);
Hooks.on("deleteItem", onIndexItem);

export { getSessionFeatIndex, onFeatIndexDrop, peekSessionFeatIndex };
export type { BrowserFeat, SessionFeatIndex };
