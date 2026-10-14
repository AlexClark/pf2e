import { CreaturePF2e, type ActorPF2e, type CharacterPF2e } from "@actor";
import type { Abilities, SkillData } from "@actor/creature/data.ts";
import { CreatureSaves } from "@actor/creature/saves.ts";
import type { CreatureUpdateCallbackOptions, Language } from "@actor/creature/types.ts";
import { Immunity, Resistance, Weakness } from "@actor/data/iwr.ts";
import { setImmunitiesFromTraits } from "@actor/creature/helpers.ts";
import { ActorSizePF2e } from "@actor/data/size.ts";
import { createEncounterRollOptions, setHitPointsRollOptions } from "@actor/helpers.ts";
import { ActorInitiative } from "@actor/initiative.ts";
import { Modifier } from "@actor/modifiers.ts";
import type { ApplyDamageParams } from "@actor/types.ts";
import { SAVE_TYPES } from "@actor/values.ts";
import type { DatabaseCreateCallbackOptions, DatabaseDeleteCallbackOptions } from "@common/abstract/_types.d.mts";
import type { ActorUUID } from "@common/documents/_module.d.mts";
import { ItemPF2e, type AbilityItemPF2e } from "@item";
import type { CompanionTypePF2e } from "@item/companion-type/document.ts";
import type { ItemType } from "@item/types.ts";
import type { CombatantPF2e, EncounterPF2e } from "@module/encounter/index.ts";
import type { ZeroToFour } from "@module/data.ts";
import type { RuleElement } from "@module/rules/index.ts";
import type { TokenDocumentPF2e } from "@scene";
import { Predicate } from "@system/predication.ts";
import { ArmorStatistic, HitPointsStatistic, Statistic } from "@system/statistic/index.ts";
import { objectHasKey, sluggify } from "@util";
import * as R from "remeda";
import type { CompanionSource, CompanionSystemData } from "./data.ts";
import { resolveCompanionGrants, type ResolvedCompanionGrants } from "./grants.ts";
import { PROFILES, stageLabel } from "./profiles.ts";
import { buildCompanion, type ProgressionResult, type SkillAdjustment } from "./progression.ts";
import { customizationSlots } from "./slots.ts";
import { prepareCompanionStrikes } from "./strikes.ts";
import {
    ABILITY_ABBRS,
    CUSTOMIZATION_GRADES,
    emptyAbilities,
    impliedStages,
    type CompanionSize,
    type CompanionTypeInput,
    type CompanionSpeed,
    type CompanionStage,
    type CustomizationGrade,
    type StoredTrack,
} from "./values.ts";

const GRADE_TAGS: CustomizationGrade[] = ["commercial", "tactical", "advanced", "superior"];

/** The owned Drone feature still counts when it was copied before CompanionGrant existed. */
function masterProvidesDrone(master: CharacterPF2e | null): boolean {
    if (!master) return false;
    if (master.synthetics.companionGrants.some((grant) => grant.role === "drone")) return true;
    return master.itemTypes.feat.some((feat) => {
        const slug = feat.slug ?? sluggify(feat.name);
        if (slug !== "drone") return false;
        const tags = feat.system.traits?.otherTags ?? [];
        return feat.category === "classfeature" || tags.includes("mechanic-exocortex");
    });
}

function robotCompanions(master: CharacterPF2e): CompanionPF2e[] {
    return game.actors.filter(
        (actor): actor is CompanionPF2e<null> =>
            actor.isOfType("companion") && actor.system.master.id === master.id && actor.system.profile === "robot",
    );
}

function refreshMasterSheet(master: CharacterPF2e | null): void {
    if (!master || !game.ready) return;
    queueMicrotask(() => {
        master.reset();
        if (master.sheet.rendered) master.sheet.render(false);
    });
}

class CompanionPF2e<TParent extends TokenDocumentPF2e | null = TokenDocumentPF2e | null> extends CreaturePF2e<TParent> {
    /** Prepared during data prep. Initializers would run after `super()` and wipe that work. */
    declare built: ProgressionResult | null;

    declare resolved: ResolvedCompanionGrants | null;

    declare attackRank: ZeroToFour;

