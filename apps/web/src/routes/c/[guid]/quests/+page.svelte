<script lang="ts">
  import { page } from "$app/state";
  import ContentBanner from "../../../../lib/components/ContentBanner.svelte";
  import ItemLink from "../../../../lib/components/ItemLink.svelte";
  import type { QuestsPageData } from "./+page.server";

  let { data }: { data: QuestsPageData } = $props();

  const TAG: Record<string, string> = {
    chain: "chain step",
    area: "same area",
    "next-level": "next level",
    profession: "profession",
  };
  const chainHref = (questId: number) => `/c/${encodeURIComponent(page.params.guid ?? "")}/quests/chain/${questId}`;
  const exploreHref = $derived(`/c/${encodeURIComponent(page.params.guid ?? "")}/explore`);
  const logHref = (list: string) => `/c/${encodeURIComponent(page.params.guid ?? "")}/quests/log?list=${list}`;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
</script>

<div class="cols">
  <div class="mainstack">
  <section class="panel" aria-labelledby="nu">
    <h2 id="nu">Next up</h2>
    {#if !data.contentReady}
      <p class="sub">No recommendation yet.</p>
      <ContentBanner contentMode={data.contentMode} />
    {:else if data.suggestions.length === 0}
      <p class="sub">
        Nothing to suggest right now.
        {#if data.level === null}
          The character's level is not recorded yet; it appears after the next upload.
        {:else}
          No quest in the mirror is open to you here at level {data.level}. Moving to a new area or levelling up
          brings new ones.
        {/if}
      </p>
    {:else}
      <p class="sub">Quests you can do now at level {data.level}, chain continuations first, then nearby ones.</p>
      <ol class="quests">
        {#each data.suggestions as s (s.questId ?? s.title)}
          <li class="quest">
            <h3>{#if s.questId !== null}<ItemLink kind="quest" id={s.questId} name={s.title} />{:else}{s.title}{/if}</h3>
            <span class="lvl">level {s.level}</span>
            <div class="why">
              <span class="tag" class:cont={s.kind === "chain" && s.confidence === "high"}>{TAG[s.kind] ?? s.kind}</span>{s.reason}
              {#if s.confidence === "low"}<span class="hint">{s.kind === "chain" ? "May be a long way off." : "Less certain."}</span>{/if}
              {#if s.kind === "chain" && s.questId !== null}<a class="open" href={chainHref(s.questId)}>See the chain<span class="sr-only"> for {s.title}</span></a>{/if}
            </div>
          </li>
        {/each}
      </ol>
      <p class="sub foot">
        Why these? Quests come from ForeverDB. Class, race and profession quests are matched to your character using Blizzard's quest data.
      </p>
    {/if}
  </section>

  {#if data.contentReady && data.whereNext.length > 0}
    <section class="panel where" aria-labelledby="wn">
      <h2 id="wn">Where to next</h2>
      <p class="sub">Areas with the most open quests close to your level {data.level}.</p>
      <ol class="quests">
        {#each data.whereNext as z (z.name)}
          <li class="quest">
            <h3><a href={exploreHref}>{z.name}</a>{#if z.here} <span class="tag">you are here</span>{/if}</h3>
            <div class="why">{z.reason}</div>
          </li>
        {/each}
      </ol>
    </section>
  {/if}
  </div>

  <aside class="side" aria-label="Quest progress">
    <section class="panel" aria-labelledby="ch">
      <h2 id="ch">Quest chains</h2>
      {#if !data.contentReady}
        <p class="sub">Chains appear once the quest mirror is filled.</p>
      {:else if data.chains.length === 0}
        <p class="sub">No chain under way. A chain shows here once one of its quests is in your log, or you have done a step past a shared starter quest.</p>
      {:else}
        <p class="sub">Started or partly done.</p>
        <ul class="chains">
          {#each data.chains as c (c.chain)}
            <li class="chain">
              <div class="top"><a href={chainHref(c.chain)}>{c.name}</a><span class="sub">{c.done} of {c.total}</span></div>
              <div class="pips" aria-hidden="true">
                {#each c.pips as p, i (i)}<i class:done={p === "done"} class:now={p === "now"}></i>{/each}
              </div>
            </li>
          {/each}
        </ul>
        <div class="note">Chains with a quest in your log or a step done past a shared starter quest. Open one to see every step; chains are rebuilt from prerequisites in the quest database.</div>
      {/if}
    </section>
    <section class="panel" aria-labelledby="lg">
      <h2 id="lg">Quest log</h2>
      <p class="sub">
        {plural(data.inProgress, "quest", "quests")} in progress, {data.completed} completed.
      </p>
      <ul class="loglinks">
        <li><a href={logHref("progress")}>In progress ({data.inProgress})</a></li>
        <li><a href={logHref("completed")}>Completed ({data.completed})</a></li>
      </ul>
    </section>
  </aside>
</div>
