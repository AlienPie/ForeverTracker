<script lang="ts">
  import { onMount } from "svelte";
  import PaceStrip from "../../../../lib/components/PaceStrip.svelte";
  import RouteStrip from "../../../../lib/components/RouteStrip.svelte";
  import SessionCard from "../../../../lib/components/SessionCard.svelte";
  import type { JourneyPageData } from "./+page.server";

  let { data }: { data: JourneyPageData } = $props();

  // The server renders UTC; after mount the cards switch to the browser's time zone.
  // Starting false keeps the first browser render identical to the server's.
  let local = $state(false);
  onMount(() => {
    local = true;
  });
</script>

<div class="jwrap">
  {#if data.empty}
    <p class="empty">No play recorded yet. The addon records your levels, quests and places as you play.</p>
  {:else}
    <div class="top">
      <section class="panel" aria-labelledby="pace">
        <h2 id="pace">Time per level</h2>
        {#if data.pace.bars.length === 0}
          <p class="sub">No level-ups recorded yet. Each new level appears here after your next upload.</p>
        {:else}
          <p class="sub">{data.pace.caption}</p>
          <PaceStrip pace={data.pace} />
          <p class="pace-note">Real-world gaps between sessions are not counted, so a pause overnight does not stretch a level.</p>
        {/if}
      </section>

      <section class="panel dark" aria-labelledby="rt">
        <h2 id="rt">Your route</h2>
        {#if data.route.stops.length === 0}
          <p class="sub">No places recorded yet. Zones appear here as you reach them.</p>
        {:else}
          <p class="sub">Places in the order you first reached them.</p>
          <RouteStrip route={data.route} />
        {/if}
      </section>
    </div>

    <section aria-labelledby="jn">
      <h2 id="jn">Play sessions</h2>
      <p class="note tz">
        {#if local}Times are in your time zone.{:else}Times are in UTC.{/if}
        A break of half an hour or more starts a new session.
      </p>
      <div class="journal">
        {#each data.sessions as s (s.t)}
          <SessionCard session={s} {local} />
        {/each}
        {#if data.sessionsNote}
          <p class="note">{data.sessionsNote.text} <a href={data.sessionsNote.href}>{data.sessionsNote.linkText}</a></p>
        {/if}
        {#if data.eventsNote}<p class="note">{data.eventsNote}</p>{/if}
      </div>
    </section>
  {/if}
</div>
