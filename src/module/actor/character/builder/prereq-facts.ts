import type { Size } from "@module/data.ts";
import { sluggify } from "@util/misc.ts";
import type { PrereqAtom, Rank, Tradition } from "./types.ts";

const TRADITIONS = ["arcane", "divine", "occult", "primal"] as const;
const RANKS: Record<string, Rank> = { trained: 1, expert: 2, master: 3, legendary: 4 };
const SIZES: Record<string, Size> = {
    tiny: "tiny",
    small: "sm",
    medium: "med",
    large: "lg",
    huge: "huge",
    gargantuan: "grg",
};
const NUMBER_WORDS: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
};
const CLASSES = new Set([
    "alchemist",
    "animist",
    "barbarian",
    "bard",
    "champion",
    "cleric",
    "commander",
    "druid",
    "envoy",
    "exemplar",
    "fighter",
    "guardian",
    "gunslinger",
    "inventor",
    "investigator",
    "kineticist",
    "magus",
    "mechanic",
    "monk",
    "mystic",
    "necromancer",
    "operative",
    "oracle",
    "psychic",
    "ranger",
    "rogue",
    "runesmith",
    "solarian",
    "soldier",
    "sorcerer",
    "summoner",
    "swashbuckler",
    "technomancer",
    "thaumaturge",
    "witch",
    "witchwarper",
    "wizard",
]);
const ACTIONS = new Map([
    ["shift skin", "Shift Skin"],
    ["envenom", "Envenom"],
    ["intercept attack", "Intercept Attack"],
    ["call companion", "Call Companion"],
    ["overclock gear", "Overclock Gear"],
    ["drain bonded item", "Drain Bonded Item"],
]);
const SPELL_TRAITS = new Set(["necromancy", "polymorph"]);

function plain(text: string): string {
    return text.trim().replace(/\.+$/, "").replace(/\s+/g, " ");
}

function tradition(value: string | undefined): Tradition | null {
    const lower = value?.toLowerCase();
    return lower && (TRADITIONS as readonly string[]).includes(lower) ? (lower as Tradition) : null;
}

function classSlugFor(name: string): string | null {
    const slug = sluggify(name);
    return CLASSES.has(slug) ? slug : null;
}

function namedTraditions(first: string | undefined, second: string | undefined): Tradition[] {
    return [tradition(first), tradition(second)].filter((value): value is Tradition => value !== null);
}

