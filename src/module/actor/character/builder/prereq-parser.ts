import { sluggify } from "@util/misc.ts";
import { classSlugFor, parseFactBranch, parseFactClause } from "./prereq-facts.ts";
import type { CatalogDocument, ParseContext, PrereqAtom, Rank, SpeedMode } from "./types.ts";

const PARSER_VERSION = 4;

const CORE_SKILL_LABELS = [
    ["acrobatics", "Acrobatics"],
    ["arcana", "Arcana"],
    ["athletics", "Athletics"],
    ["crafting", "Crafting"],
    ["deception", "Deception"],
    ["diplomacy", "Diplomacy"],
    ["intimidation", "Intimidation"],
    ["medicine", "Medicine"],
    ["nature", "Nature"],
    ["occultism", "Occultism"],
    ["performance", "Performance"],
    ["religion", "Religion"],
    ["society", "Society"],
    ["stealth", "Stealth"],
    ["survival", "Survival"],
    ["thievery", "Thievery"],
] as const;

/** Book labels the parser matches. Starfinder adds Computers and Piloting. */
function skillLabels(systemId: "pf2e" | "sf2e"): Map<string, string> {
    const skills = new Map<string, string>(CORE_SKILL_LABELS);
    if (systemId === "sf2e") {
        skills.set("computers", "Computers");
        skills.set("piloting", "Piloting");
    }
    return skills;
}

const ABILITIES = {
    strength: "str",
    dexterity: "dex",
    constitution: "con",
    intelligence: "int",
    wisdom: "wis",
    charisma: "cha",
    str: "str",
    dex: "dex",
    con: "con",
    int: "int",
    wis: "wis",
    cha: "cha",
} as const;

const RANKS: Record<string, Rank> = {
    trained: 1,
    expert: 2,
    master: 3,
    legendary: 4,
};

const RANK_WORDS = /^(trained|expert|master|legendary)(?:\s+(?:in|at))?\s+(.+)$/i;
const ATTRIBUTE_WORDS = /^(strength|dexterity|constitution|intelligence|wisdom|charisma|str|dex|con|int|wis|cha) \+(\d+)$/i;
const SPEED_WORDS = /^(?:you have )?(?:a |an )?(swim|fly|climb|burrow) speed(?: (\d+) feet)?\.?$/i;
const FOCUS_WORDS = /^(?:you have )?(?:a )?focus pool(?: (\d+))?$/i;
const AND_PROFICIENCY = /^(trained|expert|master|legendary) in (.+) and (.+)$/i;
const TRAIT_WORDS = /^(?:a |an |the )?(.+?) trait$/i;
const SENSES: Record<string, string> = {
    "low-light vision": "low-light-vision",
    darkvision: "darkvision",
    "greater darkvision": "greater-darkvision",
    scent: "scent",
};

/** Label word to the otherTag on the class feature it names. Affiliation matches a feature name. */
const LABEL_TAGS: Record<string, string> = {
    exocortex: "mechanic-exocortex",
    connection: "mystic-connection",
    paradox: "witchwarper-paradox",
    muse: "bard-muse",
    racket: "rogue-racket",
    cause: "champion-cause",
    mystery: "oracle-mystery",
    doctrine: "cleric-doctrine",
};

/** Same rule as `sluggifyLoreName` in `src/module/item/lore.ts`. Kept here so the parser does not load the item class. */
function sluggifyLoreName(nameOrSlug: string): string {
    const rawLoreSlug = sluggify(nameOrSlug);
    return /\blore\b/.test(rawLoreSlug) ? rawLoreSlug : `${rawLoreSlug}-lore`;
}

function splitBranches(value: string): string[] {
    const text = value.trim();
    if (text.includes(", or ")) {
        const normalized = text.replaceAll(", or ", " or ").replaceAll(", ", " or ");
        return normalized
            .split(" or ")
            .map((part) => part.trim())
            .filter((part) => part.length > 0);
    }
    if (text.includes(" or ")) {
        return text
            .split(" or ")
            .map((part) => part.trim())
            .filter((part) => part.length > 0);
    }
    return [text];
}

