import type { CharacterPF2e, PartyPF2e } from "@actor";
import type { CreatureSheetData } from "@actor/creature/index.ts";
import { CreatureSheetPF2e } from "@actor/creature/sheet.ts";
import type { SheetClickActionHandlers } from "@actor/sheet/base.ts";
import { createAbilityViewData } from "@actor/sheet/helpers.ts";
import type { AbilityViewData } from "@actor/sheet/data-types.ts";
import { MODIFIER_TYPES } from "@actor/modifiers.ts";
import { ATTRIBUTE_ABBREVIATIONS } from "@actor/values.ts";
import type { ActorSheetOptions } from "@client/appv1/sheets/actor-sheet.d.mts";
import { ItemPF2e } from "@item";
import type { ItemSourcePF2e } from "@item/base/data/index.ts";
import { createNPCAttackTraitsAndTags } from "@module/sheet/helpers.ts";
import { DicePF2e } from "@scripts/dice.ts";
import { WeaponReloader } from "@item/weapon/apps/weapon-reloader/app.ts";
import type { WeaponPF2e } from "@item";
import { htmlClosest, htmlQuery, htmlQueryAll, setHasElement, tupleHasValue } from "@util";
import { createTooltipster } from "@util/destroyables.ts";
import * as R from "remeda";
import type { CompanionPF2e } from "./document.ts";
import { trackLabel } from "./profiles.ts";
import type { AttackAmmunitionData } from "@actor/data/base.ts";
import type { StatisticTraceData } from "@system/statistic/data.ts";
import {
    ABILITY_ABBRS,
    COMPANION_SIZES,
    COMPANION_STAGES,
    CUSTOMIZATION_GRADES,
    type AbilityAbbr,
    type CompanionStage,
    type CustomizationGrade,
} from "./values.ts";

class CompanionSheetPF2e<TActor extends CompanionPF2e> extends CreatureSheetPF2e<TActor> {
    protected readonly actorConfigClass = null;

    static override get defaultOptions(): ActorSheetOptions {
        const options = super.defaultOptions;
        options.scrollY.push(
            ".sidebar",
            ".tab[data-tab=main]",
            ".tab[data-tab=actions]",
            ".tab[data-tab=inventory]",
            ".tab[data-tab=skills]",
            ".tab[data-tab=features]",
            ".tab[data-tab=effects]",
        );
        return {
            ...options,
            classes: [...options.classes, "companion"],
            width: 840,
            height: 760,
            tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main" }],
            template: `systems/${SYSTEM_ID}/templates/actors/companion/sheet.hbs`,
        };
    }

