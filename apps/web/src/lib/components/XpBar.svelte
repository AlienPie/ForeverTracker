<script lang="ts">
  let { pct, level }: { pct: number | null; level: number | null } = $props();

  const label = $derived(
    pct === null
      ? "Experience unknown"
      : level === null
        ? `${pct} percent of the current level`
        : `${pct} percent of level ${level}`,
  );
</script>

<div class="xp" role="img" aria-label={label}><i style:width="{pct ?? 0}%"></i></div>
