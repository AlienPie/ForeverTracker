<script lang="ts">
  import type { CharacterCard, Suggestion } from "@ft/core";
  import { formatMoney, formatPlayed } from "@ft/core/format";
  import { className, raceName } from "../classes";
  import { syncLabel } from "../sync";
  import Seal from "./Seal.svelte";
  import XpBar from "./XpBar.svelte";

  let {
    card,
    next,
    contentReady,
    now,
  }: { card: CharacterCard; next: Suggestion | null; contentReady: boolean; now: number } = $props();

  const who = $derived.by(() => {
    const kind = [raceName(card.race), className(card.class)].filter(Boolean).join(" ");
    if (kind && card.zone) return `${kind} in ${card.zone}`;
    return kind || (card.zone ? `In ${card.zone}` : "-");
  });
  const toNext = $derived(
    card.xpPct !== null && card.level !== null ? `${card.xpPct}% to ${card.level + 1}` : "-",
  );
  const sync = $derived(syncLabel(card, now));
</script>

<a class="card" href="/c/{encodeURIComponent(card.guid)}">
  <Seal level={card.level} classToken={card.class} />
  <h3>{card.name}</h3>
  <div class="cls">{who}</div>
  <XpBar pct={card.xpPct} level={card.level} />
  <div class="row">
    <span>{toNext}</span><span>{card.money === null ? "-" : formatMoney(card.money)}</span>
  </div>
  <div class="row">
    <span>{card.playedSeconds === null ? "-" : `${formatPlayed(card.playedSeconds)} played`}</span>
    <span class:stale={sync.stale}>{sync.text}</span>
  </div>
  {#if card.professions.length > 0}
    <ul class="chips" aria-label="Professions">
      {#each card.professions as p (p.skillLine + p.name)}
        <li class="chip">{p.name} {p.rank}</li>
      {/each}
    </ul>
  {/if}
  {#if contentReady}
    <div class="next">
      <em>Next</em>{#if next}&ldquo;{next.title}&rdquo;: {next.reason}{:else}No suggestion yet{/if}
    </div>
  {/if}
</a>
