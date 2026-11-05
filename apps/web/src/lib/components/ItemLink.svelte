<script lang="ts">
  import { page } from "$app/state";
  import { entityUrl, type EntityKind, type TooltipProvider } from "../links";

  let { kind, id, name }: { kind: EntityKind; id: number; name: string } = $props();

  const provider = $derived((page.data.tooltipProvider ?? "none") as TooltipProvider);
  const href = $derived(entityUrl(kind, id, provider));
</script>

{#if href}<a {href} class="entity" target="_blank" rel="noopener noreferrer">{name}</a>{:else}{name}{/if}
