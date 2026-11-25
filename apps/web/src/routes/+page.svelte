<script lang="ts">
  import { formatMoney, formatPlayed } from "@ft/core/format";
  import CharacterCard from "../lib/components/CharacterCard.svelte";
  import ContentBanner from "../lib/components/ContentBanner.svelte";
  import { page } from "$app/state";
  import { ago } from "../lib/sync";
  import type { RosterPageData } from "./+page.server";

  let { data }: { data: RosterPageData } = $props();

  const chars = $derived(data.roster.characters);
  const totals = $derived(data.roster.totals);
  const allResult = $derived.by(() => {
    const v = page.url.searchParams.get("apisyncall");
    const n = v?.split(",").map(Number);
    if (!n || n.length !== 4 || n.some((x) => !Number.isInteger(x) || x < 0)) return null;
    const [synced, none, skipped, failed] = n as [number, number, number, number];
    const parts = [`${synced} synced`];
    if (none > 0) parts.push(`${none} not known to Blizzard`);
    if (skipped > 0) parts.push(`${skipped} skipped (under level 10 or no surname yet)`);
    if (failed > 0) parts.push(`${failed} failed, see the server log`);
    return parts.join(", ") + ".";
  });
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

  {#if data.canApiSync}
    <form class="apisync" method="POST" action="/api-sync-all">
      <button type="submit" class="linkbtn">Sync all from Blizzard</button>
      {#if allResult}<span role="status">{allResult}</span>{/if}
    </form>
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