    /** Hands granted by Manual Dexterity. Mounts are separate. */
    declare hands: number;

    declare mounts: number;

    declare independent: boolean;

    declare slots: Record<CustomizationGrade, number>;

    /** Book totals before a typed cap replaces them. */
    declare bookSlots: Record<CustomizationGrade, number>;

    /** Customization ids past the current cap. They stay on the sheet. */
    declare inactiveIds: Set<string>;

    /** Set while the advanced maneuver is being added or removed. */
    declare syncing: boolean;

    static async createFor(master: CharacterPF2e): Promise<CompanionPF2e | null> {
        const name = game.i18n.localize("TYPES.Actor.companion");
        const created = await this.create({
            name,
            type: "companion",
            img: `systems/${SYSTEM_ID}/icons/default-icons/companion.svg`,
            folder: master.folder?.id ?? null,
            ownership: fu.deepClone(master.ownership),
            system: {
                master: { id: master.id },
                active: master.companions.length === 0,
            },
            prototypeToken: {
                actorLink: true,
                sight: { enabled: true },
                disposition: master.prototypeToken.disposition,
                name,
            },
        });
        return created?.isOfType("companion") ? created : null;
    }

    override get allowedItemTypes(): (ItemType | "physical")[] {
        return [...super.allowedItemTypes, "action", "companionType", "physical", "melee", "lore"];
    }

    override get abilities(): Abilities {
        return this.system.abilities;
    }

    /** The owning character. Linking happens when that character prepares, not from this getter. */
    get master(): CharacterPF2e | null {
        const id = this.system.master.id;
        if (!id) return null;
        const master = game.actors.get(id);
        return master?.isOfType("character") ? master : null;
    }

    /** The owned type item. Compendium documents are not loaded during prepare. */
    get typeItem(): CompanionTypePF2e<this> | null {
        // itemTypes is filled in prepareEmbeddedDocuments, after system prepareBaseData.
        return this.itemTypes?.companionType?.find((item) => item.system.kind === "type") ?? null;
    }

    get role(): "" | "drone" {
        return this.resolved ? this.resolved.role : this.system.role;
    }

    /** Robot companions use the master's class DC. */
    get companionDC(): number | null {
        if (this.system.profile !== "robot") return null;
        return this.master?.classDC?.dc.value ?? null;
    }

    override get combatant(): CombatantPF2e<EncounterPF2e> | null {
        return this.master?.combatant ?? null;
    }

    override get isDead(): boolean {
        if (this.system.destroyed) return true;
        if (this.system.profile === "robot") return this.statuses.has("dead");
        return super.isDead;
    }

    override get canAct(): boolean {
        if (this.system.shutdown || this.system.destroyed) return false;
        if (this.system.profile === "robot" && this.hasCondition("broken")) return false;
        return super.canAct;
    }

    override reset({ fromMaster = false } = {}): void {
        super.reset();
        if (fromMaster) this.sheet.render(false);
    }

    override prepareBaseData(): void {
        super.prepareBaseData();
        this.built = null;
        this.resolved = null;
        this.attackRank = 1;
        this.hands = 0;
        this.mounts = 0;
        this.independent = false;
        this.slots = { commercial: 0, tactical: 0, advanced: 0, superior: 0 };
        this.bookSlots = { commercial: 0, tactical: 0, advanced: 0, superior: 0 };
        this.inactiveIds = new Set();
        this.skills ??= {};

        this.suppressItemBonuses();
        this.system.resources.investiture = { value: 0, max: 2 };

        for (const [slug, data] of Object.entries(CONFIG.PF2E.skills)) {
            this.system.skills[slug] ??= {
                attribute: data.attribute,
                lore: false,
                itemId: null,
            } as SkillData & { rank: ZeroToFour };
        }

        const master = this.master;
        if (master) {
            this.flags[SYSTEM_ID].rollOptions.all = fu.mergeObject(
                this.flags[SYSTEM_ID].rollOptions.all,
                createEncounterRollOptions(master),
            );
        }
    }

    /** Items are indexed by the time this runs, and rule elements run inside super. */
    protected override prepareDataFromItems(): void {
        this.applyTypeItem();
        this.applySpeeds();
        this.applyRobotDefenses();
        this.refreshProgression();
        this.markInactive();
        super.prepareDataFromItems();
    }

