<script lang="ts">
  import { page } from "$app/state";
  import ContentBanner from "../../../../lib/components/ContentBanner.svelte";
  import type { ZoneProgress } from "@ft/core";
  import type { ExplorePageData } from "./+page.server";

  let { data }: { data: ExplorePageData } = $props();

  const FIT: Record<string, string> = { "in-range": "in range", below: "below your level", above: "above your level" };
  const chainHref = (questId: number) => `/c/${encodeURIComponent(page.params.guid ?? "")}/quests/chain/${questId}`;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const range = (min: number | null, max: number | null) =>
    min === null ? null : max === null || max === min ? `level ${min}` : `levels ${min} to ${max}`;
  const meta = (z: ZoneProgress) =>
    data.hasZoneData ? [range(z.minLevel, z.maxLevel), z.territory].filter(Boolean).join(", ") : "";
  const pct = (done: number, total: number) => (total > 0 ? `${Math.round((done / total) * 100)}%` : null);
  const SORTS = [
    { id: "level", label: "Level" },
    { id: "complete", label: "Most complete" },
    { id: "recent", label: "Recently active" },
  ];
  const share = (done: number, total: number) => (total > 0 ? Math.round((done / total) * 100) : 0);
</script>

{#snippet meter(label: string, done: number, total: number)}
  <div class="meter">
    <div class="mhead"><span>{label}</span><span>{done} / {total} <span class="sub">{share(done, total)}%</span></span></div>
    <div class="track" role="progressbar" aria-label={label} aria-valuemin="0" aria-valuemax={total} aria-valuenow={done}><i style:width="{share(done, total)}%"></i></div>
  </div>
{/snippet}

<section class="panel explore" aria-labelledby="ex">
  <h2 id="ex">Explore</h2>
  {#if !data.contentReady}
    <p class="sub">No zone progress yet.</p>
    <ContentBanner contentMode={data.contentMode} />
  {:else}
    <div class="meters">
      {@render meter("All zones", data.all.done, data.all.total)}
      {@render meter(`Visited zones (${data.visited.length})`, data.seen.done, data.seen.total)}
    </div>

    <h3 class="zhead">Visited</h3>
    {#if data.visited.length > 1}
      <p class="sorts" aria-label="Sort visited zones">
        Sort by
        {#each SORTS as s (s.id)}
          <a href="?sort={s.id}" aria-current={data.sort === s.id ? "true" : undefined}>{s.label}</a>
        {/each}
      </p>
    {/if}
    {#if data.visited.length === 0}
      <p class="sub">No zone visited yet. Zones show here once you have been there or done one of their quests.</p>
    {/if}
    {#each data.visited as z (z.name)}
      <details class="zone">
        <summary>
          <span class="zname">{z.name}</span>
          <span class="zmeta">
            {meta(z)}{#if meta(z) && FIT[z.fit]}, {/if}
            {#if FIT[z.fit]}<span class="tag" class:cont={z.fit === "in-range"}>{FIT[z.fit]}</span>{/if}
          </span>
          <span class="zcount">{z.done} / {z.total}{#if pct(z.done, z.total)} <span class="sub">{pct(z.done, z.total)}</span>{/if}</span>
          {#if z.total > 0}<span class="track zbar" aria-hidden="true"><i style:width="{share(z.done, z.total)}%"></i></span>{/if}
        </summary>
        <div class="zbody">
          {#if z.inProgress.length > 0}
            <h4>In progress</h4>
            <ul class="zquests">
              {#each z.inProgress as q (q.id)}
                <li><a href={chainHref(q.id)}>{q.name}</a> <span class="lvl">level {q.level}</span> <span class="hint">{q.inLog ? "in your log" : "next in a chain you are on"}</span></li>
              {/each}
            </ul>
          {/if}
          <h4>Not done</h4>
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
          {#if z.completedQuests.length > 0}
            <h4>Completed</h4>
            <ul class="zquests">
              {#each z.completedQuests as q (q.id)}
                <li><a href={chainHref(q.id)}>{q.name}</a> <span class="lvl">level {q.level}</span></li>
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
              {meta(z)}{#if meta(z) && FIT[z.fit]}, {/if}
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
        {plural(data.unplaced, "quest", "quests")} with no map zone (class, profession, event and other quests) {data.unplaced === 1 ? "is" : "are"} not counted.
      </p>
    {/if}
  {/if}
</section>
