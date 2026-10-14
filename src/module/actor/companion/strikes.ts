import type { ActorPF2e } from "@actor";
import { AutomaticBonusProgression as ABP } from "@actor/character/automatic-bonus-progression.ts";
import { getAttackAmmo } from "@actor/character/helpers.ts";
import type { NPCStrike } from "@actor/npc/data.ts";
import { attackFromMeleeItem } from "@actor/helpers.ts";
import type { MeleeSource } from "@item/melee/data.ts";
import { MeleePF2e } from "@item";
import type { WeaponPF2e } from "@item";
import type { AttackRollParams } from "@system/rolls.ts";
import type { BuiltAttack } from "./progression.ts";
import type { CompanionPF2e } from "./document.ts";

function handCost(hands: "0" | "1" | "1+" | "2"): number {
    if (hands === "2") return 2;
    if (hands === "0") return 0;
    return 1;
}

function attackTraits(traits: string[]): string[] {
    const allowed = CONFIG.PF2E.npcAttackTraits;
    return traits.filter((trait) => trait in allowed);
}

function meleeSource(
    name: string,
    modifier: number,
    formula: string,
    damageType: string,
    traits: string[],
    range: number | null,
    linkedWeapon: string | null = null,
): MeleeSource {
    return {
        _id: fu.randomID(),
        name,
        type: "melee",
        img: `systems/${SYSTEM_ID}/icons/default-icons/melee.svg`,
        system: {
            action: "strike",
            bonus: { value: modifier },
            damageRolls: {
                [fu.randomID()]: { damage: formula, damageType, category: null },
            },
            traits: { value: attackTraits(traits), otherTags: [] },
            attackEffects: { value: [] },
            range: range && range > 0 ? { increment: range, max: null } : null,
            subjectToMAP: true,
        },
        flags: { [SYSTEM_ID]: linkedWeapon ? { linkedWeapon } : {} },
    } as unknown as MeleeSource;
}

/** A ranged weapon with expend blocks the strike until it has enough loaded ammo, then spends it. */
function useLoadedAmmo(strike: NPCStrike, weapon: WeaponPF2e<CompanionPF2e>): void {
    const actor = weapon.actor;
    if (!actor || strike.type !== "strike") return;
    const expend = weapon.system.expend ?? 0;
    const usesAmmo = expend > 0 && !!weapon.system.ammo && !weapon.system.ammo.builtIn;
    const ammos = [
        ...actor.itemTypes.ammo.filter((ammo) => !ammo.isStowed),
        ...actor.itemTypes.weapon.filter((candidate) => candidate.system.usage.canBeAmmo),
    ];
    strike.ammunition = getAttackAmmo(weapon, { ammos });

    if (!usesAmmo) return;
    for (const variant of strike.variants) {
        const roll = variant.roll;
        variant.roll = async (params: AttackRollParams = {}) => {
            if (!params.getFormula) {
                const loaded = weapon.ammo;
                const remaining = loaded?.isOfType("ammo")
                    ? loaded.uses.max > 1
                        ? loaded.uses.value
                        : loaded.quantity
                    : (loaded?.quantity ?? 0);
                if (expend > remaining) {
                    const message = remaining ? "PF2E.Strike.Ranged.InsufficientAmmo" : "PF2E.Strike.Ranged.NoAmmo";
                    ui.notifications.warn(_loc(message, { weapon: weapon.name, actor: actor.name }));
                    return null;
                }
            }
            const result = await roll(params);
            if (result && !params.getFormula) await weapon.consumeAmmo();
            return result;
        };
    }
    const first = strike.variants[0];
    if (first) strike.roll = strike.attack = first.roll;
}

function strikeFromSource(
    actor: CompanionPF2e,
    source: MeleeSource,
    weapon: WeaponPF2e<CompanionPF2e> | null = null,
): NPCStrike | null {
    // The constructor already prepares the item. A second prepareBaseData redefines flags.system.
    const item = new MeleePF2e(source, { parent: actor });
    item.prepareSiblingData();
    if (weapon) {
        item.category = weapon.category;
        item.group = weapon.group;
        item.baseType = weapon.baseType;
    }
    if (item.system.action !== "strike") return null;
    return attackFromMeleeItem(item as MeleePF2e<ActorPF2e>) as NPCStrike;
}

function naturalStrike(actor: CompanionPF2e, attack: BuiltAttack): NPCStrike | null {
    const traits = attack.traits.includes("unarmed") ? attack.traits : [...attack.traits, "unarmed"];
    const source = meleeSource(
        attack.name,
        attack.attackModifier,
        attack.damageFormula,
        attack.damageType,
        traits,
        attack.range,
    );
    return strikeFromSource(actor, source);
}

/** The stage's flat bonus is for unarmed attacks. ABP striking uses the dice already prepared on the weapon. */
function weaponStrike(actor: CompanionPF2e, weapon: WeaponPF2e<CompanionPF2e>): NPCStrike | null {
    const inherent = weapon._source.system.damage;
    const sourceDice = inherent.dice || 1;
    const dice = ABP.isEnabled(actor) ? Math.max(sourceDice, weapon.system.damage.dice || sourceDice) : sourceDice;
    const die = inherent.die ?? "d4";
    const damageType = inherent.damageType || "bludgeoning";
    const ranged = weapon.isRanged;
    const attribute = !ranged && weapon.traits.has("finesse") ? "dex" : ranged ? "dex" : "str";
    const ability = actor.system.abilities[attribute].mod;
    const rank = actor.attackRank;
    const level = actor.level;
    const proficiency = rank <= 0 ? 0 : level + 2 * rank;
    const modifier = proficiency + ability;
    const flat = ranged ? 0 : ability;
    const formula = flat === 0 ? `${dice}${die}` : flat > 0 ? `${dice}${die}+${flat}` : `${dice}${die}${flat}`;
    const traits = [...weapon.system.traits.value];
    const range = weapon.range?.increment ?? null;
    const source = meleeSource(weapon.name, modifier, formula, damageType, traits, range, weapon.id);
    const strike = strikeFromSource(actor, source, weapon);
    if (strike) useLoadedAmmo(strike, weapon);
    return strike;
}

/**
 * Natural attacks always strike. Held weapons spend the hands from Manual Dexterity.
 * Installed weapons spend integrated weapon mounts and do not use those hands.
 */
function prepareCompanionStrikes(actor: CompanionPF2e): NPCStrike[] {
    const built = actor.built;
    if (!built) return [];

    const strikes = built.attacks.flatMap((attack) => {
        const strike = naturalStrike(actor, attack);
        return strike ? [strike] : [];
    });

    let handsLeft = actor.hands;
    let mountsLeft = actor.mounts;
    for (const weapon of actor.itemTypes.weapon) {
        const cost = handCost(weapon.hands);
        if (weapon.carryType === "installed") {
            if (cost > mountsLeft) continue;
            mountsLeft -= cost;
        } else if (weapon.carryType === "held") {
            if (cost > handsLeft) continue;
            handsLeft -= cost;
        } else {
            continue;
        }
        const strike = weaponStrike(actor, weapon);
        if (strike) strikes.push(strike);
    }

    return strikes;
}

export { prepareCompanionStrikes };
