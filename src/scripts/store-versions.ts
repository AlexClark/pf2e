import { MigrationRunner } from "../module/migration/runner/index.ts";

/** Store the world system and schema versions for the first time */
export async function storeInitialWorldVersions(): Promise<void> {
    if (!game.user.hasRole(CONST.USER_ROLES.GAMEMASTER)) return;

    const storedSystemVersion = game.settings.storage.get("world").getItem(`${SYSTEM_ID}.worldSystemVersion`);
    if (!storedSystemVersion) {
        await game.settings.set(SYSTEM_ID, "worldSystemVersion", game.system.version);
    }

    // Actors created with system data but no recorded version stay at null and show up on every migration report.
    await stampUnversionedActors();

    const storedSchemaVersion = game.settings.storage.get("world").getItem(`${SYSTEM_ID}.worldSchemaVersion`);
    if (!storedSchemaVersion) {
        const minimumVersion = MigrationRunner.RECOMMENDED_SAFE_VERSION;
        const currentVersion =
            game.actors.size === 0
                ? game.settings.get(SYSTEM_ID, "worldSchemaVersion")
                : Math.max(
                      Math.min(...new Set(game.actors.map((actor) => actor.schemaVersion ?? minimumVersion))),
                      minimumVersion,
                  );
        await game.settings.set(SYSTEM_ID, "worldSchemaVersion", currentVersion);
    }
}

/** Persist the current schema version on actors that were saved without one. */
async function stampUnversionedActors(): Promise<void> {
    const version = MigrationRunner.LATEST_SCHEMA_VERSION;
    for (const actor of game.actors.filter((actor) => actor.schemaVersion === null)) {
        try {
            await actor.update({ "system._migration.version": version });
        } catch (error) {
            console.error(error);
        }
    }
}