    override async getData(options?: ActorSheetOptions): Promise<CompanionSheetData<TActor>> {
        const sheetData = await super.getData(options);
        const actor = this.actor;
        // The pack index fills the type list. Constructing every document here never finishes the render.
        watchCompanionTypes(() => {
            window.setTimeout(() => {
                if (this.rendered) this.render(false);
            }, 0);
        });
        const types = companionTypeChoices();
        const grantStage = actor.resolved?.stage ?? null;
        const stage = !actor.system.manual.stage && grantStage ? grantStage : actor.system.stage;
        const grantTrack =
            actor.resolved?.advanced === "agility" || actor.resolved?.advanced === "power"
                ? actor.resolved.advanced
                : null;
        const advanced = !actor.system.manual.advanced && grantTrack ? grantTrack : actor.system.advanced;
        const specChoices = specializationChoices(types);
        const specNames = new Map(specChoices.map((spec) => [spec.slug, spec.name]));
        const grantSpecs = actor.resolved?.specializations ?? [];
        const selectedSpecializations =
            !actor.system.manual.specializations && grantSpecs.length ? grantSpecs : actor.system.specializations;
        const sizeChoices = sizeOptions(actor.typeItem?.system.sizes ?? []);
        const feats = featRows(actor);
        const strikes = strikeRows(actor);
        const support = actor.typeItem?.system.support ?? "";
        warnBookLimits(actor);

        return {
            ...sheetData,
            masters: masterChoices(),
            types,
            stages: COMPANION_STAGES.map((value) => ({ value, label: actor.stageName(value) })),
            tracks: (["agility", "power"] as const).map((value) => ({ value, label: trackLabel(value, SYSTEM_ID) })),
            stage,
            advanced,
            grantedStage: grantStage ? actor.stageName(grantStage) : "",
            grantedTrack: grantTrack ? trackLabel(grantTrack, SYSTEM_ID) : "",
            specializations: specChoices,
            selectedSpecializations,
            grantedSpecializations: grantSpecs.map((slug) => specNames.get(slug) ?? slug).join(", "),
            strikes,
            actions: R.sortBy(
                actor.itemTypes.action.filter((action) => action.system.category !== "customization"),
                (action) => action.sort,
            ).map((action) => createAbilityViewData(action)),
            skills: skillRows(actor),
            speeds: speedRows(actor),
            abilityRows: abilityRows(actor),
            initiative: actor.initiative?.statistic.getTraceData() ?? null,
            numberToRank: R.mapToObj([0, 1, 2, 3, 4] as const, (n) => [n, _loc(`PF2E.ProficiencyLevel${n}`)]),
            profileOptions: {
                animal: game.i18n.localize("PF2E.Companion.ProfileAnimal"),
                robot: game.i18n.localize("PF2E.Companion.ProfileRobot"),
            },
            speedOptions: {
                land: "PF2E.Actor.Speed.Type.Land",
                climb: "PF2E.Actor.Speed.Type.Climb",
                fly: "PF2E.Actor.Speed.Type.Fly",
                swim: "PF2E.Actor.Speed.Type.Swim",
                burrow: "PF2E.Actor.Speed.Type.Burrow",
            },
            grades: gradeRows(actor, feats),
            feats,
            otherFeats: feats.filter((feat) => !feat.grade),
            companionDC: actor.companionDC,
            sizeChoices,
            showSize: Object.keys(sizeChoices).length > 0,
            showGrow: actor.system.profile === "robot",
            showDrone: actor.system.profile === "robot",
            drone: actor.role === "drone",
            droneGranted: !actor.system.manual.role && actor.role === "drone" && actor.system.role !== "drone",
            showImitator: !!actor.typeItem?.system.imitator,
            showRacer: selectedSpecializations.includes("racer"),
            support,
            sizeLabel: CONFIG.PF2E.actorSizes[actor.size] ?? actor.size,
        };
    }

    protected override async _updateObject(event: Event, formData: Record<string, unknown>): Promise<void> {
        if (formData["system.master.id"] === "") formData["system.master.id"] = null;
        const size = formData["system.sizeChoice"];
        const sizeSlug = typeof size === "string" && (size === "" || tupleHasValue(COMPANION_SIZES, size));
        if (!sizeSlug) delete formData["system.sizeChoice"];
        for (const key of ABILITY_ABBRS) readOptionalInteger(formData, `system.abilityOverrides.${key}`);
        for (const grade of CUSTOMIZATION_GRADES) readOptionalInteger(formData, `system.slotOverrides.${grade}`, 0);
        const stage = formData["system.stage"];
        if (typeof stage === "string") {
            const grant = this.actor.resolved?.stage ?? null;
            if (grant) formData["system.manual.stage"] = stage !== grant;
            else if (stage !== this.actor.system.stage) formData["system.manual.stage"] = true;
        }
        const advanced = formData["system.advanced"];
        if (typeof advanced === "string") {
            const grant = this.actor.resolved?.advanced;
            const grantTrack = grant === "agility" || grant === "power" ? grant : "";
            if (grantTrack) formData["system.manual.advanced"] = advanced !== grantTrack;
            else if (advanced !== this.actor.system.advanced) formData["system.manual.advanced"] = true;
        }
        return super._updateObject(event, formData);
    }

