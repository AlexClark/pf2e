<script lang="ts">
    import type { SearchState } from "./text-search.svelte.ts";

    interface SearchInputProps {
        search: SearchState;
        /** Localized input placeholder and aria-label */
        label: string;
        /** Localized result summary, announced while a search is active */
        resultsLabel: string;
        onkeydown?: (event: KeyboardEvent) => void;
    }

    const { search, label, resultsLabel, onkeydown }: SearchInputProps = $props();
</script>

<div class="search">
    <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
    <input
        type="search"
        spellcheck="false"
        data-keyboard-focus="true"
        bind:value={search.query}
        placeholder={label}
        aria-label={label}
        {onkeydown}
    />
</div>
<p class="search-results" role="status">
    {#if search.active}
        {resultsLabel}
    {/if}
</p>

<style>
    .search {
        align-items: center;
        display: flex;
        gap: var(--space-8);

        > i {
            color: var(--color-text-secondary, inherit);
        }

        > input {
            flex: 1;
            min-width: 0;
        }
    }

    .search-results {
        color: var(--color-text-secondary, inherit);
        font-size: var(--font-size-12);
        margin: 0;
        min-height: 0;
    }
</style>
