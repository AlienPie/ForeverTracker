<script lang="ts">
  import type { TalentsPageData } from "./+page.server";

  let { data }: { data: TalentsPageData } = $props();
</script>

<div class="cols">
  <section class="panel" aria-labelledby="tp">
    <h2 id="tp">Talent points</h2>
    {#if data.level !== null && data.level < 10}
      <p class="sub">Talents unlock at level 10.</p>
    {:else if data.talents === null}
      <p class="sub">Not recorded yet. Talent points appear after the next upload from the addon.</p>
    {:else}
      <p class="big"><b>{data.talents.unspent}</b> unspent {data.talents.unspent === 1 ? "point" : "points"}</p>
      {#if data.talents.unspent > 0}
        <p class="sub">Visit your class trainer or open the talent pane in game to spend them.</p>
      {/if}
    {/if}
  </section>
  <aside class="side">
    <section class="panel" aria-labelledby="tb">
      <h2 id="tb">Builds</h2>
      <p class="sub">Recommended builds arrive in a later release.</p>
    </section>
  </aside>
</div>