    protected override activateClickListener(html: HTMLElement): SheetClickActionHandlers {
        const handlers = super.activateClickListener(html);
        handlers.support = () => {
            void this.actor.toggleSupport();
        };
        handlers.reboot = () => {
            void this.actor.reboot();
        };
        handlers["repair-full"] = () => {
            void this.actor.repairToFull();
        };
        handlers["add-customization"] = (_event, button) => {
            const grade = button?.dataset.grade;
            if (!grade || !tupleHasValue(CUSTOMIZATION_GRADES, grade)) return;
            return addCustomization(this.actor, grade);
        };
        handlers.reload = async (_event, button) => {
            const weapon = this.#strikeWeapon(button);
            if (!weapon) return;
            const existing = foundry.applications.instances.get("weapon-reloader");
            if (existing) await existing.close();
            else new WeaponReloader({ weapon, anchor: button }).render({ force: true });
        };
        handlers["select-ammo"] = async (_event, button) => {
            const weapon = this.#strikeWeapon(button);
            const ammoId = htmlClosest(button, "[data-item-id]")?.dataset.itemId;
            if (!weapon || !ammoId) return;
            const ammoSubItems = weapon.subitems.filter(
                (item) => item.isOfType("ammo", "weapon") && item.isAmmoFor(weapon),
            );
            const purgedItems = ammoSubItems.filter((item) => !item.quantity).map((item) => item.id);
            const sources = R.sortBy(fu.deepClone(weapon._source.system.subitems), (source) => source.sort).filter(
                (source) => !purgedItems.includes(source._id ?? ""),
            );
            const sourcesSorted = R.pipe(
                sources,
                R.sortBy((source) => source.sort),
                R.sortBy((source) =>
                    !ammoSubItems.some((ammo) => ammo.id === source._id) ? 0 : source._id === ammoId ? 1 : 2,
                ),
            );
            for (const [index, source] of sourcesSorted.entries()) {
                source.sort = index;
            }
            return weapon.update({ "system.subitems": sources });
        };
        handlers.unload = async (event, button) => {
            const weapon = this.#strikeWeapon(button);
            const itemId = htmlClosest(button, "[data-item-id]")?.dataset.itemId;
            if (!weapon || !itemId) return;
            return weapon.subitems.get(itemId, { strict: true }).detach({ skipConfirm: event.shiftKey });
        };
        handlers["roll-attribute"] = (event, anchor) => {
            const attribute = anchor?.closest<HTMLElement>("[data-attribute]")?.dataset.attribute;
            if (!setHasElement(ATTRIBUTE_ABBREVIATIONS, attribute)) return;
            const modifier = this.actor.system.abilities[attribute].mod;
            const speaker = ChatMessage.getSpeaker({ token: this.token, actor: this.actor });
            return DicePF2e.d20Roll({
                event,
                parts: ["@modifier"],
                data: { modifier },
                title: game.i18n.localize(`PF2E.AbilityCheck.${attribute}`),
                speaker,
            });
        };
        return handlers;
    }