function countWord(value: string): number | null {
    const named = NUMBER_WORDS[value.toLowerCase()];
    if (named) return named;
    const numeric = Number(value);
    return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function asOr(atoms: PrereqAtom[]): PrereqAtom[] {
    if (atoms.length === 1) return atoms;
    return [{ kind: "or", any: atoms.map((atom) => [atom]) }];
}

function spellcasting(patch: Omit<Extract<PrereqAtom, { kind: "spellcasting" }>, "kind"> = {}): PrereqAtom {
    return { kind: "spellcasting", ...patch };
}

function selectionValue(text: string): string {
    const slug = sluggify(text);
    return slug === "claws" ? "claw" : slug;
}

function languageName(text: string): string | null {
    const name = text.trim().replace(/^(?:the|a|an)\s+/i, "");
    if (!/^[A-Za-z][A-Za-z' -]*$/.test(name) || !/[A-Z]/.test(name)) return null;
    if (name.split(/\s+/).length > 4) return null;
    const slug = sluggify(name);
    return slug.length > 0 ? slug : null;
}

function parseSize(text: string): PrereqAtom[] | null {
    const compared =
        /^(?:size )?(tiny|small|medium|large|huge|gargantuan)(?: size)? or (larger|smaller|greater)$/i.exec(text);
    if (compared?.[1] && compared[2]) {
        const size = SIZES[compared[1].toLowerCase()];
        if (!size) return null;
        const compare = compared[2].toLowerCase() === "smaller" ? "at-most" : "at-least";
        return [{ kind: "size", size, compare }];
    }
    const either = /^(tiny|small|medium|large|huge|gargantuan) or (tiny|small|medium|large|huge|gargantuan)(?: size)?$/i.exec(
        text,
    );
    if (either?.[1] && either[2]) {
        const left = SIZES[either[1].toLowerCase()];
        const right = SIZES[either[2].toLowerCase()];
        if (!left || !right) return null;
        return asOr([
            { kind: "size", size: left, compare: "exact" },
            { kind: "size", size: right, compare: "exact" },
        ]);
    }
    const exact = /^(?:size )?(tiny|small|medium|large|huge|gargantuan)(?: size)?$/i.exec(text);
    const size = exact?.[1] ? SIZES[exact[1].toLowerCase()] : null;
    return size ? [{ kind: "size", size, compare: "exact" }] : null;
}

function parseHands(text: string): PrereqAtom[] | null {
    const match = /^(?:you have )?(?:at least )?(\d+|two|three|four|five|six) or more hands$/i.exec(text);
    const min = match?.[1] ? countWord(match[1]) : null;
    return min ? [{ kind: "hands", min }] : null;
}

function parseClass(text: string): PrereqAtom[] | null {
    const match = /^you must be an? ([a-z][a-z -]+)$/i.exec(text);
    const slug = match?.[1] ? sluggify(match[1]) : "";
    return CLASSES.has(slug) ? [{ kind: "class", slug }] : null;
}

function parseClassHp(text: string): PrereqAtom[] | null {
    const match = /^class granting no more hit points per level than (\d+) \+ your constitution(?: modifier)?$/i.exec(
        text,
    );
    const max = match?.[1] ? Number(match[1]) : 0;
    return Number.isInteger(max) && max > 0 ? [{ kind: "class-hp", max }] : null;
}

function parseVersatile(text: string): PrereqAtom[] | null {
    return /^you have a versatile heritage$/i.test(text) ? [{ kind: "versatile" }] : null;
}

function parseKinetic(text: string): PrereqAtom[] | null {
    if (/^exactly one kinetic element$/i.test(text)) return [{ kind: "kinetic", min: 1, max: 1 }];
    if (/^two or more kinetic elements$/i.test(text)) return [{ kind: "kinetic", min: 2 }];
    return null;
}

function parseRecall(text: string): PrereqAtom[] | null {
    const match =
        /^(trained|expert|master|legendary) in (?:a recall knowledge skill|a skill (?:with|used to) (?:the )?recall knowledge(?: action)?|one or more lore skills|any lore skill)$/i.exec(
            text,
        );
    const minRank = match?.[1] ? RANKS[match[1].toLowerCase()] : undefined;
    if (!minRank) return null;
    const lore = /lore skill/i.test(text);
    return [{ kind: "proficiency", statistic: lore ? "any-lore" : "recall-knowledge", minRank }];
}

function parseCastingSkill(text: string): PrereqAtom[] | null {
    const patron = /^(trained|expert|master|legendary) in the skill associated with your patron's tradition$/i.exec(
        text,
    );
    const patronRank = patron?.[1] ? RANKS[patron[1].toLowerCase()] : undefined;
    if (patronRank) return [{ kind: "casting-skill", source: "patron", minRank: patronRank }];

    const match =
        /^(trained|expert|master|legendary) in (?:the skill associated with your patron's tradition|arcana, nature, occultism, or religion|arcana or religion|arcana or occultism),? depending on (?:your )?(bloodline|paradox|chosen tradition|patron's tradition)$/i.exec(
            text,
        );
    const minRank = match?.[1] ? RANKS[match[1].toLowerCase()] : undefined;
    if (!minRank || !match?.[2]) return null;
    const word = match[2].toLowerCase();
    const source = word === "paradox" ? "paradox" : word === "patron's tradition" ? "patron" : "bloodline";
    return [{ kind: "casting-skill", source, minRank }];
}

function parseLanguages(text: string): PrereqAtom[] | null {
    const count = /^you speak at least (\d+|one|two|three|four|five|six|seven|eight|nine|ten) languages$/i.exec(text);
    const min = count?.[1] ? countWord(count[1]) : null;
    if (min) return [{ kind: "language", min }];

    const spoken = /^you speak (.+)$/i.exec(text);
    if (spoken?.[1] && /^[A-Z]/.test(spoken[1])) {
        const slug = languageName(spoken[1]);
        if (slug) return [{ kind: "language", slug }];
    }

    // Spoken languages are proper names. "Viper programming language" is a class feature.
    if (/\b(programming|sign|body|specific)\b/i.test(text)) return null;
    const list = /^(.+) languages?$/i.exec(text);
    const body = list?.[1];
    if (!body) return null;
    const mode = body.includes(" or ") ? "or" : body.includes(" and ") ? "and" : "one";
    const parts = mode === "one" ? [body] : body.split(mode === "or" ? " or " : " and ");
    const atoms: PrereqAtom[] = [];
    for (const part of parts) {
        const slug = languageName(part);
        if (!slug) return null;
        atoms.push({ kind: "language", slug });
    }
    return mode === "or" ? asOr(atoms) : atoms;
}

function deitySlug(name: string): string | null {
    const cleaned = name.trim().replace(/^(?:the|a|an)\s+/i, "");
    if (!/^[A-Za-z][A-Za-z' -]*$/.test(cleaned)) return null;
    if (/\b(specific|aligned|deity|religion|patron)\b/i.test(cleaned)) return null;
    const slug = sluggify(cleaned);
    return slug.length > 0 ? slug : null;
}

function parseDeity(text: string): PrereqAtom[] | null {
    if (/^(?:you )?(?:don't|do not|can't|cannot) (?:worship|have) a (?:patron )?deity$/i.test(text)) {
        return [{ kind: "not", atom: { kind: "deity" } }];
    }
    if (/^(?:you )?(?:worship|follow) a deity$/i.test(text)) return [{ kind: "deity" }];

    const font =
        /^(?:worship |you worship )?a deity (?:with a divine font )?that grants (heal|harm)(?: divine font)?$/i.exec(
            text,
        ) ?? /^a? ?deity who grants (heal|harm) divine font$/i.exec(text);
    if (font?.[1] === "heal" || font?.[1] === "harm") return [{ kind: "deity", font: font[1] }];

    const sanctification =
        /^must worship a deity that lists ["']?(holy|unholy)["']? or ["']?(holy|unholy)["']? in (?:their|its) sanctification$/i.exec(
            text,
        );
    if (sanctification?.[1] && sanctification[2]) {
        return asOr([
            { kind: "deity", sanctification: sanctification[1].toLowerCase() as "holy" | "unholy" },
            { kind: "deity", sanctification: sanctification[2].toLowerCase() as "holy" | "unholy" },
        ]);
    }

    const pair = /^(?:a )?(?:worshipper|follower) of (.+) or (.+)$/i.exec(text);
    if (pair?.[1] && pair[2]) {
        const left = deitySlug(pair[1]);
        const right = deitySlug(pair[2]);
        if (!left || !right) return null;
        return asOr([
            { kind: "deity", slug: left },
            { kind: "deity", slug: right },
        ]);
    }
    const denied = /^(?:you are )?not a (?:worshipper|follower) of (.+)$/i.exec(text);
    if (denied?.[1]) {
        const slug = deitySlug(denied[1]);
        return slug ? [{ kind: "not", atom: { kind: "deity", slug } }] : null;
    }
    const named = /^deity is ([A-Z][A-Za-z' -]+)$/.exec(text);
    if (named?.[1]) {
        const slug = deitySlug(named[1]);
        return slug ? [{ kind: "deity", slug }] : null;
    }

    const one =
        /^(?:a )?(?:worshipper|follower) of (.+)$/i.exec(text) ??
        /^you (?:worship|follow) ([A-Z][A-Za-z' -]+)$/.exec(text);
    const slug = one?.[1] ? deitySlug(one[1]) : null;
    return slug ? [{ kind: "deity", slug }] : null;
}

function fontSelection(word: string): PrereqAtom | null {
    const lower = word.toLowerCase();
    if (lower === "healing font" || lower === "positive font") return { kind: "selection", key: "divineFont", value: "heal" };
    if (lower === "harmful font" || lower === "negative font") return { kind: "selection", key: "divineFont", value: "harm" };
    return null;
}

function parseFont(text: string): PrereqAtom[] | null {
    const pair = /^(healing font|harmful font|positive font|negative font) or (healing font|harmful font|positive font|negative font)$/i.exec(
        text,
    );
    if (pair?.[1] && pair[2]) {
        const left = fontSelection(pair[1]);
        const right = fontSelection(pair[2]);
        return left && right ? asOr([left, right]) : null;
    }
    const one = fontSelection(text);
    return one ? [one] : null;
}

function parseSelection(text: string): PrereqAtom[] | null {
    const ancestral = /^ancestral unarmed attack \((.+)\)$/i.exec(text);
    if (ancestral?.[1]) {
        const values = ancestral[1].split(/\s+or\s+/i).map(selectionValue).filter((value) => value.length > 0);
        if (values.length === 0) return null;
        return asOr(values.map((value) => ({ kind: "selection", key: "ancestralUnarmedAttack", value })));
    }
    const iruxi = /^iruxi armaments \((.+)\)$/i.exec(text);
    if (iruxi?.[1]) {
        const value = selectionValue(iruxi[1]);
        return value ? [{ kind: "selection", key: "iruxiArmaments", value }] : null;
    }
    return null;
}

function parseTradition(text: string): PrereqAtom[] | null {
    const connection = /^connection with (arcane|divine|occult|primal)(?: or (arcane|divine|occult|primal))? spellcasting$/i.exec(
        text,
    );
    if (connection?.[1]) {
        const traditions = namedTraditions(connection[1], connection[2]);
        return asOr(traditions.map((value) => ({ kind: "tradition", source: "mystic", tradition: value })));
    }
    const bloodline = /^bloodline th(?:at|e) grants (arcane|divine|occult|primal)(?: or (arcane|divine|occult|primal))? spells$/i.exec(
        text,
    );
    if (bloodline?.[1]) {
        const traditions = namedTraditions(bloodline[1], bloodline[2]);
        return asOr(traditions.map((value) => ({ kind: "tradition", source: "bloodline", tradition: value })));
    }
    const patron = /^(arcane|divine|occult|primal)(?: or (arcane|divine|occult|primal))? patron$/i.exec(text);
    if (patron?.[1]) {
        const traditions = namedTraditions(patron[1], patron[2]);
        return asOr(traditions.map((value) => ({ kind: "tradition", source: "witch", tradition: value })));
    }
    return null;
}

function spellSlug(name: string): { slug: string; source?: "focus" | "slot" | "repertoire" } | null {
    let source: "focus" | "slot" | "repertoire" | undefined;
    let text = name.trim().replace(/^(?:the|a|an)\s+/i, "");
    if (/^devotion spell \((.+)\)$/i.test(text)) {
        text = /^devotion spell \((.+)\)$/i.exec(text)?.[1] ?? "";
        source = "focus";
    }
    if (/ focus spell$/i.test(text)) {
        text = text.replace(/ focus spell$/i, "");
        source = "focus";
    }
    if (/ cantrip$/i.test(text)) text = text.replace(/ cantrip$/i, "");
    if (/ with a spell slot$/i.test(text)) {
        text = text.replace(/ with a spell slot$/i, "");
        source = "slot";
    }
    if (/ in your spell repertoire$/i.test(text)) {
        text = text.replace(/ in your spell repertoire$/i, "");
        source = "repertoire";
    }
    if (!/^[A-Za-z][A-Za-z' -]*$/.test(text)) return null;
    if (/\b(spell|spells|slot|slots|rank|from|using)\b/i.test(text)) return null;
    if (/^(?:ritual|rituals|counterspell)$/i.test(text)) return null;
    const slug = sluggify(text);
    if (!slug || slug === "spell" || slug === "spells") return null;
    return source ? { slug, source } : { slug };
}

function spellAtom(name: string): PrereqAtom | null {
    if (/^lay on hands$/i.test(name.trim())) return { kind: "spell", slug: "lay-on-hands", source: "focus" };
    const named = spellSlug(name);
    if (!named) return null;
    return named.source
        ? { kind: "spell", slug: named.slug, source: named.source }
        : { kind: "spell", slug: named.slug };
}

function traditionSpellcasting(body: string): PrereqAtom[] | null {
    const pair = /^(?:a |an )?(arcane|divine|occult|primal) or (arcane|divine|occult|primal) (?:innate )?spells?$/i.exec(
        body,
    );
    if (pair?.[1] && pair[2]) {
        const innate = /innate/i.test(body);
        const left = tradition(pair[1]);
        const right = tradition(pair[2]);
        if (!left || !right) return null;
        return asOr(
            innate
                ? [
                      { kind: "spell", source: "innate", tradition: left },
                      { kind: "spell", source: "innate", tradition: right },
                  ]
                : [spellcasting({ tradition: left }), spellcasting({ tradition: right })],
        );
    }
    const one = /^(?:a |an )?(arcane|divine|occult|primal) (?:innate )?spells?$/i.exec(body);
    const single = tradition(one?.[1]);
    if (!single) return null;
    return /innate/i.test(body)
        ? [{ kind: "spell", source: "innate", tradition: single }]
        : [spellcasting({ tradition: single })];
}

function parseCastBody(body: string): PrereqAtom[] | null {
    if (/^(?:spells from spell slots|spells using spell slots|spells from slots)$/i.test(body)) {
        return [spellcasting({ classFeature: true })];
    }
    if (/^focus spells$/i.test(body)) return [spellcasting({ focus: true })];
    if (/^spells$/i.test(body)) return [spellcasting()];
    const ranked =
        /^(?:at least )?(?:a )?(\d+)(?:st|nd|rd|th)[- ]rank(?: or higher)? spells(?: from spell slots)?$/i.exec(body);
    const min = ranked?.[1] ? Number(ranked[1]) : 0;
    if (min >= 1 && min <= 10) return [{ kind: "spell-rank", min }];

    const trait = /^at least one (necromancy|polymorph) spell$/i.exec(body);
    if (trait?.[1] && SPELL_TRAITS.has(trait[1].toLowerCase())) {
        return [{ kind: "spell", trait: trait[1].toLowerCase() }];
    }
    const innate = /^at least one (arcane|divine|occult|primal) innate spell$/i.exec(body);
    const innateTradition = tradition(innate?.[1]);
    if (innateTradition) return [{ kind: "spell", source: "innate", tradition: innateTradition }];

    const traditions = traditionSpellcasting(body);
    if (traditions) return traditions;

    if (body.includes(" or ") && !body.includes(" and ")) {
        const atoms = body.split(" or ").map(spellAtom);
        if (atoms.every((atom) => atom !== null)) return asOr(atoms);
        return null;
    }
    if (body.includes(" and ") && !body.includes(" or ")) {
        const atoms = body.split(" and ").map(spellAtom);
        if (atoms.every((atom) => atom !== null)) return atoms;
        return null;
    }
    const single = spellAtom(body);
    return single ? [single] : null;
}

function parseSpellcasting(text: string): PrereqAtom[] | null {
    if (/^you must have a class that casts spells with a spell repertoire$/i.test(text)) {
        return [spellcasting({ classFeature: true, spontaneous: true })];
    }
    if (
        /^you must have a class, such as clerics, druids, witches, and wizards, that prepares spells in spell slots using the same number of prepared spells per day$/i.test(
            text,
        )
    ) {
        return [spellcasting({ classFeature: true, prepared: true })];
    }
    if (/^casts spells with a spell repertoire$/i.test(text)) return [spellcasting({ spontaneous: true })];
    if (/^prepares spells in spell slots using the same number\b/i.test(text)) {
        return [spellcasting({ prepared: true })];
    }
    if (/^spell repertoire or ability to prepare spells$/i.test(text)) {
        return asOr([spellcasting({ spontaneous: true }), spellcasting({ prepared: true })]);
    }

    const feature =
        /^(?:you (?:have|must have) )?(?:a |an )?(spellcasting|spellcaster) class feature(?: that grants (arcane|divine|occult|primal) spells| that chooses spells from the (arcane|divine|occult|primal) spell list| with the (arcane|divine|occult|primal) tradition)?$/i.exec(
            text,
        );
    if (feature) {
        const chosen = tradition(feature[2]) ?? tradition(feature[3]) ?? tradition(feature[4]);
        return [chosen ? spellcasting({ classFeature: true, tradition: chosen }) : spellcasting({ classFeature: true })];
    }
    const featureOr =
        /^(?:you must have )?a spellcasting class feature that chooses spells from the (arcane|divine|occult|primal) or (arcane|divine|occult|primal) spell list$/i.exec(
            text,
        ) ??
        /^(?:you have )?a spellcasting class feature with the (arcane|divine|occult|primal) or (arcane|divine|occult|primal) tradition$/i.exec(
            text,
        );
    if (featureOr?.[1] && featureOr[2]) {
        const left = tradition(featureOr[1]);
        const right = tradition(featureOr[2]);
        if (!left || !right) return null;
        return asOr([
            spellcasting({ classFeature: true, tradition: left }),
            spellcasting({ classFeature: true, tradition: right }),
        ]);
    }

    const cast = /^(?:the )?(?:you(?:'re| are) able to cast|ability to cast|able to cast|you can cast|can cast) (.+)$/i.exec(
        text,
    );
    if (cast?.[1]) return parseCastBody(cast[1]);
    if (/^(?:at least one |(?:arcane|divine|occult|primal) (?:innate )?spells?$)/i.test(text)) {
        return parseCastBody(text);
    }
    if (/^(?:lay on hands|devotion spell \(lay on hands\))$/i.test(text)) {
        return [{ kind: "spell", slug: "lay-on-hands", source: "focus" }];
    }
    const repertoire = /^(.+) in your spell repertoire$/i.exec(text);
    if (repertoire?.[1]) {
        const named = spellAtom(`${repertoire[1]} in your spell repertoire`);
        return named ? [named] : null;
    }
    const focusSpell = /^(.+) focus spell$/i.exec(text);
    if (focusSpell?.[1] && !/^(?:ability|able|can)$/i.test(focusSpell[1])) {
        const named = spellAtom(`${focusSpell[1]} focus spell`);
        return named ? [named] : null;
    }
    return null;
}

function parseAction(text: string): PrereqAtom[] | null {
    const name = ACTIONS.get(text.toLowerCase());
    return name ? [{ kind: "action", name }] : null;
}

/** Closed sentences. A general "you are not a creature" rule would claim sentences the book does not mean. */
function parseClosedSentence(text: string): PrereqAtom[] | null {
    if (/^you(?:'re| are) not a fey$/i.test(text)) return [{ kind: "not", atom: { kind: "trait", trait: "fey" } }];
    if (/^living creature$/i.test(text)) {
        return [
            { kind: "not", atom: { kind: "trait", trait: "undead" } },
            { kind: "not", atom: { kind: "trait", trait: "construct" } },
        ];
    }
    if (/^any oracle mystery$/i.test(text)) return [{ kind: "tag", tag: "oracle-mystery" }];

    const denied = /^(?:you )?(?:can't|cannot) already use the (.+) action$/i.exec(text);
    const title = denied?.[1]?.trim();
    const words = title?.split(/\s+/) ?? [];
    if (title && words.length <= 3 && words.every((word) => /^[A-Z][A-Za-z'-]*$/.test(word))) {
        return [{ kind: "not", atom: { kind: "action", name: title } }];
    }
    return null;
}

/** A whole prerequisite sentence the repeated-fact grammar recognizes. */
function parseFactClause(value: string): PrereqAtom[] | null {
    const text = plain(value);
    if (text.length === 0) return null;
    return (
        parseClosedSentence(text) ??
        parseSize(text) ??
        parseHands(text) ??
        parseClass(text) ??
        parseClassHp(text) ??
        parseVersatile(text) ??
        parseKinetic(text) ??
        parseRecall(text) ??
        parseCastingSkill(text) ??
        parseLanguages(text) ??
        parseDeity(text) ??
        parseFont(text) ??
        parseSelection(text) ??
        parseTradition(text) ??
        parseSpellcasting(text) ??
        parseAction(text)
    );
}

/** One side of an `or` or `and`, when that side is itself a fact. */
function parseFactBranch(value: string): PrereqAtom | null {
    const parsed = parseFactClause(value);
    if (!parsed || parsed.length !== 1) return null;
    return parsed[0] ?? null;
}

export { classSlugFor, parseFactBranch, parseFactClause };
