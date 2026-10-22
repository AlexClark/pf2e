import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { compileClauses } from "@actor/character/builder/compile.ts";
import { contextFromDocuments } from "@actor/character/builder/prereq-parser.ts";
import type { CatalogDocument, ParseContext } from "@actor/character/builder/types.ts";

interface PackDocument {
    name?: string;
    type?: string;
    system?: {
        category?: string;
        prerequisites?: { value?: { value?: string }[] };
        traits?: { otherTags?: string[] };
    };
}

function jsonFiles(directory: string): string[] {
    return readdirSync(directory, { recursive: true })
        .filter((entry): entry is string => typeof entry === "string" && entry.endsWith(".json"))
        .filter((entry) => path.basename(entry) !== "_folders.json")
        .map((entry) => path.join(directory, entry));
}

function readDocument(file: string): PackDocument | null {
    try {
        return JSON.parse(readFileSync(file, "utf8")) as PackDocument;
    } catch {
        return null;
    }
}

function documentsIn(directory: string, group: CatalogDocument["group"]): CatalogDocument[] {
    const documents: CatalogDocument[] = [];
    for (const file of jsonFiles(directory)) {
        const document = readDocument(file);
        if (!document?.name) continue;
        const tags = document.system?.traits?.otherTags;
        documents.push({
            name: document.name,
            group,
            otherTags: Array.isArray(tags) ? tags.filter((tag) => typeof tag === "string") : [],
        });
    }
    return documents;
}

function contextFor(system: "pf2e" | "sf2e"): ParseContext {
    const root = path.join("packs", system);
    const documents = [
        ...documentsIn(path.join(root, "feats"), "feat"),
        ...documentsIn(path.join(root, "class-features"), "feature"),
        ...documentsIn(path.join(root, "ancestry-features"), "feature"),
        ...documentsIn(path.join(root, "heritages"), "heritage"),
        ...documentsIn(path.join(root, "backgrounds"), "feature"),
        ...documentsIn(path.join(root, "classes"), "feature"),
    ];
    return contextFromDocuments(system, documents);
}

function scan(system: "pf2e" | "sf2e"): { structured: number; warnings: number; empty: number; sample: string[] } {
    const ctx = contextFor(system);
    let structured = 0;
    let warnings = 0;
    let empty = 0;
    const sample: string[] = [];

    for (const file of jsonFiles(path.join("packs", system, "feats"))) {
        const document = readDocument(file);
        if (document?.type !== "feat") continue;
        const entries = document.system?.prerequisites?.value;
        const texts = Array.isArray(entries)
            ? entries.map((entry) => entry?.value ?? "").filter((text) => text.trim().length > 0)
            : [];
        if (texts.length === 0) {
            empty += 1;
            continue;
        }
        const compiled = compileClauses(
            texts.map((value) => ({ value })),
            ctx,
            () => "",
        );
        const unparsed = compiled.atoms.some((clause) => clause.some((atom) => atom.kind === "unparsed"));
        if (unparsed) {
            warnings += 1;
            if (sample.length < 12) sample.push(`${document.name}: ${texts.join(" | ")}`);
            continue;
        }
        structured += 1;
    }

    return { structured, warnings, empty, sample };
}

describe("feat pack scan", () => {
    test("pf2e and sf2e stay inside the grammar's count band", () => {
        const pf2e = scan("pf2e");
        const sf2e = scan("sf2e");
        expect(pf2e.structured, pf2e.sample.join("\n")).toBeGreaterThanOrEqual(3500);
        expect(pf2e.structured).toBeLessThan(3600);
        expect(pf2e.warnings).toBeLessThan(450);
        expect(sf2e.structured, sf2e.sample.join("\n")).toBeGreaterThanOrEqual(820);
        expect(sf2e.structured).toBeLessThan(860);
        expect(sf2e.warnings).toBeLessThan(85);
    }, 60_000);
});
