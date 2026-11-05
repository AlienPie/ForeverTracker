<script lang="ts">
  import type { JourneyPageData } from "./+page.server";

  let { data }: { data: JourneyPageData } = $props();
</script>

<div class="cols">
  <section class="panel" aria-labelledby="tl">
    <h2 id="tl">Timeline</h2>
    {#if data.events.length === 0}
      <p class="sub">
        Nothing recorded yet. Level-ups, quest turn-ins and profession changes are recorded as you play and appear
        after your next upload.
      </p>
    {:else}
      <p class="sub">
        Newest first. Times are UTC.{#if data.eventsTotal > data.events.length}
          Showing the newest {data.events.length} of {data.eventsTotal} events.{/if}
      </p>
      <ol class="timeline">
        {#each data.events as e, i (i)}
          <li class="ev ev-{e.kind}">
            {#if e.iso}<time datetime={e.iso}>{e.when}</time>{:else}<span class="when">Time unknown</span>{/if}
            <span>{e.text}</span>
          </li>
        {/each}
      </ol>
    {/if}
  </section>

  <aside class="side" aria-label="Exploration">
    <section class="panel" aria-labelledby="pl">
      <h2 id="pl">Places you have visited</h2>
      {#if data.places.length === 0}
        <p class="sub">No places recorded yet. Exploration is recorded as you play and appears after your next upload.</p>
      {:else}
        <p class="sub">{data.places.length} {data.places.length === 1 ? "zone" : "zones"}, most recent first.</p>
        <ul class="places">
          {#each data.places as p (p.mapId)}
            <li>
              <div class="top"><span>{p.name}</span><span class="sub">{p.since ? `since ${p.since}` : "first visit time unknown"}</span></div>
              {#if p.subzones.length > 0}<div class="subz">{p.subzones.join(", ")}</div>{/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </aside>
</div>