function skillSlug(text: string, ctx: ParseContext): string | null {
    const lower = text.toLowerCase();
    for (const [slug, label] of ctx.skills) {
        if (slug === lower || label.toLowerCase() === lower) return slug;
    }
    return null;
}

function loreSlug(text: string): string | null {
    if (text !== "Lore" && !text.endsWith(" Lore")) return null;
    return sluggifyLoreName(text);
}

type StatisticKind = "skill" | "lore" | "other";

function parseStatistic(text: string, ctx: ParseContext): { slug: string; kind: StatisticKind } | null {
    const trimmed = text.trim();
    if (/^perception$/i.test(trimmed)) return { slug: "perception", kind: "other" };

    const save = /^(fortitude|reflex|will)(?: saves)?$/i.exec(trimmed);
    if (save?.[1]) return { slug: save[1].toLowerCase(), kind: "other" };

    const weapons = /^(simple|martial|advanced) weapons$/i.exec(trimmed);
    if (weapons?.[1]) return { slug: weapons[1].toLowerCase(), kind: "other" };
    if (/^unarmed attacks$/i.test(trimmed)) return { slug: "unarmed", kind: "other" };

    const armor = /^(light|medium|heavy) armor$/i.exec(trimmed);
    if (armor?.[1]) return { slug: armor[1].toLowerCase(), kind: "other" };
    if (/^unarmored defense$/i.test(trimmed)) return { slug: "unarmored", kind: "other" };

    if (
        /^(?:a recall knowledge skill|a skill (?:with|used to) (?:the )?recall knowledge(?: action)?)$/i.test(trimmed)
    ) {
        return { slug: "recall-knowledge", kind: "other" };
    }
    if (/^(?:at least one|any) skills?$/i.test(trimmed)) return { slug: "any-skill", kind: "other" };
    if (/^(?:at least one|any) saving throws?$/i.test(trimmed)) return { slug: "any-save", kind: "other" };
    if (/^(?:one or more|any|at least one|a) lore skills?$/i.test(trimmed)) return { slug: "any-lore", kind: "lore" };

    const lore = loreSlug(trimmed);
    if (lore) return { slug: lore, kind: "lore" };

    const skill = skillSlug(trimmed, ctx);
    if (skill) return { slug: skill, kind: "skill" };
    return null;
}

function parseProficiency(branch: string, ctx: ParseContext): PrereqAtom | null {
    const match = RANK_WORDS.exec(branch);
    if (!match?.[1] || !match[2]) return null;
    const minRank = RANKS[match[1].toLowerCase()];
    const statistic = parseStatistic(match[2], ctx);
    if (!minRank || !statistic) return null;
    return { kind: "proficiency", statistic: statistic.slug, minRank };
}

/** `Strength or Dexterity +2` and `Intelligence, Wisdom or Charisma +2`. */
function parseAttributeList(text: string): PrereqAtom[] | null {
    const match = /^(.+) \+(\d+)$/.exec(text);
    const body = match?.[1];
    const minMod = match?.[2] ? Number(match[2]) : 0;
    if (!body || !/ or /i.test(body) || !Number.isInteger(minMod) || minMod < 1) return null;
    const parts = body
        .replace(/, or /gi, " or ")
        .replace(/, /g, " or ")
        .split(/ or /i)
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
    if (parts.length < 2) return null;
    const atoms: PrereqAtom[] = [];
    for (const part of parts) {
        const ability = ABILITIES[part.toLowerCase() as keyof typeof ABILITIES];
        if (!ability) return null;
        atoms.push({ kind: "attribute", ability, minMod });
    }
    return [{ kind: "or", any: atoms.map((atom) => [atom]) }];
}

