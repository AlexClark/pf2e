import { compileClauses } from "@actor/character/builder/compile.ts";
import type { ParseContext, PrereqAtom } from "@actor/character/builder/types.ts";

const ctx: ParseContext = {
    skills: new Map([["arcana", "Arcana"]]),
    featNames: new Set<string>(),
    featureNames: new Set<string>(),
};

const hash = (value: string) => (value === "trained in Arcana" ? "arcana" : `hash:${value}`);

const trait: PrereqAtom[] = [{ kind: "trait", trait: "elf" }];

describe("compile clauses", () => {
    test("keeps a custom list while the sentence hash matches", () => {
        const compiled = compileClauses(
            [{ value: "trained in Arcana", checked: trait, checkedFor: "arcana" }],
            ctx,
            hash,
        );
        expect(compiled.atoms).toEqual([trait]);
        expect(compiled.warnings).toEqual([]);
    });

    test("an empty custom list imposes nothing", () => {
        const compiled = compileClauses(
            [{ value: "some flavor the builder ignores", checked: [], checkedFor: "hash:some flavor the builder ignores" }],
            ctx,
            hash,
        );
        expect(compiled.atoms).toEqual([[]]);
        expect(compiled.warnings).toEqual([]);
    });

    test("a changed sentence the parser understands is recompiled without a warning", () => {
        const compiled = compileClauses(
            [{ value: "trained in Arcana", checked: trait, checkedFor: "stale" }],
            ctx,
            hash,
        );
        expect(compiled.atoms).toEqual([[{ kind: "proficiency", statistic: "arcana", minRank: 1 }]]);
        expect(compiled.warnings).toEqual([]);
    });

    test("a missing hash is stale, and an unproved sentence drops the old atoms", () => {
        const compiled = compileClauses([{ value: "you have a familiar", checked: trait }], ctx, hash);
        expect(compiled.atoms).toEqual([[{ kind: "unparsed", text: "you have a familiar" }]]);
        expect(compiled.warnings).toEqual([{ text: "you have a familiar" }]);
    });

    test("an ordinary unparsed sentence is not a warning", () => {
        const compiled = compileClauses([{ value: "you have a familiar" }], ctx, hash);
        expect(compiled.atoms).toEqual([[{ kind: "unparsed", text: "you have a familiar" }]]);
        expect(compiled.warnings).toEqual([]);
    });
});
