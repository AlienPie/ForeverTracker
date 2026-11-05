<script lang="ts">
  import type { Snippet } from "svelte";
  import { page } from "$app/state";
  import { formatMoney, formatPlayed } from "@ft/core/format";
  import CharacterName from "../../../lib/components/CharacterName.svelte";
  import Seal from "../../../lib/components/Seal.svelte";
  import XpBar from "../../../lib/components/XpBar.svelte";
  import { className, classColor, raceName } from "../../../lib/classes";
  import { syncLabel } from "../../../lib/sync";
  import type { CharacterLayoutData } from "./+layout.server";

  let { data, children }: { data: CharacterLayoutData; children: Snippet } = $props();

  const c = $derived(data.character);
  const base = $derived(`/c/${encodeURIComponent(c.guid)}`);
  const kind = $derived([raceName(c.race), className(c.class)].filter(Boolean).join(" "));
  const sync = $derived(syncLabel(c, data.now));
  const tabs = [
    { slug: "journey", label: "Journey" },
    { slug: "quests", label: "Quests" },
    { slug: "talents", label: "Talents" },
    { slug: "professions", label: "Professions" },
  ];
  // Path is /c/<guid>/<tab>[/...]: a tab stays marked on its sub-pages (a quest chain under Quests).
  const segments = $derived(page.url.pathname.split("/"));
  const active = $derived(tabs.find((t) => segments[3] === t.slug) ?? null);
  const onTabRoot = $derived(segments.length === 4);
</script>

<svelte:head><title>{c.name}{active ? `, ${active.label}` : ""}, ForeverTracker</title></svelte:head>

<div class="hero" style:--cc={classColor(c.class)}>
  <Seal level={c.level} classToken={c.class} />
  <div class="hero-main">
    <h1><CharacterName name={c.name} surname={c.surname} /></h1>
    <div class="facts">
      {#if kind}<span>{kind}</span>{/if}
      {#if c.zone}<span><span class="sr-only">Zone: </span><b>{c.zone}</b></span>{/if}
      {#if c.money !== null}<span><span class="sr-only">Money: </span><b>{formatMoney(c.money)}</b></span>{/if}
      {#if c.playedSeconds !== null}<span><b>{formatPlayed(c.playedSeconds)}</b> played</span>{/if}
      <span class:stale={sync.stale}>{sync.text}</span>
    </div>
    <XpBar pct={c.xpPct} level={c.level} />
  </div>
</div>

{#if c.unsupported}
  <p class="banner" role="status">
    The newest upload comes from a newer addon version than this server understands, so its details are not shown.
    Update ForeverTracker on the server to read it.
  </p>
{/if}

<nav class="tabs" aria-label="Character">
  {#each tabs as t (t.slug)}
    <a href="{base}/{t.slug}" aria-current={active?.slug === t.slug ? (onTabRoot ? "page" : "true") : undefined}>{t.label}</a>
  {/each}
</nav>

{@render children()}
