<script lang="ts">
  import { formatMoney, formatPlayed } from "@ft/core/format";
  import CharacterCard from "../lib/components/CharacterCard.svelte";
  import { ago } from "../lib/sync";
  import type { RosterPageData } from "./+page.server";

  let { data }: { data: RosterPageData } = $props();

  const chars = $derived(data.roster.characters);
  const totals = $derived(data.roster.totals);
  const newest = $derived(chars.find((c) => c.syncedAgo !== "unknown") ?? null);
</script>

<svelte:head><title>Roster, ForeverTracker</title></svelte:head>

<div class="account"><h1>Your characters</h1></div>

{#if chars.length === 0}
  <p class="empty">No characters yet. <a href="/upload">Upload a ForeverTracker file to begin</a>.</p>
{:else}
  {#if newest}
    <p class="sub" style="margin:-12px 0 6px">Last upload {ago(data.now - newest.takenAt)}.</p>
  {/if}

  {#if !data.contentReady}
    <p class="banner" role="status">
      {#if data.contentMode === "on-demand"}
        Quest suggestions are off: in on-demand content mode (<code>CONTENT_MODE=on-demand</code>) quest data is
        not loaded at page load. To get suggestions, set <code>CONTENT_MODE=mirror</code> and fill the local mirror
        with <code>pnpm content:sync</code> (needs <code>FOREVERDB_API_KEY</code>).
      {:else}
        Quest suggestions need the ForeverDB content mirror, which is empty. The owner can fill it by running
        <code>pnpm content:sync</code> with <code>FOREVERDB_API_KEY</code> set.
      {/if}
      For the container, see the <a href="https://github.com/AlienPie/ForeverTracker#readme">README</a>.
    </p>
  {/if}

  <div class="account">
    <div><b>{totals.count}</b><span>{totals.count === 1 ? "character" : "characters"}</span></div>
    <div><b>{formatPlayed(totals.playedSeconds)}</b><span>played</span></div>
    <div><b>{formatMoney(totals.money)}</b><span>across the account</span></div>
  </div>

  <ul class="roll" aria-label="Characters">
    {#each chars as card (card.guid)}
      <li>
        <CharacterCard {card} next={data.nextByGuid[card.guid] ?? null} contentReady={data.contentReady} now={data.now} />
      </li>
    {/each}
  </ul>
{/if}