    protected override prepareRuleElements(): RuleElement[] {
        if (!this.master) return [];
        return super.prepareRuleElements().filter((rule) => !this.inactiveIds.has(rule.item.id));
    }

    override prepareDerivedData(): void {
        this.refreshProgression();
        const built = this.built;
        if (built) {
            for (const key of ABILITY_ABBRS) {
                const override = this.system.abilityOverrides[key];
                this.system.abilities[key].mod = typeof override === "number" ? override : built.abilities[key];
            }
            this.system.traits.size = new ActorSizePF2e({ value: built.size });
            const known = (language: string): language is Language => objectHasKey(CONFIG.PF2E.languages, language);
            const granted = built.languages.filter(known);
            const stored = this._source.system.details.languages.value.filter(known);
            this.system.details.languages.value = R.unique([...granted, ...stored]);
            for (const trait of built.extraTraits) {
                if (objectHasKey(CONFIG.PF2E.creatureTraits, trait) && !this.system.traits.value.includes(trait)) {
                    this.system.traits.value.push(trait);
                }
            }
            this.setRollOptions(built);
        }

        super.prepareDerivedData();
        if (!built) {
            this.prepareInitiative();
            return;
        }

        game.pf2e.variantRules.AutomaticBonusProgression.applyToCompanion(this);

        const hitPoints = new HitPointsStatistic(this, { baseMax: built.hpMax });
        this.system.attributes.hp = hitPoints.getTraceData();
        setHitPointsRollOptions(this);

        const armorStatistic = new ArmorStatistic(this, { rank: this.rank(built.ranks.unarmored) });
        this.armorClass = armorStatistic.dc;
        this.system.attributes.ac = fu.mergeObject(armorStatistic.getTraceData(), { attribute: "dex" });

        this.prepareSaves(built);
        this.system.perception.rank = this.rank(built.ranks.perception, this.system.perception.rank ?? 0);
        this.preparePerception();
        this.system.perception = Object.assign(this.perception.getTraceData(), { rank: this.system.perception.rank });
        this.prepareSkills(built);

        if (built.racer) this.addRacerBonus();
        this.prepareMovementData();

        this.attackRank = this.rank(built.ranks.unarmed, 1);
        const strikes = prepareCompanionStrikes(this);
        this.system.actions = strikes;
        this.prepareInitiative();
    }

    private prepareInitiative(): void {
        this.initiative = new ActorInitiative(this, {
            statistic: this.system.initiativeStatistic || "perception",
            tiebreakPriority: this.hasPlayerOwner ? 2 : 1,
        });
    }

    async setCompanionType(uuid: string): Promise<void> {
        const existing = this.itemTypes.companionType.filter((item) => item.system.kind === "type");
        if (existing.length) {
            await this.deleteEmbeddedDocuments(
                "Item",
                existing.map((item) => item.id),
            );
        }
        if (!uuid) {
            await this.update({ "system.typeUuid": "" });
            return;
        }
        const doc = await fromUuid(uuid);
        if (!(doc instanceof ItemPF2e) || !doc.isOfType("companionType") || doc.system.kind !== "type") return;
        await this.createEmbeddedDocuments("Item", [doc.toObject()]);
        await this.update({ "system.typeUuid": uuid });
    }

    async toggleSupport(): Promise<void> {
        const master = this.master;
        if (!master) return;
        const existing = master.itemTypes.effect.find(
            (effect) => effect.getFlag(SYSTEM_ID, "companionSupport") === this.id,
        );
        if (existing) {
            await existing.delete();
            return;
        }
        await master.createEmbeddedDocuments("Item", [
            {
                name: `${this.name} (${game.i18n.localize("PF2E.Companion.Support")})`,
                type: "effect",
                img: `systems/${SYSTEM_ID}/icons/default-icons/effect.svg`,
                system: {
                    duration: { value: 1, unit: "rounds", expiry: "turn-start", sustained: false },
                    rules: [{ key: "Note", selector: "strike-damage", text: this.typeItem?.system.support ?? "" }],
                },
                flags: { [SYSTEM_ID]: { companionSupport: this.id } },
            },
        ]);
    }

