<script lang="ts">
  import { formatMoney, formatPlayed } from "@ft/core/format";
  import CharacterCard from "../lib/components/CharacterCard.svelte";
  import ContentBanner from "../lib/components/ContentBanner.svelte";
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
    <ContentBanner contentMode={data.contentMode} />
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
