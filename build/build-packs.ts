import { compileClauses } from "@actor/character/builder/compile.ts";
import { contextFromDocuments, PARSER_VERSION } from "@actor/character/builder/prereq-parser.ts";
import type { CatalogDocument, PrereqAtom, PrerequisiteClause } from "@actor/character/builder/types.ts";
import type { FeatSource } from "@item/feat/data.ts";
import fs from "fs";
import path from "path";
import url from "url";
import yargs, { Argv } from "yargs";
import { CompendiumPack, PackError } from "./lib/compendium-pack.ts";
import { hashPrerequisite } from "./lib/prereq-hash.ts";
import type { PackEntry } from "./lib/types.ts";

const FEATURE_DIRECTORIES = new Set(["class-features", "ancestry-features", "heritages", "backgrounds", "classes"]);

function isFeatSource(entry: PackEntry): entry is FeatSource {
    return "type" in entry && entry.type === "feat";
}

function otherTagsOf(entry: PackEntry): string[] {
    const traits = (entry as { system?: { traits?: { otherTags?: unknown } } }).system?.traits?.otherTags;
    return Array.isArray(traits) ? traits.filter((tag): tag is string => typeof tag === "string") : [];
}

function catalogDocuments(packs: CompendiumPack[]): CatalogDocument[] {
    const documents: CatalogDocument[] = [];
    for (const pack of packs) {
        const group =
            pack.dirName === "feats"
                ? "feat"
                : pack.dirName === "heritages"
                  ? "heritage"
                  : FEATURE_DIRECTORIES.has(pack.dirName)
                    ? "feature"
                    : null;
        if (!group) continue;
        for (const entry of pack.data) {
            if (typeof entry.name !== "string" || entry.name.length === 0) continue;
            documents.push({ name: entry.name, group, otherTags: otherTagsOf(entry) });
        }
    }
    return documents;
}

interface GapRow {
    name: string;
    id: string;
    text: string;
}

/** One row per sentence the grammar still cannot prove. Ordinary misses are not console warnings. */
function writeGapFile(file: string, systemId: SystemId, rows: GapRow[]): void {
    const lines = [
        `# Prerequisite gaps (${systemId})`,
        "",
        `Unverified ${rows.length}.`,
        "",
        "These sentences are accepted as unverified. A predicate would invent a fact the character does not store, or the sentence leaves the choice open. Take stays allowed.",
        "",
    ];
    for (const row of rows) lines.push(`- ${row.name} (${row.id}): ${row.text}`);
    lines.push("");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, lines.join("\n"));
}

/** Stamp compiled atoms onto in-memory feats. Source files under packs/ are not opened for write. */
function compileFeatPrerequisites(packs: CompendiumPack[], systemId: SystemId, gapFile: string | undefined): void {
    const ctx = contextFromDocuments(systemId, catalogDocuments(packs));
    const gaps: GapRow[] = [];
    for (const pack of packs) {
        if (pack.documentName !== "Item") continue;
        for (const entry of pack.data) {
            if (!isFeatSource(entry)) continue;
            const clauses: PrerequisiteClause[] = entry.system.prerequisites.value.map((clause) => ({
                value: clause.value,
                checked: clause.checked as PrereqAtom[] | undefined,
                checkedFor: clause.checkedFor,
            }));
            const compiled = compileClauses(clauses, ctx, hashPrerequisite);
            entry.system.prerequisites.compiled = { version: PARSER_VERSION, clauses: compiled.atoms };
            for (const warning of compiled.warnings) {
                console.warn(`${entry.name} (${entry._id}): ${warning.text}`);
            }
            if (!gapFile) continue;
            for (const clause of compiled.atoms) {
                for (const atom of clause) {
                    if (atom.kind !== "unparsed" || !entry._id) continue;
                    gaps.push({ name: entry.name, id: entry._id, text: atom.text });
                }
            }
        }
    }
    if (gapFile) writeGapFile(gapFile, systemId, gaps);
}

const argv = yargs(process.argv.slice(2)) as Argv<{ system: SystemId; json: boolean; prereqGaps?: string }>;
const args = argv
    .command("$0 [system] [json]", "Build compendium packs into LevelDB databases or JSON assets", () => {
        argv.option("system", {
            describe: "The FVTT system for which to build packs",
            type: "string",
            choices: ["pf2e", "sf2e"],
            default: "pf2e",
        })
            .option("json", {
                describe: "Create JSON assets for translator distribution",
                type: "boolean",
                default: false,
            })
            .option("prereq-gaps", {
                describe: "Write still-unparsed prerequisite sentences to this file",
                type: "string",
            });
    })
    .help(false)
    .version(false)
    .parseSync();

const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
const inDir = path.resolve(__dirname, "..", "packs", args.system);
const outDir = path.resolve(__dirname, "..", "dist", args.system, "packs");
if (!args.json) {
    await fs.promises.rm(outDir, { recursive: true, force: true });
    await fs.promises.mkdir(outDir, { recursive: true });
}

// Loads all packs into memory for the sake of making all document name/id mappings available
const packs = fs.readdirSync(inDir).map((p) => CompendiumPack.loadJSON(p, { systemId: args.system }));
// After every pack is loaded, so the name index is complete. #finalize only persists this.
compileFeatPrerequisites(packs, args.system, args.prereqGaps);
const documentCounts = await Promise.all(packs.map((p) => p.save({ jsonArtifacts: args.json })));
const total = documentCounts.reduce((total, c) => total + c, 0);

if (documentCounts.length > 0) {
    console.log(`Created ${documentCounts.length} packs with ${total} documents.`);
} else {
    throw PackError("No data available to build packs.");
}