    /** Sheet button. Sets the companion to 1 HP and clears shutdown. */
    async reboot(): Promise<void> {
        if (!this.system.shutdown || this.system.destroyed) return;
        await this.update({ "system.attributes.hp.value": 1, "system.shutdown": false });
    }

    /** Daily preparation for a drone, or a manual repair. Does not restore a destroyed companion. */
    async repairToFull(): Promise<void> {
        if (this.system.destroyed) return;
        await this.update({ "system.attributes.hp.value": this.hitPoints?.max ?? 1, "system.shutdown": false });
    }

    /** Grant or remove the type's advanced maneuver outside of data preparation. */
    async syncAdvancedManeuver(): Promise<void> {
        if (this.syncing) return;
        const uuid = this.typeItem?.system.advancedManeuver;
        if (!uuid) return;
        const existing = this.items.find((item) => item.sourceId === uuid);
        const wanted = !!this.built?.advancedManeuver;
        if (wanted === !!existing) return;
        this.syncing = true;
        try {
            if (wanted) {
                const source = await fromUuid(uuid);
                if (source instanceof ItemPF2e) await this.createEmbeddedDocuments("Item", [source.toObject()]);
            } else if (existing) {
                await existing.delete();
            }
        } finally {
            this.syncing = false;
        }
    }

    override async applyDamage(params: ApplyDamageParams): Promise<this> {
        if (this.system.shutdown || this.system.destroyed) return this;
        const before = this.hitPoints?.value ?? 0;
        await super.applyDamage(params);
        if (this.system.profile !== "robot" || before <= 0 || (this.hitPoints?.value ?? 0) > 0) return this;

        if (this.role === "drone") {
            await this.update({ "system.shutdown": true });
            return this;
        }

        await this.increaseCondition("broken");
        const now = game.time.worldTime;
        const recent = [...this.system.brokenAt, now].filter((time) => now - time <= 600);
        await this.update({ "system.brokenAt": recent, "system.destroyed": recent.length >= 3 });
        return this;
    }

    stageName(stage: CompanionStage = this.built?.stage ?? this.system.stage): string {
        const advanced = this.built?.advanced ?? this.storedTrack();
        return stageLabel(this.system.profile, stage, advanced, SYSTEM_ID);
    }

    private refreshProgression(): void {
        const profile = this.system.profile;
        const grants = this.master?.synthetics.companionGrants ?? [];
        const resolved = resolveCompanionGrants(grants, profile, this.system.advanced);
        resolved.role = this.effectiveDroneRole(resolved.role);
        this.resolved = resolved;
        const stage = !this.system.manual.stage && resolved.stage ? resolved.stage : this.system.stage;
        const advanced = this.track(stage, resolved.advanced);
        const specializations =
            !this.system.manual.specializations && resolved.specializations.length
                ? resolved.specializations
                : this.system.specializations;
        const role = resolved.role;
        this.independent = resolved.independent;
        const book = customizationSlots(profile, stage, role, resolved.extraSlots);
        this.bookSlots = book;
        const slots = { ...book };
        for (const grade of CUSTOMIZATION_GRADES) {
            const override = this.system.slotOverrides[grade];
            if (typeof override === "number") slots[grade] = override;
        }
        this.slots = slots;

        const active = this.activeCustomizations();
        const slugs = new Set(active.map((feat) => feat.slug ?? sluggify(feat.name)));
        const inputType = this.typeInput();
        if (slugs.has("mount")) inputType.mount = true;
        this.built = buildCompanion({
            profile,
            level: this.system.details.level.value,
            stage,
            advanced,
            specializations,
            type: inputType,
            sizeChoice: this.sizeChoice(inputType),
            grow: this.system.grow,
            hpPerLevel: slugs.has("hardened-chassis") ? 8 : PROFILES[profile].hpPerLevel,
            sapient: slugs.has("sapient"),
            artificialPersonality: slugs.has("artificial-personality"),
            glowUp: slugs.has("glow-up"),
            skillAdjustments: this.skillAdjustments(active),
        });
        this.hands = slugs.has("manual-dexterity") ? 2 : 0;
        this.mounts = active.filter((feat) => (feat.slug ?? sluggify(feat.name)) === "integrated-weapon-mount").length;
        this.addUploadLanguages(active);
        this.attackRank = this.rank(this.built.ranks.unarmed, 1);
    }

