<script lang="ts">
    import SearchInput from "@module/sheet/components/search-input.svelte";
    import InlineIconButton from "@module/sheet/components/inline-icon-button.svelte";
    import type { SvelteAppProps } from "@module/sheet/mixin.svelte.ts";
    import type { Rarity } from "@module/data.ts";
    import { onMount } from "svelte";
    import type { ClassView, FeatBrowserContext, FeatBrowserRow } from "./app.ts";

    const { foundryApp, search, getState }: FeatBrowserContext & SvelteAppProps<FeatBrowserContext> = $props();
    const data = $derived(getState());

    let searchRoot: HTMLElement | undefined = $state();
    let showIllegal = $state(false);
    let includeSkills = $state(false);
    let classView = $state<ClassView>(getState().groupId === "archetype" ? "archetype" : "class");
    let disabledChips = $state<string[]>([]);
    let disabledSkills = $state<string[]>([]);
    let rarityOn = $state<Record<Rarity, boolean>>({
        common: true,
        uncommon: true,
        rare: true,
        unique: true,
    });

    const searchPlaceholder = _loc("PF2E.Actor.Character.FeatBrowser.SearchPlaceholder");
    const rarityToggles = ["common", "uncommon", "rare", "unique"] as const satisfies readonly Rarity[];

    const rarityLabels: Record<Rarity, string> = {
        common: _loc(CONFIG.PF2E.rarityTraits.common),
        uncommon: _loc(CONFIG.PF2E.rarityTraits.uncommon),
        rare: _loc(CONFIG.PF2E.rarityTraits.rare),
        unique: _loc(CONFIG.PF2E.rarityTraits.unique),
    };

    onMount(() => {
        searchRoot?.querySelector("input")?.focus();
    });

    function toggleChip(slug: string): void {
        disabledChips = disabledChips.includes(slug)
            ? disabledChips.filter((chip) => chip !== slug)
            : [...disabledChips, slug];
    }

    function toggleRarity(rarity: Rarity): void {
        rarityOn = { ...rarityOn, [rarity]: !rarityOn[rarity] };
    }

    function toggleSkill(slug: string): void {
        disabledSkills = disabledSkills.includes(slug)
            ? disabledSkills.filter((skill) => skill !== slug)
            : [...disabledSkills, slug];
    }

    /** Shift-click or right-click keeps one entry. The same gesture on that entry turns the group back on. */
    function onlyThese(disabled: string[], slug: string, all: string[]): string[] {
        const others = all.filter((item) => item !== slug);
        const solo = !disabled.includes(slug) && others.every((item) => disabled.includes(item));
        return solo ? [] : others;
    }

    function onlySkill(slug: string): void {
        disabledSkills = onlyThese(
            disabledSkills,
            slug,
            skillChoices.map((skill) => skill.slug),
        );
    }

    function onlyChip(slug: string): void {
        disabledChips = onlyThese(
            disabledChips,
            slug,
            data.chips.map((chip) => chip.slug),
        );
    }

    function onlyRarity(rarity: Rarity): void {
        const solo = rarityToggles.every((item) => (item === rarity ? rarityOn[item] : !rarityOn[item]));
        rarityOn = solo
            ? { common: true, uncommon: true, rare: true, unique: true }
            : { common: false, uncommon: false, rare: false, unique: false, [rarity]: true };
    }

    function isOnlySkill(slug: string): boolean {
        return (
            !disabledSkills.includes(slug) &&
            skillChoices.every((skill) => skill.slug === slug || disabledSkills.includes(skill.slug))
        );
    }

    function isOnlyChip(slug: string): boolean {
        return (
            !disabledChips.includes(slug) &&
            data.chips.every((chip) => chip.slug === slug || disabledChips.includes(chip.slug))
        );
    }

    function isOnlyRarity(rarity: Rarity): boolean {
        return rarityToggles.every((item) => (item === rarity ? rarityOn[item] : !rarityOn[item]));
    }

    function showOnlyKey(solo: boolean): string {
        return solo ? "PF2E.Actor.Character.FeatBrowser.ShowAll" : "PF2E.Actor.Character.FeatBrowser.ShowOnly";
    }

    function onOnly(event: MouseEvent, apply: () => void): void {
        event.preventDefault();
        event.stopPropagation();
        apply();
    }

    function onTagClick(event: MouseEvent, toggle: () => void, only: () => void): void {
        if (!event.shiftKey) {
            toggle();
            return;
        }
        onOnly(event, only);
    }

    /** Skill pills apply on a skill slot, and on a general slot once skill feats are included. */
    function skillFilterActive(): boolean {
        return data.groupId === "skill" || (data.groupId === "general" && includeSkills);
    }

    function skillAllows(row: FeatBrowserRow): boolean {
        if (row.category !== "skill" || !skillFilterActive()) return true;
        if (row.skillSlugs.length === 0) return !disabledSkills.includes("other");
        return row.skillSlugs.some((slug) => !disabledSkills.includes(slug));
    }

    function chipAllows(row: FeatBrowserRow): boolean {
        const enabled = data.chips.filter((chip) => !disabledChips.includes(chip.slug));
        if (enabled.length === 0) return false;
        if (row.traits.some((trait) => enabled.some((chip) => chip.slug === trait))) return true;
        return row.universal;
    }

    function inSlotView(row: FeatBrowserRow): boolean {
        const groupId = data.groupId;
        if (groupId === "ancestry") return row.category === "ancestry" && chipAllows(row);
        if (groupId === "skill") return row.category === "skill";
        if (groupId === "general") {
            return row.category === "general" || (includeSkills && row.category === "skill");
        }
        if (classView === "class") {
            return (
                groupId === "class" &&
                row.category === "class" &&
                !!data.classSlug &&
                row.traits.includes(data.classSlug) &&
                !row.traits.includes("dedication")
            );
        }
        if (classView === "archetype") return row.archetypeFollowup;
        return row.category === "class" && row.traits.includes("dedication");
    }

    const visible = $derived.by(() => {
        const matches = search.matches;
        return data.rows.filter((row) => {
            if (!inSlotView(row) || !rarityAllows(row) || !skillAllows(row)) return false;
            if (matches && !matches.has(row.uuid)) return false;
            if (row.status === "illegal" && !showIllegal) return false;
            return true;
        });
    });

    const illegalCount = $derived.by(() => {
        const matches = search.matches;
        return data.rows.filter((row) => {
            if (row.status !== "illegal" || !inSlotView(row) || !rarityAllows(row) || !skillAllows(row)) return false;
            if (matches && !matches.has(row.uuid)) return false;
            return true;
        }).length;
    });

    const searchResults = $derived(_loc("PF2E.Actor.Character.FeatBrowser.SearchResults", { count: visible.length }));

    const showUnqualified = $derived(
        showIllegal
            ? _loc("PF2E.Actor.Character.FeatBrowser.ShowUnqualifiedCount", { count: illegalCount })
            : _loc("PF2E.Actor.Character.FeatBrowser.ShowUnqualified"),
    );

    interface DisplayGroup {
        id: string;
        label: string | null;
        rows: FeatBrowserRow[];
    }

    interface DisplaySection {
        id: FeatBrowserRow["status"];
        label: string;
        groups: DisplayGroup[];
    }

    function rarityAllows(row: FeatBrowserRow): boolean {
        return row.rarity ? rarityOn[row.rarity] : rarityOn.common;
    }

    /** Skills that have a feat in this slot. Independent of which pills are off, so a pill can be turned back on. */
    const skillChoices = $derived.by(() => {
        if (!skillFilterActive()) return [];
        const present = new Set<string>();
        let other = false;
        for (const row of data.rows) {
            if (row.category !== "skill" || !rarityAllows(row)) continue;
            if (row.skillSlugs.length === 0) other = true;
            else for (const slug of row.skillSlugs) present.add(slug);
        }
        const choices: { slug: string; label: string }[] = [];
        for (const [slug, skill] of Object.entries(CONFIG.PF2E.skills)) {
            if (present.has(slug)) choices.push({ slug, label: _loc(skill.label) });
        }
        if (other) choices.push({ slug: "other", label: _loc("PF2E.Actor.Character.FeatBrowser.Other") });
        return choices;
    });

    function skillGroups(rows: FeatBrowserRow[]): DisplayGroup[] {
        if (data.groupId !== "skill") return [{ id: "all", label: null, rows }];
        const groups: DisplayGroup[] = [];
        for (const [slug, skill] of Object.entries(CONFIG.PF2E.skills)) {
            if (disabledSkills.includes(slug)) continue;
            const matched = rows.filter((row) => row.skillSlugs.includes(slug));
            if (matched.length === 0) continue;
            groups.push({ id: slug, label: _loc(skill.label), rows: matched });
        }
        if (!disabledSkills.includes("other")) {
            const other = rows.filter((row) => row.skillSlugs.length === 0);
            if (other.length > 0) {
                groups.push({ id: "other", label: _loc("PF2E.Actor.Character.FeatBrowser.Other"), rows: other });
            }
        }
        return groups;
    }

    const sections = $derived.by((): DisplaySection[] => {
        const built: DisplaySection[] = [];
        const verified = visible.filter((row) => row.status === "legal");
        const unverified = visible.filter((row) => row.status === "unchecked");
        const illegal = visible.filter((row) => row.status === "illegal");
        if (verified.length > 0) {
            built.push({
                id: "legal",
                label: _loc("PF2E.Actor.Character.FeatBrowser.Verified"),
                groups: skillGroups(verified),
            });
        }
        if (unverified.length > 0) {
            built.push({
                id: "unchecked",
                label: _loc("PF2E.Actor.Character.FeatBrowser.Unverified"),
                groups: skillGroups(unverified),
            });
        }
        if (illegal.length > 0) {
            built.push({
                id: "illegal",
                label: _loc("PF2E.Actor.Character.FeatBrowser.NotMet"),
                groups: skillGroups(illegal),
            });
        }
        return built;
    });

    const firstTakeable = $derived(
        sections
            .flatMap((section) => section.groups.flatMap((group) => group.rows))
            .find((row) => row.status !== "illegal") ?? null,
    );

    function onSearchKeydown(event: KeyboardEvent): void {
        // Keep Foundry's hotkeys from seeing keys typed into the field.
        event.stopPropagation();
        if (event.key !== "Enter" || event.isComposing || !firstTakeable) return;
        event.preventDefault();
        void foundryApp.take(firstTakeable.uuid);
    }
