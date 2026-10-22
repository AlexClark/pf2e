import { parseClause } from "./prereq-parser.ts";
import type { ParseContext, PrereqAtom, PrerequisiteClause } from "./types.ts";

interface CompileWarning {
    text: string;
}

interface CompileResult {
    atoms: PrereqAtom[][];
    warnings: CompileWarning[];
}

function clauseParsed(atoms: PrereqAtom[]): boolean {
    return atoms.every((atom) => atom.kind !== "unparsed");
}

/**
 * Three decisions, one per clause.
 * A custom list is kept only while `checkedFor` is the hash of the current sentence.
 * The hash function is passed in so this file does not import `node:crypto`.
 */
function compileClauses(
    clauses: PrerequisiteClause[],
    ctx: ParseContext,
    hash: (value: string) => string,
): CompileResult {
    const atoms: PrereqAtom[][] = [];
    const warnings: CompileWarning[] = [];

    for (const clause of clauses) {
        if (!clause.checked) {
            atoms.push(parseClause(clause.value, ctx));
            continue;
        }

        if (clause.checkedFor !== undefined && clause.checkedFor === hash(clause.value)) {
            atoms.push(clause.checked);
            continue;
        }

        const parsed = parseClause(clause.value, ctx);
        if (clauseParsed(parsed)) {
            atoms.push(parsed);
            continue;
        }

        atoms.push([{ kind: "unparsed", text: clause.value }]);
        warnings.push({ text: clause.value });
    }

    return { atoms, warnings };
}

export { compileClauses };
export type { CompileResult, CompileWarning };