    /**
     * A hand-set Drone box wins, including when it is cleared.
     * Otherwise a stored drone stays a drone, and the only robot of a drone mechanic is the drone.
     * The stored role is left alone here.
     */
    private effectiveDroneRole(grantRole: "" | "drone"): "" | "drone" {
        if (this.system.profile !== "robot") return "";
        if (this.system.manual.role) return this.system.role;
        if (this.system.role === "drone") return "drone";
        const master = this.master;
        const provided = grantRole === "drone" || masterProvidesDrone(master);
        if (!provided || !master) return "";
        return robotCompanions(master).length <= 1 ? "drone" : "";
    }

    /** Agility or power forces the track. A stored choice is kept for when the stage drops back. */
    private track(stage: CompanionStage, grantTrack: StoredTrack): StoredTrack {
        if (stage === "agility" || stage === "power") return stage;
        const chosen = this.chosenTrack(grantTrack);
        if (stage !== "specialized") return chosen;
        return chosen === "agility" || chosen === "power" ? chosen : "agility";
    }

    private chosenTrack(grantTrack: StoredTrack): StoredTrack {
        if (!this.system.manual.advanced && (grantTrack === "agility" || grantTrack === "power")) return grantTrack;
        return this.system.advanced;
    }

    private storedTrack(): StoredTrack {
        const stage = this.built?.stage ?? this.system.stage;
        if (stage === "agility" || stage === "power") return stage;
        return this.built?.advanced ?? (this.system.advanced || "agility");
    }

    private typeInput(): CompanionTypeInput {
        const item = this.typeItem;
        if (!item?.isOfType("companionType")) {
            return {
                sizes: ["sm"],
                abilities: emptyAbilities(),
                ancestryHp: 6,
                attacks: [],
                skills: [],
                speeds: { land: 25 },
            };
        }
        const system = item.system;
        const speeds: Partial<Record<CompanionSpeed, number>> = {};
        for (const key of ["land", "burrow", "climb", "fly", "swim"] as const) {
            if (system.speeds[key] > 0 || key === "land") speeds[key] = system.speeds[key];
        }
        if (system.imitator) {
            return {
                sizes: ["sm", "med"],
                abilities: system.abilities,
                ancestryHp: system.ancestryHp,
                attacks: this.system.imitator.attack
                    ? [
                          {
                              slug: sluggify(this.system.imitator.attack),
                              name: this.system.imitator.attack,
                              damage: { dice: 1, die: "d6", type: "bludgeoning" },
                              traits: ["unarmed"],
                          },
                      ]
                    : [],
                skills: system.skills,
                speeds: { land: this.system.imitator.speed },
                imitator: true,
            };
        }
        return {
            sizes: system.sizes.length ? system.sizes : ["sm"],
            abilities: system.abilities,
            ancestryHp: system.ancestryHp,
            attacks: system.attacks.map((attack) => ({
                slug: attack.slug,
                name: attack.name,
                damage: attack.damage,
                traits: attack.traits,
                range: attack.range,
            })),
            skills: system.skills,
            senses: system.senses,
            speeds,
            traits: system.creatureTraits,
            replacesCreatureTrait: system.replacesCreatureTrait,
            mount: system.mount,
        };
    }

    private sizeChoice(type: CompanionTypeInput): CompanionSize | null {
        const choice = (this.typeItem?.system.imitator ? this.system.imitator.size : this.system.sizeChoice) || "";
        return type.sizes.includes(choice as CompanionSize) ? (choice as CompanionSize) : null;
    }

    /** Owned customizations. Familiar abilities are a different action category and are ignored. */
    private customizations(): AbilityItemPF2e<this>[] {
        return (this.itemTypes?.action ?? []).filter((action) => action.system.category === "customization");
    }

    private activeCustomizations(): AbilityItemPF2e<this>[] {
        return this.customizations().filter((action) => !this.inactiveIds.has(action.id));
    }