    override activateListeners($html: JQuery): void {
        super.activateListeners($html);
        const html = $html[0];

        htmlQuery(html, "[data-action=set-type]")?.addEventListener("change", (event) => {
            const uuid = (event.target as HTMLSelectElement).value;
            void this.actor.setCompanionType(uuid);
        });

        htmlQuery(html, "[data-action=set-specializations]")?.addEventListener("change", (event) => {
            const select = event.target as HTMLSelectElement;
            const specializations = [...select.selectedOptions].map((option) => option.value);
            const grant = this.actor.resolved?.specializations ?? [];
            const same =
                specializations.length === grant.length && specializations.every((slug) => grant.includes(slug));
            void this.actor.update({
                "system.specializations": specializations,
                "system.manual.specializations": grant.length > 0 ? !same : true,
            });
        });

        for (const input of htmlQueryAll<HTMLInputElement>(html, "input[data-action=update-field]")) {
            input.addEventListener("change", () => {
                const field = input.dataset.field;
                if (!field) return;
                if (field === "system.role") {
                    void this.actor.update({
                        "system.role": input.checked ? "drone" : "",
                        "system.manual.role": true,
                    });
                    return;
                }
                const value = input.type === "checkbox" ? input.checked : input.value;
                void this.actor.update({ [field]: value });
            });
        }

        for (const customModifierEl of htmlQueryAll(html, ".modifiers-tooltip")) {
            const stat = customModifierEl.dataset.stat;
            if (!stat) continue;

            for (const removeButton of htmlQueryAll(customModifierEl, "[data-action=remove-modifier]")) {
                const slug = removeButton.dataset.slug ?? "";
                removeButton.addEventListener("click", () => {
                    void this.actor.removeCustomModifier(stat, slug);
                });
            }

            const modifierValueEl = htmlQuery<HTMLInputElement>(customModifierEl, ".add-modifier input[type=number]");
            htmlQuery(customModifierEl, "[data-action=increment]")?.addEventListener("click", () => {
                modifierValueEl?.stepUp();
            });
            htmlQuery(customModifierEl, "[data-action=decrement]")?.addEventListener("click", () => {
                modifierValueEl?.stepDown();
            });

            htmlQuery(customModifierEl, "[data-action=create-custom-modifier]")?.addEventListener("click", () => {
                const modifier = modifierValueEl?.valueAsNumber || 1;
                const type = htmlQuery<HTMLSelectElement>(customModifierEl, ".add-modifier-type")?.value ?? "";
                const name = htmlQuery<HTMLInputElement>(customModifierEl, ".add-modifier-name")?.value?.trim();
                const label = name || game.i18n.localize(`PF2E.ModifierType.${type}`);
                if (!setHasElement(MODIFIER_TYPES, type)) {
                    ui.notifications.error("Type is required.");
                    return;
                }
                void this.actor.addCustomModifier(stat, label, modifier, type);
            });
        }

        for (const strikeElem of htmlQueryAll(html, "ol.strikes-list > li[data-weapon-id]")) {
            const ammoSelect = htmlQuery<HTMLSelectElement>(strikeElem, "select[data-action=link-ammo]");
            ammoSelect?.addEventListener("change", (event) => {
                event.stopPropagation();
                const weapon = this.#strikeWeapon(ammoSelect);
                const ammo = this.actor.items.get(ammoSelect.value);
                void weapon?.update({ system: { selectedAmmoId: ammo?.id ?? null } });
            });

            for (const input of htmlQueryAll<HTMLInputElement>(strikeElem, "input[data-action=change-ammo-quantity]")) {
                input.addEventListener("blur", (event) => {
                    event.stopPropagation();
                    const weapon = this.#strikeWeapon(input);
                    const itemId = htmlClosest(input, "[data-item-id]")?.dataset.itemId;
                    const item = weapon?.subitems.get(itemId ?? "");
                    if (!item?.isOfType("ammo", "weapon")) return;
                    const value = Math.max(0, Number(input.value));
                    if (value === 0 && !(item.isOfType("ammo") && item.isMagazine && !item.system.uses.autoDestroy)) {
                        void item.delete();
                    } else if (item.isOfType("ammo") && item.isMagazine) {
                        void item.update({ "system.uses.value": value });
                    } else {
                        void item.update({ "system.quantity": value });
                    }
                });
            }
        }

        for (const hoverEl of htmlQueryAll(html, ".hover")) {
            const allSides = ["top", "right", "bottom", "left"] as const;
            const side =
                hoverEl.dataset.tooltipSide
                    ?.split(",")
                    .filter((t): t is (typeof allSides)[number] => tupleHasValue(allSides, t)) ?? ["right", "bottom"];
            createTooltipster(hoverEl, {
                trigger: "click",
                arrow: false,
                contentAsHTML: true,
                debug: BUILD_MODE === "development",
                interactive: true,
                side,
                theme: "crb-hover",
                minWidth: 120,
            });
        }
    }

    #strikeWeapon(target: HTMLElement): WeaponPF2e<TActor> | null {
        const weaponId = htmlClosest(target, "[data-weapon-id]")?.dataset.weaponId;
        const weapon = this.actor.items.get(weaponId ?? "");
        if (!weapon?.isOfType("weapon")) return null;
        return weapon;
    }
}

