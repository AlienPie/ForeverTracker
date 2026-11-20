<script lang="ts">
  import { page } from "$app/state";
  import ContentBanner from "../../../../lib/components/ContentBanner.svelte";
  import type { ExplorePageData } from "./+page.server";

  let { data }: { data: ExplorePageData } = $props();

  const FIT: Record<string, string> = { "in-range": "in range", below: "below your level", above: "above your level" };
  const chainHref = (questId: number) => `/c/${encodeURIComponent(page.params.guid ?? "")}/quests/chain/${questId}`;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const range = (min: number | null, max: number | null) =>
    min === null ? null : max === null || max === min ? `level ${min}` : `levels ${min} to ${max}`;
  const pct = (done: number, total: number) => (total > 0 ? `${Math.round((done / total) * 100)}%` : null);
  const doneInVisited = $derived(data.visited.reduce((n, z) => n + z.done, 0));
</script>

<section class="panel explore" aria-labelledby="ex">
  <h2 id="ex">Explore</h2>
  {#if !data.contentReady}
    <p class="sub">No zone progress yet.</p>
    <ContentBanner contentMode={data.contentMode} />
  {:else}
    <p class="sub">
      {plural(data.visited.length, "zone", "zones")} visited, {plural(doneInVisited, "quest", "quests")} done in them.
    </p>

    <h3 class="zhead">Visited</h3>
    {#if data.visited.length === 0}
      <p class="sub">No zone visited yet. Zones show here once you have been there or done one of their quests.</p>
    {/if}
    {#each data.visited as z (z.name)}
      <details class="zone">
        <summary>
          <span class="zname">{z.name}</span>
          <span class="zmeta">
            {#if data.hasZoneData}
              {#if range(z.minLevel, z.maxLevel)}{range(z.minLevel, z.maxLevel)}, {/if}{#if z.territory}{z.territory}, {/if}
            {/if}
            {#if FIT[z.fit]}<span class="tag" class:cont={z.fit === "in-range"}>{FIT[z.fit]}</span>{/if}
          </span>
          <span class="zcount">{z.done} / {z.total}{#if pct(z.done, z.total)} <span class="sub">{pct(z.done, z.total)}</span>{/if}</span>
        </summary>
        <div class="zbody">
          {#if z.inLog > 0}<p class="sub">{z.inLog} in your log</p>{/if}
          {#if z.remaining.length > 0}
            <ul class="zquests">
              {#each z.remaining as q (q.id)}
                <li><a href={chainHref(q.id)}>{q.name}</a> <span class="lvl">level {q.level}</span></li>
              {/each}
            </ul>
          {:else}
            <p class="sub">Nothing left that is open to you here.</p>
          {/if}
          {#if z.skippedQuests.length > 0}
            <h4>Skipped</h4>
            <ul class="zquests dim">
              {#each z.skippedQuests as q (q.id)}
                <li><a href={chainHref(q.id)}>{q.name}</a> <span class="lvl">level {q.level}</span> <span class="hint">skipped, you completed what follows</span></li>
              {/each}
            </ul>
          {/if}
        </div>
      </details>
    {/each}

    <h3 class="zhead">Not visited yet</h3>
    {#if data.unvisited.length === 0}
      <p class="sub">Every zone with quests has been visited.</p>
    {:else}
      <ul class="zlist">
        {#each data.unvisited as z (z.name)}
          <li>
            <span class="zname">{z.name}</span>
            <span class="zmeta">
              {#if data.hasZoneData}
                {#if range(z.minLevel, z.maxLevel)}{range(z.minLevel, z.maxLevel)}, {/if}{#if z.territory}{z.territory}, {/if}
              {/if}
              {#if FIT[z.fit]}<span class="tag" class:cont={z.fit === "in-range"}>{FIT[z.fit]}</span>{/if}
            </span>
            <span class="zcount">{plural(z.total, "quest", "quests")}</span>
          </li>
        {/each}
      </ul>
    {/if}

    {#if !data.hasZoneData}
      <p class="sub foot">
        Level ranges are not available: the zone list is empty. To add it, follow section 2 (the zones page) of
        <code>docs/wowhead-data-guide.md</code>.
      </p>
    {/if}
    {#if data.unplaced > 0}
      <p class="sub foot">
        {plural(data.unplaced, "quest has", "quests have")} no zone and {data.unplaced === 1 ? "is" : "are"} not counted.
      </p>
    {/if}
  {/if}
</section>