</script>

<div class="feat-browser-body">
    {#if data.failed}
        <p class="failed">{_loc("PF2E.Actor.Character.FeatBrowser.Failed")}</p>
    {:else}
        <div class="toolbar">
            {#if data.groupId === "class" || data.groupId === "archetype"}
                <div class="views" role="tablist">
                    {#if data.groupId === "class"}
                        <button
                            type="button"
                            class="flat"
                            role="tab"
                            aria-selected={classView === "class"}
                            onclick={() => (classView = "class")}
                        >
                            {_loc("PF2E.Actor.Character.FeatBrowser.Class")}
                        </button>
                    {/if}
                    <button
                        type="button"
                        class="flat"
                        role="tab"
                        aria-selected={classView === "archetype"}
                        onclick={() => (classView = "archetype")}
                    >
                        {_loc("PF2E.Actor.Character.FeatBrowser.Archetype")}
                    </button>
                    <button
                        type="button"
                        class="flat"
                        role="tab"
                        aria-selected={classView === "dedication"}
                        onclick={() => (classView = "dedication")}
                    >
                        {_loc("PF2E.Actor.Character.FeatBrowser.Dedication")}
                    </button>
                </div>
            {/if}
            {#if data.groupId === "ancestry"}
                <div class="tags">
                    {#each data.chips as chip (chip.slug)}
                        <button
                            type="button"
                            class="tag"
                            aria-pressed={!disabledChips.includes(chip.slug)}
                            data-tooltip={showOnlyKey(isOnlyChip(chip.slug))}
                            onclick={(event) =>
                                onTagClick(
                                    event,
                                    () => toggleChip(chip.slug),
                                    () => onlyChip(chip.slug),
                                )}
                            oncontextmenu={(event) => onOnly(event, () => onlyChip(chip.slug))}
                        >
                            {chip.label}
                        </button>
                    {/each}
                </div>
            {/if}
            <div class="tags">
                {#each rarityToggles as rarity (rarity)}
                    <button
                        type="button"
                        class="tag rarity {rarity}"
                        aria-pressed={rarityOn[rarity]}
                        data-tooltip={showOnlyKey(isOnlyRarity(rarity))}
                        onclick={(event) =>
                            onTagClick(
                                event,
                                () => toggleRarity(rarity),
                                () => onlyRarity(rarity),
                            )}
                        oncontextmenu={(event) => onOnly(event, () => onlyRarity(rarity))}
                    >
                        {rarityLabels[rarity]}
                    </button>
                {/each}
            </div>
            {#if skillChoices.length > 0}
                <div class="tags">
                    {#each skillChoices as skill (skill.slug)}
                        <button
                            type="button"
                            class="tag"
                            aria-pressed={!disabledSkills.includes(skill.slug)}
                            data-tooltip={showOnlyKey(isOnlySkill(skill.slug))}
                            onclick={(event) =>
                                onTagClick(
                                    event,
                                    () => toggleSkill(skill.slug),
                                    () => onlySkill(skill.slug),
                                )}
                            oncontextmenu={(event) => onOnly(event, () => onlySkill(skill.slug))}
                        >
                            {skill.label}
                        </button>
                    {/each}
                </div>
            {/if}
            <div class="choices">
                {#if data.groupId === "general"}
                    <label>
                        <input type="checkbox" bind:checked={includeSkills} />
                        {_loc("PF2E.Actor.Character.FeatBrowser.IncludeSkillFeats")}
                    </label>
                {/if}
                <label>
                    <input type="checkbox" bind:checked={showIllegal} />
                    {showUnqualified}
                </label>
            </div>
        </div>
        <search bind:this={searchRoot}>
            <SearchInput {search} label={searchPlaceholder} resultsLabel={searchResults} onkeydown={onSearchKeydown} />
        </search>
        {#if sections.length === 0}
            <p class="empty">{searchResults}</p>
        {:else}
            <menu class="scrollable">
                {#each sections as section (section.id)}
                    <li class="section">
                        <h3>{section.label}</h3>
                        {#each section.groups as group (group.id)}
                            {#if group.label}
                                <h4>{group.label}</h4>
                            {/if}
                            <ul>
                                {#each group.rows as row (`${section.id}:${group.id}:${row.uuid}`)}
                                    <li class="feat {row.status}" data-uuid={row.uuid}>
                                        <div
                                            class="level"
                                            data-tooltip={_loc("PF2E.Item.Feat.LevelN", { level: row.level })}
                                            aria-label={_loc("PF2E.Item.Feat.LevelN", { level: row.level })}
                                        >
                                            {row.level}
                                        </div>
                                        <img src={row.img} loading="lazy" alt="" />
                                        <div class="name">{row.name}</div>
                                        {#if row.status === "unchecked" || row.rarity}
                                            <div class="tags paizo-style">
                                                {#if row.status === "unchecked"}
                                                    <span class="tag">
                                                        {_loc("PF2E.Actor.Character.FeatBrowser.Unverified")}
                                                    </span>
                                                {/if}
                                                {#if row.rarity && row.rarityLabel}
                                                    <span class="tag rarity {row.rarity}">{row.rarityLabel}</span>
                                                {/if}
                                            </div>
                                        {/if}
                                        <div class="source" class:publication={row.source.publication}>
                                            {row.source.name}
                                        </div>
                                        {#if row.status === "unchecked" && row.sentence}
                                            <div class="sentence">{row.sentence}</div>
                                        {/if}
                                        {#if row.status === "illegal"}
                                            <div class="failure">{row.failures}</div>
                                        {/if}
                                        <div class="buttons">
                                            {#if row.status !== "illegal"}
                                                <InlineIconButton
                                                    icon="fa-solid fa-check"
                                                    class="confirm"
                                                    data-action="take"
                                                    data-tooltip="PF2E.Actor.Character.FeatBrowser.Take"
                                                    aria-label={_loc("PF2E.Actor.Character.FeatBrowser.Take")}
                                                    onclick={() => foundryApp.take(row.uuid)}
                                                />
                                            {/if}
                                            <InlineIconButton
                                                icon="fa-solid fa-memo-pad"
                                                data-tooltip="PF2E.Actor.Character.ABCPicker.Tooltip.ViewSheet"
                                                aria-label={_loc("PF2E.Actor.Character.ABCPicker.Tooltip.ViewSheet")}
                                                onclick={() => foundryApp.viewSheet(row.uuid)}
                                            />
                                        </div>
                                    </li>
                                {/each}
                            </ul>
                        {/each}
                    </li>
                {/each}
            </menu>
        {/if}
    {/if}
</div>

<style>
    .feat-browser-body {
        display: flex;
        flex-flow: column nowrap;
        height: 100%;
        min-height: 0;
        overflow: hidden;
    }

    .failed,
    .empty {
        color: var(--color-text-secondary);
        margin: var(--space-8);
    }

    .toolbar {
        display: flex;
        flex: 0 0 auto;
        flex-flow: column nowrap;
        gap: var(--space-6);
        padding: var(--space-8) var(--space-8) 0;
    }

    .views {
        border-bottom: 1px solid var(--color-border);
        display: flex;

        button {
            background: none;
            background-image: none;
            border: none;
            border-radius: 0;
            box-shadow: none;
            color: var(--color-text-secondary);
            flex: 1 1 0;
            font-size: var(--font-size-12);
            height: auto;
            margin: 0;
            min-height: 0;
            padding: var(--space-4) var(--space-8);
            text-align: center;
            width: auto;

            &[aria-selected="true"] {
                color: var(--color-text-primary);
                font-weight: 600;
                text-decoration: underline;
                text-underline-offset: 0.35em;
            }
        }
    }

    .toolbar .tags {
        display: flex;
        flex-flow: row wrap;
        gap: var(--space-4);
        margin: 0;
        padding: 0;

        button.tag {
            background-color: var(--color-bg-trait);
            background-image: none;
            border: none;
            border-radius: 2px;
            box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.5);
            color: var(--color-text-trait);
            cursor: pointer;
            font: 500 var(--font-size-10) var(--sans-serif);
            height: auto;
            letter-spacing: 0.05em;
            line-height: 1.4;
            margin: 0;
            min-height: 0;
            padding: 0.3em 0.45em;
            text-shadow: none;
            text-transform: uppercase;
            width: auto;

            &.common {
                background-color: var(--color-rarity-common);
            }

            &.uncommon {
                background-color: var(--color-rarity-uncommon);
            }

            &.rare {
                background-color: var(--color-rarity-rare);
            }

            &.unique {
                background-color: var(--color-rarity-unique);
            }

            &:hover,
            &:focus {
                background-color: var(--color-bg-trait);
                background-image: none;
                text-shadow: none;
            }

            &.common:hover,
            &.common:focus {
                background-color: var(--color-rarity-common);
            }

            &.uncommon:hover,
            &.uncommon:focus {
                background-color: var(--color-rarity-uncommon);
            }

            &.rare:hover,
            &.rare:focus {
                background-color: var(--color-rarity-rare);
            }

            &.unique:hover,
            &.unique:focus {
                background-color: var(--color-rarity-unique);
            }

            &[aria-pressed="false"],
            &[aria-pressed="false"]:hover,
            &[aria-pressed="false"]:focus {
                filter: grayscale(1);
                opacity: 0.45;
            }

            &:focus-visible {
                outline: 1px solid var(--color-text-trait);
                outline-offset: 1px;
            }
        }
    }

    .choices {
        color: var(--color-text-secondary);
        display: flex;
        flex-flow: row wrap;
        font-size: var(--font-size-12);
        gap: var(--space-4) var(--space-12);

        label {
            align-items: center;
            display: flex;
            gap: var(--space-4);
            margin: 0;
            width: auto;
        }

        input {
            flex: 0 0 auto;
            margin: 0;
        }
    }

    search {
        display: flex;
        flex: 0 0 auto;
        flex-flow: column nowrap;
        padding: var(--space-8);

        :global(input) {
            color: var(--input-text-color, var(--color-text-primary));
            min-width: 0;
        }

        :global(input::placeholder) {
            color: var(--color-form-hint);
        }
    }

    menu {
        --scroll-margin: 0;
        display: flex;
        flex: 1 1 auto;
        flex-flow: column nowrap;
        list-style: none;
        margin: 0;
        min-height: 0;
        overflow: auto;
        padding: 0;

        li.section,
        ul {
            display: flex;
            flex-flow: column nowrap;
            list-style: none;
            margin: 0;
            padding: 0;
        }

        h3,
        h4 {
            margin: 0;
        }

        h3 {
            background: var(--color-pf-primary);
            color: var(--text-light);
            font: 600 var(--font-size-12) / 2 var(--sans-serif);
            letter-spacing: 0.04em;
            padding: 0 var(--space-8);
            position: sticky;
            text-transform: uppercase;
            top: 0;
            z-index: 1;
        }

        h4 {
            color: var(--color-text-secondary);
            font: 600 var(--font-size-12) / 1 var(--sans-serif);
            padding: var(--space-6) var(--space-8) var(--space-2) calc(2rem + 48px + 2 * var(--space-6));
        }

        li.feat {
            align-items: center;
            column-gap: var(--space-6);
            display: grid;
            grid-template:
                "level icon name buttons"
                "level icon tags buttons"
                "level icon source buttons"
                "level icon note buttons" / 2rem 48px minmax(0, 1fr) auto;
            padding: var(--space-4) var(--space-8) var(--space-4) var(--space-4);

            &:nth-of-type(odd) {
                background: var(--table-row-color-odd);
            }

            &:nth-of-type(even) {
                background: var(--table-row-color-even);
            }

            &:hover,
            &:has(:focus-visible) {
                background: var(--table-row-color-highlight);
            }

            &.unchecked {
                box-shadow: inset 3px 0 0 var(--color-border-trait);
            }

            &.illegal {
                color: var(--color-text-secondary);
            }
        }

        .level {
            align-self: center;
            color: var(--color-text-primary);
            font: 700 var(--font-size-14) / 1 var(--body-serif, var(--serif));
            font-variant-numeric: tabular-nums;
            grid-area: level;
            text-align: center;
        }

        img {
            border: none;
            grid-area: icon;
            height: 3rem;
            width: 3rem;
        }

        .name {
            color: var(--color-text-primary);
            font: 500 var(--font-size-14) / 1.2 var(--body-serif, var(--serif));
            grid-area: name;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .tags {
            grid-area: tags;
            margin: 0;
            padding: 0;
        }

        .source {
            color: var(--color-form-hint);
            font-size: var(--font-size-12);
            grid-area: source;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;

            &.publication {
                font-style: italic;
            }
        }

        .sentence,
        .failure {
            font-size: var(--font-size-12);
            grid-area: note;
        }

        .sentence,
        li.illegal .source,
        li.illegal .name,
        li.illegal .level {
            color: var(--color-text-secondary);
        }

        .failure {
            color: var(--color-level-error);
        }

        .buttons {
            --pf2e-inline-button-size: 1.25rem;

            align-self: center;
            display: flex;
            gap: var(--space-2);
            grid-area: buttons;
            justify-content: flex-end;

            :global(button[data-action="take"]) {
                --button-text-color: darkgreen;
                color: darkgreen;
            }
        }
    }
</style>
