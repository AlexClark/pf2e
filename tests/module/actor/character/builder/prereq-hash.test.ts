import { createHash } from "node:crypto";
import { hashPrerequisite, stripCompiledPrerequisites } from "../../../../../build/lib/prereq-hash.ts";

describe("prerequisite hash", () => {
    test("is the sha-256 hex of the utf-8 sentence", () => {
        const value = "trained in Arcana";
        const expected = createHash("sha256").update(Buffer.from(value, "utf8")).digest("hex");
        expect(hashPrerequisite(value)).toBe(expected);
        expect(hashPrerequisite("café")).toBe(createHash("sha256").update(Buffer.from("café", "utf8")).digest("hex"));
    });

    test("extract drops compiled and leaves the sentence", () => {
        const system = {
            prerequisites: {
                value: [{ value: "trained in Arcana" }],
                compiled: { version: 1, clauses: [[{ kind: "unparsed", text: "trained in Arcana" }]] },
            },
        };
        stripCompiledPrerequisites(system);
        expect(system.prerequisites).toEqual({ value: [{ value: "trained in Arcana" }] });
        expect("compiled" in system.prerequisites).toBe(false);
    });

    test("a feat with no prerequisites is left alone", () => {
        const system: { prerequisites?: { compiled?: unknown } } = {};
        stripCompiledPrerequisites(system);
        expect(system.prerequisites).toBeUndefined();
    });
});
