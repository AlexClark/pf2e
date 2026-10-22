import type { CharacterPF2e } from "@actor";
import { evaluateEligibility } from "@actor/character/builder/eligibility.ts";
import {
    getSessionFeatIndex,
    onFeatIndexDrop,
    peekSessionFeatIndex,
    type BrowserFeat,
} from "@actor/character/builder/session-index.ts";
import { snapshotFromActor } from "@actor/character/builder/snapshot.ts";
import type { CharacterSnapshot } from "@actor/character/builder/types.ts";
import { ItemPF2e } from "@item";
import { RARITIES, type Rarity } from "@module/data.ts";
import { TextSearch } from "@module/sheet/components/text-search.svelte.ts";
import { SvelteApplicationMixin, type SvelteApplicationRenderContext } from "@module/sheet/mixin.svelte.ts";
import { objectHasKey, sluggify } from "@util";
import Root from "./app.svelte";

const FEAT_BROWSER_GROUPS = ["ancestry", "class", "archetype", "skill", "general"] as const;

type FeatBrowserGroup = (typeof FEAT_BROWSER_GROUPS)[number];
type ClassView = "class" | "archetype" | "dedication";

interface FeatBrowserConfiguration extends fa.ApplicationConfiguration {
    actor: CharacterPF2e;
    groupId: FeatBrowserGroup;
    slotId: string | null;
    level: number;
}

interface FeatSearchDoc {
    id: string;
    name: string;
    originalName?: string;
}

interface FeatBrowserChip {
    slug: string;
    label: string;
}

interface FeatBrowserRow {
    uuid: string;
    name: string;
    originalName?: string;
    img: string;
    level: number;
    category: string;
    traits: string[];
    rarity: Rarity | null;
    rarityLabel: string | null;
    source: { name: string; publication: boolean };
    status: "legal" | "unchecked" | "illegal";
    /** Book sentences, joined. Shown on unverified rows. */
    sentence: string;
    /** Failed requirements, joined. */
    failures: string;
    skillSlugs: string[];
    universal: boolean;
    /** Follow-up of a dedication this character already has. */
    archetypeFollowup: boolean;
}

interface FeatBrowserState {
    failed: boolean;
    groupId: FeatBrowserGroup;
    classSlug: string | null;
    chips: FeatBrowserChip[];
    rows: FeatBrowserRow[];
}

interface FeatBrowserContext extends SvelteApplicationRenderContext {
    actor: CharacterPF2e;
    foundryApp: FeatBrowser;
    search: TextSearch<FeatSearchDoc>;
    state: FeatBrowserState;
}

function classSlugOf(actor: CharacterPF2e): string | null {
    if (!actor.class) return null;
    const slug = actor.class.slug ?? sluggify(actor.class.name);
    return objectHasKey(CONFIG.PF2E.featTraits, slug) ? slug : null;
}

function resolveSource(uuid: string, publicationTitle: string): { name: string; publication: boolean } {
    const publication = publicationTitle.trim();
    if (publication) return { name: publication, publication: true };
    if (uuid.startsWith("Item.")) return { name: game.world.title, publication: false };
    const match = /^Compendium\.([^.]+)\.([^.]+)\./.exec(uuid);
    const pack = game.packs.get(match ? `${match[1]}.${match[2]}` : "");
    const module = game.modules.get(pack?.metadata.packageName ?? "");
    return { name: module?.title ?? pack?.title ?? "???", publication: false };
}

function skillSlugsIn(values: string[]): string[] {
    const slugs: string[] = [];
    for (const value of values) {
        const text = value.toLowerCase();
        for (const [key, skill] of Object.entries(CONFIG.PF2E.skills)) {
            if (slugs.includes(key)) continue;
            const translated = _loc(skill.label).toLocaleLowerCase(game.i18n.lang);
            if (text.includes(key) || text.includes(translated)) slugs.push(key);
        }
    }
    return slugs;
}

function isUniversal(feat: BrowserFeat): boolean {
    if (feat.category !== "ancestry" || feat.otherTags.includes("universal")) return false;
    return !feat.traits.some((trait) => trait === "ancestry" || trait in CONFIG.PF2E.creatureTraits);
}

function followsTakenDedication(feat: BrowserFeat, snapshot: CharacterSnapshot): boolean {
    if (feat.category !== "class" || feat.traits.includes("dedication") || !feat.traits.includes("archetype")) {
        return false;
    }
    const taken = new Set(snapshot.feats.map((owned) => owned.name));
    const families = feat.families;
    if (!families) return false;
    for (const [dedication, members] of families) {
        if (taken.has(dedication) && members.has(feat.name)) return true;
    }
    return false;
}

function blankState(groupId: FeatBrowserGroup): FeatBrowserState {
    return { failed: false, groupId, classSlug: null, chips: [], rows: [] };
}

class FeatBrowser extends SvelteApplicationMixin<
    AbstractConstructorOf<fa.api.ApplicationV2> & { DEFAULT_OPTIONS: DeepPartial<FeatBrowserConfiguration> }
