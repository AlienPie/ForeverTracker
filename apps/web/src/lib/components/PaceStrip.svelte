<script lang="ts">
  import type { PaceView } from "../journey-view";

  let { pace }: { pace: PaceView } = $props();
</script>

<div class="pace" role="img" aria-label={pace.label}>
  {#each pace.bars as b (b.level)}
    <div class="bar" class:slow={b.slow} class:now={b.now} class:gap={b.gap} style:height="{b.gap ? 0 : b.height}%" title={b.text}>
      {#if b.showLabel}<span>{b.level}</span>{/if}
    </div>
  {/each}
</div>
