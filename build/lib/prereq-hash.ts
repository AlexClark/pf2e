import { createHash } from "node:crypto";

/** SHA-256 hex of the UTF-8 prerequisite sentence. */
function hashPrerequisite(value: string): string {
    return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Drop the pack-build stamp so extract does not write it back to source JSON. */
function stripCompiledPrerequisites(system: { prerequisites?: { compiled?: unknown } | null }): void {
    if (!system.prerequisites) return;
    delete system.prerequisites.compiled;
}

export { hashPrerequisite, stripCompiledPrerequisites };