function masterChoices(): CharacterPF2e[] {
    const partyIds = new Set(
        game.actors
            .filter((actor): actor is PartyPF2e<null> => actor.isOfType("party"))
            .flatMap((party) =>
                party.members.filter((member) => member.isOfType("character")).map((member) => member.id),
            ),
    );
    return game.actors
        .filter((actor): actor is CharacterPF2e<null> => actor.isOfType("character"))
        .sort((a, b) => {
            const party = Number(partyIds.has(b.id)) - Number(partyIds.has(a.id));
            return party || a.name.localeCompare(b.name, game.i18n.lang);
        });
}

interface CompanionTypeChoice {
    uuid: string;
    name: string;
    slug: string;
    system: { kind: string; profile: string; slug: string };
}

let companionTypeIndexState: "idle" | "loading" | "ready" = "idle";
const companionTypeListeners: (() => void)[] = [];

/** Ask for the type index once. Rendering does not wait on it. */
function watchCompanionTypes(onReady: () => void): void {
    if (companionTypeIndexState === "ready") return;
    const pack = game.packs.get(`${SYSTEM_ID}.companion-types`);
    if (!pack) {
        companionTypeIndexState = "ready";
        return;
    }
    companionTypeListeners.push(onReady);
    if (companionTypeIndexState === "loading") return;
    companionTypeIndexState = "loading";
    void pack
        .getIndex({ fields: ["system.kind", "system.profile", "system.slug"] })
        .then(() => {
            companionTypeIndexState = "ready";
            const listeners = companionTypeListeners.splice(0);
            for (const listener of listeners) listener();
        })
        .catch((error: unknown) => {
            companionTypeIndexState = "ready";
            companionTypeListeners.length = 0;
            console.error(error);
        });
}

function companionTypeChoices(): CompanionTypeChoice[] {
    const pack = game.packs.get(`${SYSTEM_ID}.companion-types`);
    if (!pack) return [];
    const choices: CompanionTypeChoice[] = [];
    for (const entry of pack.index) {
        const kind = entry.system?.kind;
        if (typeof kind !== "string" || !kind) continue;
        const slug = typeof entry.system?.slug === "string" ? entry.system.slug : "";
        const profile = typeof entry.system?.profile === "string" ? entry.system.profile : "";
        choices.push({ uuid: entry.uuid, name: entry.name, slug, system: { kind, profile, slug } });
    }
    return choices;
}

function specializationChoices(types: CompanionTypeChoice[]): { slug: string; name: string }[] {
    return types
        .filter((type) => type.system.kind === "specialization" && type.system.profile === "animal")
        .map((type) => ({ slug: type.slug, name: type.name }))
        .filter((choice) => choice.slug);
}

function sizeOptions(sizes: readonly string[]): Record<string, string> {
    const options: Record<string, string> = {};
    for (const size of sizes) {
        if (tupleHasValue(COMPANION_SIZES, size)) options[size] = CONFIG.PF2E.actorSizes[size];
    }
    return options;
}

const PERSONALITY_SLUGS = new Set(["artificial-personality", "sapient"]);
const PERSONALITY_REQUIRED = new Set(["glow-up", "linguistic-upload"]);

/** An empty box is null. A typed number, including 0, is kept. */
function readOptionalInteger(formData: Record<string, unknown>, field: string, min?: number): void {
    if (!(field in formData)) return;
    const value = formData[field];
    if (value === "" || value === null) {
        formData[field] = null;
        return;
    }
    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numeric)) {
        delete formData[field];
        return;
    }
    const integer = Math.trunc(numeric);
    formData[field] = typeof min === "number" ? Math.max(min, integer) : integer;
}

function abilityRows(actor: CompanionPF2e): AbilityRow[] {
    return ABILITY_ABBRS.map((key) => {
        const prepared = actor.system.abilities[key];
        const book = actor.built?.abilities[key] ?? prepared?.mod ?? 0;
        const override = actor.system.abilityOverrides[key];
        const signed = book >= 0 ? `+${book}` : `${book}`;
        return {
            key,
            label: prepared?.label ?? key,
            shortLabel: prepared?.shortLabel ?? key,
            bookLabel: signed,
            value: typeof override === "number" ? override : "",
        };
    });
}

