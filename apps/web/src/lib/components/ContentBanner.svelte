<script lang="ts">
  import type { ContentMode } from "@ft/content";

  let { contentMode }: { contentMode: ContentMode } = $props();
</script>

<p class="banner" role="status">
  {#if contentMode === "on-demand"}
    Quest suggestions are off: in on-demand content mode (<code>CONTENT_MODE=on-demand</code>) quest data is
    not loaded at page load. To get suggestions, set <code>CONTENT_MODE=mirror</code> and fill the local mirror
    with <code>pnpm content:sync</code> (needs <code>FOREVERDB_API_KEY</code>).
  {:else}
    Quest suggestions need the ForeverDB content mirror, which is empty. The owner can fill it by running
    <code>pnpm content:sync</code> with <code>FOREVERDB_API_KEY</code> set.
  {/if}
  For the container, see the <a href="https://github.com/AlienPie/ForeverTracker#readme">README</a>.
</p>