>(fa.api.ApplicationV2) {
    static override DEFAULT_OPTIONS: DeepPartial<FeatBrowserConfiguration> = {
        id: "{id}",
        classes: ["feat-browser"],
        position: { width: 420, height: 650 },
        window: { contentClasses: ["standard-form", "compact"], resizable: true },
    };

    declare options: FeatBrowserConfiguration;

    protected root = Root;

    #search = new TextSearch<FeatSearchDoc>({
        fields: ["name", "originalName"],
        matcher: "substring",
        minLength: 1,
    });

    #stopListening: (() => void) | null = null;

    /** Set once a build has been stored. A later empty cache means the index was dropped. */
    #hadIndex = false;

    #failed = false;

    #closing = false;

    override get title(): string {
        return _loc("PF2E.Actor.Character.FeatBrowser.Title");
    }

    protected override _initializeApplicationOptions(
        options: Partial<FeatBrowserConfiguration>,
    ): FeatBrowserConfiguration {
        const initialized = super._initializeApplicationOptions(options) as FeatBrowserConfiguration;
        initialized.window.icon ??= "fa-solid fa-list-check";
        const { actor, groupId, slotId } = initialized;
        initialized.uniqueId = `feat-browser-${actor.uuid}-${groupId}-${slotId}`;
        return initialized;
    }

    protected override async _onFirstRender(
        context: FeatBrowserContext,
        options: fa.ApplicationRenderOptions,
    ): Promise<void> {
        await super._onFirstRender(context, options);
        this.options.actor.apps[this.id] = this;
        this.#stopListening = onFeatIndexDrop(() => {
            this.#requestClose();
        });
    }

    protected override _tearDown(options: fa.ApplicationClosingOptions): void {
        this.#stopListening?.();
        this.#stopListening = null;
        delete this.options.actor.apps[this.id];
        super._tearDown(options);
    }

    #requestClose(): void {
        if (this.#closing) return;
        this.#closing = true;
        void this.close();
    }

    async take(uuid: string): Promise<void> {
        const { actor, groupId, slotId } = this.options;
        const item = await fromUuid(uuid);
        if (!(item instanceof ItemPF2e) || !item.isOfType("feat")) return;
        const group = actor.feats.get(groupId);
        if (!group?.isFeatValid(item)) return;
        const changed = await actor.feats.insertFeat(item, { groupId, slotId });
        if (changed.length === 0) return;
        await this.close();
    }

    async viewSheet(uuid: string): Promise<void> {
        const item = await fromUuid(uuid);
        if (item instanceof ItemPF2e) item.sheet?.render(true);
    }

    #rows(feats: BrowserFeat[], snapshot: CharacterSnapshot): FeatBrowserRow[] {
        const { groupId, level } = this.options;
        const rows: FeatBrowserRow[] = [];
        for (const feat of feats) {
            if (feat.level > level || !this.#coarseMatch(feat)) continue;
            const result = evaluateEligibility(feat, snapshot, { groupId, level });
            const rarity = RARITIES.includes(feat.rarity as Rarity) ? (feat.rarity as Rarity) : null;
            const shownRarity = rarity && rarity !== "common" ? rarity : null;
            rows.push({
                uuid: feat.uuid,
                name: feat.name,
                originalName: feat.originalName,
                img: feat.img,
                level: feat.level,
                category: feat.category,
                traits: feat.traits,
                rarity: shownRarity,
                rarityLabel: shownRarity ? _loc(CONFIG.PF2E.rarityTraits[shownRarity]) : null,
                source: resolveSource(feat.uuid, feat.publicationTitle),
                status: result.status,
                sentence: feat.prerequisites
                    .map((value) => value.trim())
                    .filter((value) => value.length > 0)
                    .join("; "),
                failures: result.failures.join("; "),
                skillSlugs: skillSlugsIn(feat.prerequisites),
                universal: isUniversal(feat),
                archetypeFollowup: followsTakenDedication(feat, snapshot),
            });
        }
        const lang = game.i18n.lang;
        rows.sort((a, b) => b.level - a.level || a.name.localeCompare(b.name, lang));
        return rows;
    }

    /** Category and level only. Chips, class view, rarity, and search stay in the component. */
    #coarseMatch(feat: BrowserFeat): boolean {
        const { groupId } = this.options;
        if (groupId === "ancestry") return feat.category === "ancestry";
        if (groupId === "class") return feat.category === "class";
        if (groupId === "archetype") return feat.category === "class" && feat.traits.includes("archetype");
        if (groupId === "skill") return feat.category === "skill";
        return feat.category === "general" || feat.category === "skill";
    }

    protected override async _prepareContext(): Promise<FeatBrowserContext> {
        const { actor, groupId } = this.options;
        const base = {
            actor,
            foundryApp: this,
            search: this.#search,
        };
        if (this.#failed) {
            return { ...base, state: { ...blankState(groupId), failed: true } };
        }
        if (this.#hadIndex && !peekSessionFeatIndex()) {
            this.#requestClose();
            return { ...base, state: blankState(groupId) };
        }

        try {
            const index = await getSessionFeatIndex();
            if (!index || !peekSessionFeatIndex()) {
                this.#requestClose();
                return { ...base, state: blankState(groupId) };
            }
            this.#hadIndex = true;
            const snapshot = snapshotFromActor(actor, index.classArchetypeGrants);
            const chips = [...new Set(snapshot.countsAs)]
                .filter((slug) => objectHasKey(CONFIG.PF2E.featTraits, slug))
                .map((slug) => ({ slug, label: _loc(CONFIG.PF2E.featTraits[slug]) }));
            const rows = this.#rows(index.feats, snapshot);
            this.#search.index(rows.map((row) => ({ id: row.uuid, name: row.name, originalName: row.originalName })));
            return {
                ...base,
                state: { failed: false, groupId, classSlug: classSlugOf(actor), chips, rows },
            };
        } catch (error) {
            if (this.#closing) return { ...base, state: blankState(groupId) };
            console.error(error);
            this.#failed = true;
            return { ...base, state: { ...blankState(groupId), failed: true } };
        }
    }
}

export { FEAT_BROWSER_GROUPS, FeatBrowser };
export type { ClassView, FeatBrowserContext, FeatBrowserGroup, FeatBrowserRow, FeatBrowserState };