function skillRows(actor: CompanionPF2e): SkillRow[] {
    const rows: SkillRow[] = [];
    for (const [slug, skill] of Object.entries(actor.system.skills ?? {})) {
        if (!skill || typeof skill.value !== "number") continue;
        const rank = "rank" in skill && typeof skill.rank === "number" ? skill.rank : 0;
        rows.push({
            slug: skill.slug || slug,
            label: skill.label || slug,
            value: skill.value,
            rank,
            breakdown: skill.breakdown ?? "",
        });
    }
    return rows;
}

function speedRows(actor: CompanionPF2e): SpeedRow[] {
    const speedIcons = {
        land: "person-running",
        swim: "person-swimming",
        climb: "mountain",
        fly: "feather-pointed",
        burrow: "water-ladder",
    } as const;
    const speeds = actor.system.movement?.speeds;
    return R.keys(speedIcons).map((type) => {
        const speed = speeds?.[type];
        const value = typeof speed?.value === "number" && speed.value > 0 ? speed.value : null;
        return {
            type,
            icon: fa.fields.createFontAwesomeIcon(speedIcons[type]).outerHTML,
            label: `PF2E.Actor.Speed.Type.${type.capitalize()}`,
            value,
            breakdown: speed?.breakdown ?? "",
        };
    });
}

interface FeatSheetRow {
    id: string;
    name: string;
    img: string;
    inactive: boolean;
    needsPersonality: boolean;
    grade: CustomizationGrade | null;
}

function featRows(actor: CompanionPF2e): FeatSheetRow[] {
    const inactive = actor.inactiveIds ?? new Set<string>();
    const customizations = actor.itemTypes.action
        .filter((action) => action.system.category === "customization")
        .sort((a, b) => a.sort - b.sort);
    const personality = customizations.some((action) => {
        const slug = action.slug ?? "";
        return PERSONALITY_SLUGS.has(slug) && !inactive.has(action.id);
    });
    return customizations.map((feat) => {
        const slug = feat.slug ?? "";
        const tags = (feat.system.traits?.otherTags ?? []) as string[];
        const grade = CUSTOMIZATION_GRADES.find((entry) => tags.includes(entry)) ?? null;
        return {
            id: feat.id,
            name: feat.name,
            img: feat.img,
            inactive: inactive.has(feat.id),
            needsPersonality: !personality && PERSONALITY_REQUIRED.has(slug),
            grade,
        };
    });
}

function gradeRows(actor: CompanionPF2e, feats: FeatSheetRow[]): GradeRow[] {
    return CUSTOMIZATION_GRADES.map((grade) => {
        const owned = feats.filter((feat) => feat.grade === grade);
        const override = actor.system.slotOverrides[grade];
        return {
            grade,
            label: `PF2E.Companion.Grade.${grade}`,
            book: actor.bookSlots?.[grade] ?? actor.slots?.[grade] ?? 0,
            override: typeof override === "number" ? override : "",
            feats: owned,
        };
    });
}

function strikeRows(actor: CompanionPF2e): StrikeRow[] {
    const listFormatter = game.i18n.getListFormatter({ style: "long", type: "conjunction" });
    return (actor.system.actions ?? []).map((attack, index) => {
        const item = attack.item;
        const damageFormula = Object.values(item.system.damageRolls)
            .map((roll) => roll.damage)
            .filter((formula) => !!formula)
            .join(" + ");
        const breakdown = attack.type === "strike" ? attack.breakdown : "";
        return {
            index,
            name: attack.label || item.name,
            glyph: attack.glyph,
            attackType: attack.attackRollType,
            variants: attack.variants.map((variant, variantIndex) => ({
                label: variant.label,
                breakdown: variantIndex === 0 ? breakdown : "",
            })),
            traitsAndTags: createNPCAttackTraitsAndTags(item),
            damageFormula,
            effects: listFormatter.format(attack.additionalEffects.map((effect) => game.i18n.localize(effect.label))),
            description: item.description,
            weaponId: item.isOfType("melee") ? (item.linkedWeapon?.id ?? null) : null,
            ammunition: attack.type === "strike" ? (attack.ammunition ?? null) : null,
        };
    });
}