    private skillAdjustments(customizations: AbilityItemPF2e<this>[]): SkillAdjustment[] {
        const adjustments: SkillAdjustment[] = [];
        for (const customization of customizations) {
            const slug = customization.slug ?? sluggify(customization.name);
            const selected = this.selectedSkill(customization);
            if (slug === "skill-module" && selected) adjustments.push({ skill: selected, mode: "floor", rank: 1 });
            if (slug === "expertise-module" && selected) adjustments.push({ skill: selected, mode: "floor", rank: 2 });
            if (slug === "camouflage") adjustments.push({ skill: "stealth", mode: "upgrade" });
            if (slug === "agility-optimization") adjustments.push({ skill: "acrobatics", mode: "upgrade" });
        }
        return adjustments;
    }

    private selectedSkill(customization: AbilityItemPF2e<this>): string {
        const selections = customization.flags[SYSTEM_ID]?.rulesSelections as Record<string, unknown> | undefined;
        const skill = selections?.skill;
        return typeof skill === "string" ? skill : "";
    }

    /** Profile traits are already set. The type item can replace one and add its own. */
    private applyTypeItem(): void {
        const typeItem = this.typeItem;
        const profile = PROFILES[this.system.profile] ?? PROFILES.animal;
        const replaced = typeItem?.system.replacesCreatureTrait || null;
        const traits = profile.traits.filter((trait) => trait !== replaced);
        if (replaced) traits.unshift(replaced);
        for (const trait of typeItem?.system.creatureTraits ?? []) {
            if (!traits.includes(trait)) traits.push(trait);
        }
        this.system.traits.value = traits as typeof this.system.traits.value;
        this.system.traits.rarity = typeItem?.system.rarity ?? "common";

        const abilities = typeItem?.system.abilities;
        if (abilities) {
            for (const key of ABILITY_ABBRS) this.system.abilities[key].mod = abilities[key];
        }

        const senses = (typeItem?.system.senses ?? []).map((sense) => {
            const unlimited = sense.type === "low-light-vision" || sense.type === "darkvision";
            return {
                type: sense.type,
                acuity: sense.acuity || (unlimited ? "precise" : "imprecise"),
                range: unlimited ? Infinity : sense.range,
                source: null,
            };
        });
        if (senses.length === 0) {
            senses.push({ type: "low-light-vision", acuity: "precise", range: Infinity, source: null });
        }
        this.system.perception.senses = senses as typeof this.system.perception.senses;
        setImmunitiesFromTraits(this);
    }

    private markInactive(): void {
        this.inactiveIds ??= new Set();
        this.inactiveIds.clear();
        const customizations = this.customizations()
            .slice()
            .sort((a, b) => a.sort - b.sort);
        const counted = new Map<CustomizationGrade, number>();
        for (const grade of CUSTOMIZATION_GRADES) counted.set(grade, 0);
        for (const feat of customizations) {
            const tags = feat.system.traits?.otherTags ?? [];
            const grade = GRADE_TAGS.find((tag) => tags.includes(tag));
            if (!grade) continue;
            const used = counted.get(grade) ?? 0;
            if (used >= this.slots[grade]) this.inactiveIds.add(feat.id);
            else counted.set(grade, used + 1);
        }
    }

    private applySpeeds(): void {
        const source = this.typeItem?.isOfType("companionType") ? this.typeItem.system.speeds : null;
        const imitator = this.typeItem?.isOfType("companionType") && this.typeItem.system.imitator;
        const speeds = this.system.movement.speeds;
        const land = imitator ? this.system.imitator.speed : (source?.land ?? 25);
        speeds.land.base = land;
        speeds.land.value = land;
        for (const key of ["burrow", "climb", "fly", "swim"] as const) {
            const value = imitator ? 0 : (source?.[key] ?? 0);
            if (value > 0) speeds[key] = { value, base: value } as (typeof speeds)["climb"];
            else speeds[key] = null;
        }
    }