function parseMissingSpeed(text: string): PrereqAtom[] | null {
    const match = /^(?:you )?(?:don't|do not) have (?:a |an )?(swim|fly|climb|burrow) speed\.?$/i.exec(text);
    const mode = match?.[1]?.toLowerCase();
    if (mode !== "swim" && mode !== "fly" && mode !== "climb" && mode !== "burrow") return null;
    return [{ kind: "not", atom: { kind: "speed", mode } }];
}

function parseAttribute(branch: string): PrereqAtom | null {
    const match = ATTRIBUTE_WORDS.exec(branch);
    if (!match?.[1] || !match[2]) return null;
    const ability = ABILITIES[match[1].toLowerCase() as keyof typeof ABILITIES];
    const minMod = Number(match[2]);
    if (!ability || !Number.isInteger(minMod) || minMod < 1) return null;
    return { kind: "attribute", ability, minMod };
}

function parseSpeed(branch: string): PrereqAtom | null {
    const match = SPEED_WORDS.exec(branch);
    if (!match?.[1]) return null;
    const mode = match[1].toLowerCase() as SpeedMode;
    if (!match[2]) return { kind: "speed", mode };
    const feet = Number(match[2]);
    if (!Number.isInteger(feet) || feet < 0) return null;
    return { kind: "speed", mode, feet };
}

function parseFocus(branch: string): PrereqAtom | null {
    const match = FOCUS_WORDS.exec(branch);
    if (!match) return null;
    if (!match[1]) return { kind: "focus-pool", min: 1 };
    const min = Number(match[1]);
    if (!Number.isInteger(min) || min < 1) return null;
    return { kind: "focus-pool", min };
}

interface NameIndexes {
    feats: Map<string, string>;
    features: Map<string, string>;
    heritages: Map<string, string>;
    heritageList: string[];
    tagged: Map<string, Map<string, { name: string; kind: "feat" | "feature" }>>;
}

const prepared = new WeakMap<ParseContext, NameIndexes>();

function lowerMap(names: ReadonlySet<string> | undefined): Map<string, string> {
    const map = new Map<string, string>();
    const blocked = new Set<string>();
    for (const name of names ?? []) {
        const key = name.toLowerCase();
        if (blocked.has(key)) continue;
        const existing = map.get(key);
        if (existing && existing !== name) {
            map.delete(key);
            blocked.add(key);
            continue;
        }
        map.set(key, name);
    }
    return map;
}

function indexesFor(ctx: ParseContext): NameIndexes {
    const cached = prepared.get(ctx);
    if (cached) return cached;
    const tagged = new Map<string, Map<string, { name: string; kind: "feat" | "feature" }>>();
    for (const [tag, documents] of ctx.tagged ?? []) {
        const byName = new Map<string, { name: string; kind: "feat" | "feature" }>();
        for (const document of documents) {
            const key = document.name.toLowerCase();
            if (!byName.has(key)) byName.set(key, document);
        }
        tagged.set(tag, byName);
    }
    const heritages = lowerMap(ctx.heritageNames);
    const built: NameIndexes = {
        feats: lowerMap(ctx.featNames),
        features: lowerMap(ctx.featureNames),
        heritages,
        heritageList: [...heritages.values()],
        tagged,
    };
    prepared.set(ctx, built);
    return built;
}

function namedAtom(name: string, kind: "feat" | "feature"): PrereqAtom {
    return kind === "feat" ? { kind: "feat", name } : { kind: "feature", name };
}

/** Case-folded document name. A name that is both a feat and a feature is either one. */
function featureAtom(name: string): PrereqAtom {
    const slug = classSlugFor(name);
    return slug ? { kind: "class", slug } : { kind: "feature", name };
}

function resolveExact(text: string, indexes: NameIndexes): PrereqAtom | null {
    const key = text.toLowerCase();
    const feat = indexes.feats.get(key);
    const feature = indexes.features.get(key);
    if (feat && feature) {
        return { kind: "or", any: [[{ kind: "feat", name: feat }], [featureAtom(feature)]] };
    }
    if (feat) return { kind: "feat", name: feat };
    if (feature) return featureAtom(feature);
    return null;
}

/** `Breath of the Dragon` matches a single `Breath of the Dragon (...)` document. Several matches stay open. */
function resolveParenthetical(text: string, indexes: NameIndexes): PrereqAtom | null {
    const prefix = `${text.toLowerCase()} (`;
    const hits: PrereqAtom[] = [];
    for (const [key, name] of indexes.feats) {
        if (key.startsWith(prefix)) hits.push({ kind: "feat", name });
    }
    for (const [key, name] of indexes.features) {
        if (key.startsWith(prefix)) hits.push({ kind: "feature", name });
    }
    return hits.length === 1 ? (hits[0] ?? null) : null;
}

function resolveDocument(text: string, indexes: NameIndexes): PrereqAtom | null {
    const trimmed = text.trim().replace(/[.,;:]+$/g, "");
    const exact = resolveExact(trimmed, indexes);
    if (exact) return exact;
    const article = /^(?:a|an|the)\s+(.+)$/i.exec(trimmed);
    if (article?.[1]) {
        const stripped = resolveExact(article[1], indexes);
        if (stripped) return stripped;
    }
    return resolveParenthetical(trimmed, indexes);
}

function parseTrait(branch: string): PrereqAtom | null {
    const match = TRAIT_WORDS.exec(branch.trim());
    const core = match?.[1]?.trim();
    if (!core) return null;
    const trait = sluggify(core);
    if (!trait) return null;
    return { kind: "trait", trait };
}

function parseBranch(
    branch: string,
    inherited: Rank | null,
    ctx: ParseContext,
    indexes: NameIndexes,
): PrereqAtom | null {
    const text = branch.trim().replace(/\.$/, "");
    const proficiency = parseProficiency(text, ctx);
    if (proficiency) return proficiency;

    const attribute = parseAttribute(text);
    if (attribute) return attribute;

    const speed = parseSpeed(text);
    if (speed) return speed;

    const focus = parseFocus(text);
    if (focus) return focus;

    const trait = parseTrait(text);
    if (trait) return trait;

    const fact = parseFactBranch(text);
    if (fact) return fact;

    if (inherited) {
        const statistic = parseStatistic(text, ctx);
        if (statistic && (statistic.kind === "skill" || statistic.kind === "lore")) {
            return { kind: "proficiency", statistic: statistic.slug, minRank: inherited };
        }
    }

    const sense = parseSense(text);
    if (sense?.[0]) return sense[0];

    return resolveDocument(text, indexes);
}

/** `A, B` or `A and B` when each side is already a requirement and the whole line is not one document. */
function tryJoin(text: string, ctx: ParseContext, indexes: NameIndexes): PrereqAtom[] | null {
    const joined = text.includes(", or ") ? null : splitOnce(text, ",");
    if (joined) {
        const atoms = sides(joined, ctx, indexes);
        if (atoms) return atoms;
    }
    if (text.includes(" or ") || !/ and /i.test(text)) return null;
    if (resolveExact(text.trim().replace(/\.+$/, ""), indexes)) return null;
    return sides(text.split(/ and /i), ctx, indexes);
}

function splitOnce(text: string, separator: string): string[] | null {
    const parts = text.split(separator);
    return parts.length === 2 ? parts : null;
}

function sides(parts: string[], ctx: ParseContext, indexes: NameIndexes): PrereqAtom[] | null {
    if (parts.length < 2 || parts.some((part) => part.trim().length === 0)) return null;
    const atoms: PrereqAtom[] = [];
    for (const part of parts) {
        const atom = parseBranch(part, null, ctx, indexes);
        if (!atom) return null;
        atoms.push(atom);
    }
    return atoms;
}

function asOr(atoms: PrereqAtom[]): PrereqAtom[] {
    if (atoms.length === 1) return atoms;
    return [{ kind: "or", any: atoms.map((atom) => [atom]) }];
}

function cleanToken(token: string): string {
    return token.replace(/[.,;:]+$/g, "");
}

function coreWithoutLabel(branch: string, label: string): string | null {
    const tokens = branch
        .trim()
        .split(/\s+/)
        .map(cleanToken)
        .filter((token) => token.length > 0);
    if (tokens.length === 0) return null;
    const last = tokens.at(-1)?.toLowerCase();
    if (last === label) {
        if (tokens.length < 2) return null;
        return tokens.slice(0, -1).join(" ");
    }
    return tokens.join(" ");
}

function resolveHeritageCore(core: string, lastCore: string, indexes: NameIndexes): string | null {
    const exact = indexes.heritages.get(core.toLowerCase());
    if (exact) return exact;
    const tail = lastCore.split(/\s+/);
    for (let length = 1; length < tail.length; length += 1) {
        const shared = tail.slice(tail.length - length).join(" ");
        const hit = indexes.heritages.get(`${core} ${shared}`.toLowerCase());
        if (hit) return hit;
    }
    const needle = core.toLowerCase();
    const hits = indexes.heritageList.filter((name) => {
        const lower = name.toLowerCase();
        return lower === needle || lower.startsWith(`${needle} `);
    });
    return hits.length === 1 ? (hits[0] ?? null) : null;
}

function parseHeritage(branches: string[], indexes: NameIndexes): PrereqAtom[] | null {
    const last = branches.at(-1);
    if (!last || !/\sheritage$/i.test(cleanToken(last.trim()))) return null;
    const lastCore = coreWithoutLabel(last, "heritage");
    if (!lastCore) return null;
    const names: string[] = [];
    for (const branch of branches) {
        const core = coreWithoutLabel(branch, "heritage");
        if (!core) return null;
        const name = resolveHeritageCore(core, lastCore, indexes);
        if (!name) return null;
        names.push(name);
    }
    return asOr(names.map((name) => namedAtom(name, "feature")));
}

function parseTagLabel(branches: string[], label: string, tag: string, indexes: NameIndexes): PrereqAtom[] | null {
    const documents = indexes.tagged.get(tag);
    if (!documents) return null;
    const atoms: PrereqAtom[] = [];
    for (const branch of branches) {
        const core = coreWithoutLabel(branch, label);
        if (!core) return null;
        const hit = documents.get(core.toLowerCase());
        if (!hit) return null;
        atoms.push(namedAtom(hit.name, hit.kind));
    }
    return asOr(atoms);
}

function parseAffiliation(branches: string[], indexes: NameIndexes): PrereqAtom[] | null {
    const atoms: PrereqAtom[] = [];
    for (const branch of branches) {
        const core = coreWithoutLabel(branch, "affiliation");
        if (!core) return null;
        const name = indexes.features.get(core.toLowerCase());
        if (!name) return null;
        atoms.push(namedAtom(name, "feature"));
    }
    return asOr(atoms);
}

/** A trailing label word distributed across an or-list: `drone or turret exocortex`. */
function parseLabeled(value: string, indexes: NameIndexes): PrereqAtom[] | null {
    const branches = splitBranches(value);
    const last = branches.at(-1);
    if (!last) return null;
    const label = cleanToken(last.trim().split(/\s+/).at(-1) ?? "").toLowerCase();
    if (!label || label === last.trim().toLowerCase()) return null;
    if (label === "heritage") return indexes.heritages.size > 0 ? parseHeritage(branches, indexes) : null;
    const tag = LABEL_TAGS[label];
    if (tag) return parseTagLabel(branches, label, tag, indexes);
    if (label === "affiliation") return parseAffiliation(branches, indexes);
    return null;
}

/** `armor, construct, or weapon innovation` shares the last word onto the bare branches. */
function parseSharedSuffix(value: string, indexes: NameIndexes): PrereqAtom[] | null {
    if (!value.includes(" or ")) return null;
    const branches = splitBranches(value);
    if (branches.length < 2) return null;
    const last = branches.at(-1);
    if (!last) return null;
    const lastAtom = resolveExact(cleanToken(last.trim()), indexes);
    if (!lastAtom || lastAtom.kind === "or") return null;
    const lastWord = cleanToken(last.trim().split(/\s+/).at(-1) ?? "");
    if (!lastWord) return null;
    const atoms: PrereqAtom[] = [];
    for (const branch of branches.slice(0, -1)) {
        const bare = cleanToken(branch.trim());
        const hit = resolveExact(bare, indexes) ?? resolveExact(`${bare} ${lastWord}`, indexes);
        if (!hit || hit.kind === "or") return null;
        atoms.push(hit);
    }
    atoms.push(lastAtom);
    return asOr(atoms);
}

/** Expert already covers trained, and the sentence does not ask for a second skill. */
function parseSkillMastery(text: string): PrereqAtom[] | null {
    if (!/^trained in at least one skill and expert in at least one skill$/i.test(text)) return null;
    return [{ kind: "proficiency", statistic: "any-skill", minRank: 2 }];
}

/** `legendary in either Arcana or Nature and master in the other`. */
function parseEitherOther(text: string, ctx: ParseContext): PrereqAtom[] | null {
    const match =
        /^(trained|expert|master|legendary) in either (.+) or (.+) and (trained|expert|master|legendary) in the other$/i.exec(
            text,
        );
    const high = match?.[1] ? RANKS[match[1].toLowerCase()] : undefined;
    const low = match?.[4] ? RANKS[match[4].toLowerCase()] : undefined;
    const left = match?.[2] ? skillSlug(match[2], ctx) : null;
    const right = match?.[3] ? skillSlug(match[3], ctx) : null;
    if (!high || !low || !left || !right || left === right) return null;
    return [
        {
            kind: "or",
            any: [
                [
                    { kind: "proficiency", statistic: left, minRank: high },
                    { kind: "proficiency", statistic: right, minRank: low },
                ],
                [
                    { kind: "proficiency", statistic: right, minRank: high },
                    { kind: "proficiency", statistic: left, minRank: low },
                ],
            ],
        },
    ];
}

/** The expert skill and the trained skill have to be different members of the named list. */
function parseAnotherOf(text: string): PrereqAtom[] | null {
    if (
        !/^trained in at least one of Arcana, Nature, Occultism, or Religion and expert in at least one other$/i.test(
            text,
        )
    ) {
        return null;
    }
    const skills = ["arcana", "nature", "occultism", "religion"];
    return [
        {
            kind: "or",
            any: skills.map((expert) => [
                { kind: "proficiency" as const, statistic: expert, minRank: 2 as Rank },
                {
                    kind: "or" as const,
                    any: skills
                        .filter((other) => other !== expert)
                        .map((other) => [{ kind: "proficiency" as const, statistic: other, minRank: 1 as Rank }]),
                },
            ]),
        },
    ];
}

function splitSkillList(list: string): string[] {
    return list
        .replace(/, or /gi, " or ")
        .replace(/, /g, " or ")
        .split(/ or /i)
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
}

/** `trained in Society, Thievery, and your choice of Arcana, Nature, Occultism, or Religion`. */
function parseYourChoice(text: string, ctx: ParseContext): PrereqAtom[] | null {
    const match = /^(trained|expert|master|legendary) in ([^,]+), ([^,]+), and your choice of (.+)$/i.exec(text);
    const minRank = match?.[1] ? RANKS[match[1].toLowerCase()] : undefined;
    const required = [match?.[2], match?.[3]].map((name) => (name ? skillSlug(name, ctx) : null));
    const choices = match?.[4] ? splitSkillList(match[4]).map((name) => skillSlug(name, ctx)) : [];
    if (!minRank || required.some((slug) => !slug) || choices.length < 2 || choices.some((slug) => !slug)) return null;
    const rank = minRank;
    return [
        { kind: "proficiency", statistic: required[0] ?? "", minRank: rank },
        { kind: "proficiency", statistic: required[1] ?? "", minRank: rank },
        {
            kind: "or",
            any: choices.map((slug) => [{ kind: "proficiency", statistic: slug ?? "", minRank: rank }]),
        },
    ];
}

function parseAndProficiency(value: string, ctx: ParseContext): PrereqAtom[] | null {
    if (value.includes(" or ")) return null;
    const match = AND_PROFICIENCY.exec(value.trim());
    if (!match?.[1] || !match[2] || !match[3]) return null;
    const minRank = RANKS[match[1].toLowerCase()];
    const left = parseStatistic(match[2], ctx);
    const right = parseStatistic(match[3], ctx);
    if (!minRank || !left || !right) return null;
    return [
        { kind: "proficiency", statistic: left.slug, minRank },
        { kind: "proficiency", statistic: right.slug, minRank },
    ];
}

function parseSense(value: string): PrereqAtom[] | null {
    const sense =
        SENSES[
            value
                .trim()
                .replace(/[.,;:]+$/g, "")
                .toLowerCase()
        ];
    return sense ? [{ kind: "sense", sense }] : null;
}

function parseBranches(value: string, ctx: ParseContext, indexes: NameIndexes): PrereqAtom[] | null {
    const branches = splitBranches(value);
    if (branches.length === 0 || branches[0] === "") return null;
    const first = parseBranch(branches[0], null, ctx, indexes);
    if (!first) return null;
    if (branches.length === 1) return [first];
    const inherited = first.kind === "proficiency" ? first.minRank : null;
    const rest: PrereqAtom[] = [];
    for (const branch of branches.slice(1)) {
        const parsed = parseBranch(branch, inherited, ctx, indexes);
        if (!parsed) return null;
        rest.push(parsed);
    }
    return [{ kind: "or", any: [[first], ...rest.map((atom) => [atom])] }];
}

/** Names, heritage labels, and otherTags from the packs the sentence may mention. */
function contextFromDocuments(systemId: "pf2e" | "sf2e", documents: readonly CatalogDocument[]): ParseContext {
    const featNames = new Set<string>();
    const featureNames = new Set<string>();
    const heritageNames = new Set<string>();
    const tagged = new Map<string, { name: string; kind: "feat" | "feature" }[]>();
    for (const document of documents) {
        if (document.name.length === 0) continue;
        if (document.group === "feat") featNames.add(document.name);
        else featureNames.add(document.name);
        if (document.group === "heritage") heritageNames.add(document.name);
        const kind = document.group === "feat" ? "feat" : "feature";
        for (const tag of document.otherTags) {
            const list = tagged.get(tag) ?? [];
            list.push({ name: document.name, kind });
            tagged.set(tag, list);
        }
    }
    return { skills: skillLabels(systemId), featNames, featureNames, heritageNames, tagged };
}

/** One prerequisite sentence. A partial `or` is a single unparsed atom. */
function parseClause(value: string, ctx: ParseContext): PrereqAtom[] {
    const unparsed = (): PrereqAtom[] => [{ kind: "unparsed", text: value }];
    const text = value.trim().replace(/\s+/g, " ");
    if (text.length === 0) return unparsed();
    const indexes = indexesFor(ctx);

    const sense = parseSense(text);
    if (sense) return sense;

    const both = parseAndProficiency(text, ctx);
    if (both) return both;

    const facts = parseFactClause(text);
    if (facts) return facts;

    const attributes = parseAttributeList(text);
    if (attributes) return attributes;

    const missingSpeed = parseMissingSpeed(text);
    if (missingSpeed) return missingSpeed;

    const catalog =
        parseSkillMastery(text) ?? parseEitherOther(text, ctx) ?? parseAnotherOf(text) ?? parseYourChoice(text, ctx);
    if (catalog) return catalog;

    const joined = tryJoin(text, ctx, indexes);
    if (joined) return joined;

    return (
        parseBranches(text, ctx, indexes) ??
        parseLabeled(text, indexes) ??
        parseSharedSuffix(text, indexes) ??
        unparsed()
    );
}

export { PARSER_VERSION, contextFromDocuments, parseClause, skillLabels };