async function addCustomization(actor: CompanionPF2e, grade: CustomizationGrade): Promise<void> {
    const pack = game.packs.get(`${SYSTEM_ID}.companion-customizations`);
    if (!pack) {
        ui.notifications.warn("PF2E.Companion.NoCustomizationPack", { localize: true });
        return;
    }
    const index = await pack.getIndex({ fields: ["system"] });
    const choices = [...index].filter((entry) => {
        const tags = entry.system?.traits?.otherTags;
        return (
            entry.type === "action" &&
            entry.system?.category === "customization" &&
            Array.isArray(tags) &&
            tags.includes(grade)
        );
    });
    choices.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
    if (!choices.length) {
        const label = game.i18n.localize(`PF2E.Companion.Grade.${grade}`);
        ui.notifications.warn(game.i18n.localize("PF2E.Companion.NoCustomizationGrade", { grade: label }));
        return;
    }

    const content = document.createElement("div");
    const group = document.createElement("div");
    group.className = "form-group customization-picker";
    const label = document.createElement("label");
    label.textContent = game.i18n.localize("PF2E.Companion.Customizations");
    const select = document.createElement("select");
    select.name = "uuid";
    for (const entry of choices) {
        const option = document.createElement("option");
        option.value = entry.uuid;
        option.textContent = entry.name;
        select.append(option);
    }
    const viewLabel = game.i18n.localize("PF2E.Companion.ViewCustomization");
    const info = document.createElement("button");
    info.type = "button";
    info.className = "item-info icon fa-solid fa-info-circle";
    info.dataset.tooltip = viewLabel;
    info.setAttribute("aria-label", viewLabel);
    group.append(label, select, info);
    content.append(group);

    const byUuid = new Map<string, (typeof choices)[number]>(choices.map((entry) => [entry.uuid, entry]));
    const result = await fa.api.DialogV2.input<{ uuid: string } | null>({
        window: { title: "PF2E.Companion.AddCustomization" },
        position: { width: 480 },
        classes: ["companion-customization"],
        content,
        ok: {
            label: "PF2E.AddShortLabel",
            callback: (_event, button) => {
                const element = button.form?.elements.namedItem("uuid");
                const uuid = element instanceof HTMLSelectElement ? element.value : "";
                return { uuid };
            },
        },
        render: (_event, dialog) => {
            const root = dialog.element;
            const button = root.querySelector<HTMLButtonElement>("button.item-info");
            const menu = root.querySelector<HTMLSelectElement>("select[name=uuid]");
            button?.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                const uuid = menu?.value;
                if (uuid) void viewCustomization(uuid);
            });
        },
    });
    if (result === null) return;
    const uuid = R.isPlainObject(result) && typeof result.uuid === "string" ? result.uuid : "";
    const entry = uuid ? byUuid.get(uuid) : undefined;
    if (!entry) {
        ui.notifications.warn("PF2E.Companion.CouldNotAdd", { localize: true });
        return;
    }

    try {
        const created = R.isPlainObject(entry.system)
            ? await actor.createEmbeddedDocuments("Item", [
                  {
                      name: entry.name,
                      type: "action",
                      img: entry.img,
                      system: fu.deepClone(entry.system),
                  } as PreCreate<ItemSourcePF2e>,
              ])
            : await createCustomizationFromUuid(actor, entry.uuid);
        if (created.length === 0) ui.notifications.warn("PF2E.Companion.CouldNotAdd", { localize: true });
    } catch (error) {
        console.error(error);
        try {
            const created = await createCustomizationFromUuid(actor, entry.uuid);
            if (created.length === 0) ui.notifications.warn("PF2E.Companion.CouldNotAdd", { localize: true });
        } catch (fallbackError) {
            console.error(fallbackError);
            ui.notifications.error("PF2E.Companion.CouldNotAdd", { localize: true });
        }
    }
}

