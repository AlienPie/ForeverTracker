<script lang="ts">
  import type { RouteView } from "../journey-view";

  let { route }: { route: RouteView } = $props();
</script>

<svg class="route" viewBox="0 0 {route.width} {route.height}" role="img" aria-label={route.label}>
  <path class="path" d={route.path} />
  {#if route.lead}
    <g class="lead">
      <title>{route.lead.title}</title>
      <rect x={route.lead.x} y={route.lead.y - 10} width={route.lead.width} height="20" rx="10" />
      <text x={route.lead.x + route.lead.width / 2} y={route.lead.y + 4}>{route.lead.text}</text>
    </g>
  {/if}
  {#each route.stops as s (s.key)}
    <g class="stop">
      <title>{s.title}{s.when ? `, ${s.when}` : ""}</title>
      <circle class="zone" class:here={s.current} cx={s.x} cy={s.y} r="9" />
      <text class="name" x={s.labelX} y={s.nameY} text-anchor={s.side === "left" ? "end" : "start"}>{s.name}</text>
      {#if s.when}<text class="when" x={s.labelX} y={s.whenY} text-anchor={s.side === "left" ? "end" : "start"}>{s.when}</text>{/if}
    </g>
  {/each}
  {#each route.markers as m (m.key)}
    <g class="mark">
      <title>{m.title}</title>
      {#if m.range}
        <rect class="lv" x={m.x - m.width / 2} y={m.y - 9} width={m.width} height="18" rx="9" />
      {:else}
        <circle class="lv" cx={m.x} cy={m.y} r="9" />
      {/if}
      <text class="lvt" x={m.x} y={m.y + 4}>{m.text}</text>
    </g>
  {/each}
</svg>