    private applyRobotDefenses(): void {
        if (this.system.profile === "robot") {
            const immunities = this.attributes.immunities;
            if (!immunities.some((immunity) => immunity.type === "mental")) {
                immunities.push(new Immunity({ type: "mental", source: _loc("PF2E.TraitConstruct") }));
            }
            const value = Math.ceil(this.level / 2);
            if (value > 0 && !this.attributes.weaknesses.some((weakness) => weakness.type === "electricity")) {
                this.attributes.weaknesses.push(
                    new Weakness({ type: "electricity", value, source: _loc("PF2E.TraitConstruct") }),
                );
            }
        }
        this.applyTypeResistances();
    }

    /** Type resistances apply to every profile. Half level is at least 1 once the companion has a level. */
    private applyTypeResistances(): void {
        const item = this.typeItem;
        if (!item?.isOfType("companionType")) return;
        const source = item.name || _loc("PF2E.Companion.Type");
        for (const resistance of item.system.resistances) {
            const amount =
                resistance.formula === "half-level"
                    ? this.level > 0
                        ? Math.max(1, Math.floor(this.level / 2))
                        : 0
                    : Number(resistance.formula);
            if (!Number.isFinite(amount) || amount <= 0) continue;
            if (!objectHasKey(CONFIG.PF2E.resistanceTypes, resistance.type)) continue;
            if (this.attributes.resistances.some((existing) => existing.type === resistance.type)) continue;
            this.attributes.resistances.push(new Resistance({ type: resistance.type, value: amount, source }));
        }
    }

    /** Item bonuses apply to AC and Speed only. AC item bonuses cap at +3. */
    private suppressItemBonuses(): void {
        const isItemBonus = new Predicate(["bonus:type:item"]);
        const selectors = [
            "attack",
            "attack-roll",
            "strike-attack-roll",
            "damage",
            "strike-damage",
            "skill-check",
            "saving-throw",
            "perception",
            "fortitude",
            "reflex",
            "will",
            ...Object.keys(CONFIG.PF2E.skills),
        ];
        for (const selector of selectors) {
            const adjustments = (this.synthetics.modifierAdjustments[selector] ??= []);
            adjustments.push({ slug: null, test: (options) => isItemBonus.test(options), suppress: true });
        }
        const ac = (this.synthetics.modifierAdjustments.ac ??= []);
        ac.push({
            slug: null,
            test: (options) => isItemBonus.test(options),
            getNewValue: (current) => Math.min(current, 3),
        });
    }

    private setRollOptions(built: ProgressionResult): void {
        const options = this.rollOptions.all;
        options[`self:companion:${this.system.profile}`] = true;
        if (this.role === "drone") options["self:companion:drone"] = true;
        for (const stage of impliedStages(built.stage, built.advanced)) {
            options[`self:companion:stage:${stage}`] = true;
        }
        const grantedSpecs = this.resolved?.specializations ?? [];
        const specs =
            !this.system.manual.specializations && grantedSpecs.length
                ? grantedSpecs
                : built.stage === "specialized"
                  ? this.system.specializations
                  : [];
        for (const specialization of specs) {
            options[`self:companion:specialization:${specialization}`] = true;
        }
        const master = this.master;
        if (master) options[`self:master:id:${master.id}`] = true;
        if (
            this.typeItem?.system.mount ||
            this.activeCustomizations().some((action) => (action.slug ?? sluggify(action.name)) === "mount")
        ) {
            options["self:companion:mount"] = true;
        }
    }

    /** Linguistic Upload stores two language slugs. They apply only while the customization is active. */
    private addUploadLanguages(customizations: AbilityItemPF2e<this>[]): void {
        if (!this.built) return;
        for (const customization of customizations) {
            if ((customization.slug ?? sluggify(customization.name)) !== "linguistic-upload") continue;
            const selections = customization.flags[SYSTEM_ID]?.rulesSelections as Record<string, unknown> | undefined;
            for (const key of ["first", "second"]) {
                const language = selections?.[key];
                if (typeof language === "string" && language && !this.built.languages.includes(language)) {
                    this.built.languages.push(language);
                }
            }
        }
    }