async function createCustomizationFromUuid(actor: CompanionPF2e, uuid: string): Promise<ItemPF2e[]> {
    const item = await fromUuid(uuid);
    if (!(item instanceof ItemPF2e) || !item.isOfType("action")) return [];
    return actor.createEmbeddedDocuments("Item", [item.toObject()]);
}

async function viewCustomization(uuid: string): Promise<void> {
    const item = await fromUuid(uuid);
    if (item instanceof ItemPF2e) {
        item.sheet.render(true);
        return;
    }
    ui.notifications.warn("PF2E.Companion.CouldNotOpen", { localize: true });
}

const bookLimitWarned = new Set<string>();

/** Once per companion, when the book's usual limit is already past. Not a lock. */
function warnBookLimits(actor: CompanionPF2e): void {
    const message = bookLimitWarning(actor);
    if (!message || bookLimitWarned.has(actor.id)) return;
    bookLimitWarned.add(actor.id);
    ui.notifications.warn(message);
}

function bookLimitWarning(actor: CompanionPF2e): string {
    const master = actor.master;
    if (!master) return "";
    const companions = game.actors.filter(
        (candidate): candidate is CompanionPF2e<null> =>
            candidate.isOfType("companion") && candidate.system.master.id === master.id,
    );
    const profiles = new Set(companions.map((companion) => companion.system.profile));
    const messages: string[] = [];
    if (profiles.has("animal") && profiles.has("robot")) {
        messages.push(game.i18n.localize("PF2E.Companion.Warning.Mixed"));
    }
    const allowsSecond = master.items.some((item) => {
        const name = item.name.toLowerCase();
        return name.includes("additional companion") || name.includes("lead the pack");
    });
    if (companions.length > 1 && !allowsSecond) messages.push(game.i18n.localize("PF2E.Companion.Warning.Second"));
    return messages.join(" ");
}

interface AbilityRow {
    key: AbilityAbbr;
    label: string;
    shortLabel: string;
    bookLabel: string;
    value: number | "";
}

interface SkillRow {
    slug: string;
    label: string;
    value: number;
    rank: number;
    breakdown: string;
}

interface SpeedRow {
    type: string;
    icon: string;
    label: string;
    value: number | null;
    breakdown: string;
}

interface GradeRow {
    grade: CustomizationGrade;
    label: string;
    book: number;
    override: number | "";
    feats: FeatSheetRow[];
}

interface StrikeRow {
    index: number;
    name: string;
    glyph: string;
    attackType: string;
    variants: { label: string; breakdown: string }[];
    traitsAndTags: { label: string; description?: string | null }[];
    damageFormula: string;
    effects: string;
    description: string;
    weaponId: string | null;
    ammunition: AttackAmmunitionData | null;
}

interface CompanionSheetData<TActor extends CompanionPF2e> extends CreatureSheetData<TActor> {
    masters: CharacterPF2e[];
    types: CompanionTypeChoice[];
    stages: { value: CompanionStage; label: string }[];
    tracks: { value: "agility" | "power"; label: string }[];
    stage: CompanionStage;
    advanced: string;
    grantedStage: string;
    grantedTrack: string;
    specializations: { slug: string; name: string }[];
    selectedSpecializations: string[];
    grantedSpecializations: string;
    strikes: StrikeRow[];
    actions: AbilityViewData[];
    skills: SkillRow[];
    speeds: SpeedRow[];
    abilityRows: AbilityRow[];
    initiative: StatisticTraceData | null;
    numberToRank: Record<0 | 1 | 2 | 3 | 4, string>;
    profileOptions: { animal: string; robot: string };
    speedOptions: Record<string, string>;
    grades: GradeRow[];
    feats: FeatSheetRow[];
    otherFeats: FeatSheetRow[];
    companionDC: number | null;
    sizeChoices: Record<string, string>;
    showSize: boolean;
    showGrow: boolean;
    showDrone: boolean;
    drone: boolean;
    droneGranted: boolean;
    showImitator: boolean;
    showRacer: boolean;
    support: string;
    sizeLabel: string;
}

export { CompanionSheetPF2e };