    private prepareSaves(built: ProgressionResult): void {
        const saves = R.mapToObj(SAVE_TYPES, (save) => {
            const statistic = new Statistic(this, {
                slug: save,
                label: _loc(CONFIG.PF2E.saves[save]),
                attribute: CONFIG.PF2E.savingThrowDefaultAttributes[save],
                rank: this.rank(built.ranks.saves[save]),
                domains: [save, "saving-throw", "all"],
                check: { type: "saving-throw" },
            });
            return [save, statistic] as const;
        });
        this.saves = new CreatureSaves(saves);
        // getTraceData() omits rank. The sidebar pill reads it, the same way skills and perception do.
        this.system.saves = R.mapToObj(SAVE_TYPES, (save) => [
            save,
            Object.assign(this.saves[save].getTraceData(), { rank: this.saves[save].rank }),
        ]);
    }

    private prepareSkills(built: ProgressionResult): void {
        const floors = new Map<string, number>();
        for (const adjustment of this.skillAdjustments(this.activeCustomizations())) {
            const current = floors.get(adjustment.skill) ?? 0;
            const next =
                adjustment.mode === "upgrade"
                    ? current >= 2
                        ? Math.max(current, 3)
                        : Math.max(current, 2)
                    : (adjustment.rank ?? 1);
            floors.set(adjustment.skill, Math.max(current, next));
        }

        this.skills = {};
        const entries = Object.entries(CONFIG.PF2E.skills);
        for (const [slug, data] of entries) {
            const aeRank = (this.system.skills[slug] as { rank?: number } | undefined)?.rank ?? 0;
            const rank = this.rank(built.ranks.skills[slug] ?? 0, aeRank, floors.get(slug) ?? 0);
            const statistic = new Statistic(this, {
                slug,
                label: data.label,
                attribute: data.attribute,
                rank,
                domains: [slug, "skill-check", "all"],
                lore: false,
                check: { type: "skill-check" },
            });
            this.skills[slug] = statistic;
            this.system.skills[slug] = fu.mergeObject(statistic.getTraceData(), {
                attribute: data.attribute,
                rank,
            }) as SkillData;
        }
    }

    private addRacerBonus(): void {
        const selector = `${this.system.racerSpeed}-speed`;
        const modifiers = (this.synthetics.modifiers[selector] ??= []);
        modifiers.push(
            () =>
                new Modifier({
                    slug: "racer",
                    label: _loc("PF2E.Companion.Specialization.racer"),
                    modifier: 10,
                    type: "status",
                }),
        );
    }

    private rank(...ranks: number[]): ZeroToFour {
        return Math.clamp(Math.trunc(Math.max(...ranks)), 0, 4) as ZeroToFour;
    }

    protected override async _preUpdate(
        changed: DeepPartial<this["_source"]>,
        options: CreatureUpdateCallbackOptions & { previousMaster?: ActorUUID },
        user: fd.BaseUser,
    ): Promise<boolean | void> {
        const newId = changed.system?.master?.id;
        if (newId !== undefined && newId !== this.system.master.id) options.previousMaster = this.master?.uuid;
        return super._preUpdate(changed, options, user);
    }

    protected override _onCreate(data: CompanionSource, options: DatabaseCreateCallbackOptions, userId: string): void {
        super._onCreate(data, options, userId);
        refreshMasterSheet(this.master);
    }

    protected override _onUpdate(
        changed: DeepPartial<this["_source"]>,
        options: CreatureUpdateCallbackOptions & { previousMaster?: ActorUUID },
        userId: string,
    ): void {
        super._onUpdate(changed, options, userId);
        if (!changed.system?.master) return;
        const previousId = options.previousMaster;
        const previous = previousId ? fromUuidSync<ActorPF2e>(previousId) : null;
        if (previous?.isOfType("character") && previous !== this.master) refreshMasterSheet(previous);
        refreshMasterSheet(this.master);
    }

    protected override _onDelete(options: DatabaseDeleteCallbackOptions, userId: string): void {
        const master = this.master;
        super._onDelete(options, userId);
        refreshMasterSheet(master);
    }
}

interface CompanionPF2e<
    TParent extends TokenDocumentPF2e | null = TokenDocumentPF2e | null,
> extends CreaturePF2e<TParent> {
    readonly _source: CompanionSource;
    system: CompanionSystemData;
}

export { CompanionPF2e };
