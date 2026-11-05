<script lang="ts">
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
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
</script>

<div class="cols">
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
            </div>
          </li>
        {/each}
      </ol>
      <p class="sub foot">
        Why these? Quests come from ForeverDB. Class quests are matched to your class; race quests are not tagged yet, so some may be missing.
      </p>
    {/if}
  </section>

  <aside class="side" aria-label="Quest progress">
    <section class="panel" aria-labelledby="ch">
      <h2 id="ch">Quest chains</h2>
      {#if !data.contentReady}
        <p class="sub">Chains appear once the quest mirror is filled.</p>
      {:else if data.chains.length === 0}
        <p class="sub">No chain started yet. Chains show here once you complete or pick up one of their quests.</p>
      {:else}
        <p class="sub">Started or partly done.</p>
        <ul class="chains">
          {#each data.chains as c (c.chain)}
            <li class="chain">
              <div class="top"><span>{c.name}</span><span class="sub">{c.done} of {c.total}</span></div>
              <div class="pips" aria-hidden="true">
                {#each c.pips as p, i (i)}<i class:done={p === "done"} class:now={p === "now"}></i>{/each}
              </div>
            </li>
          {/each}
        </ul>
        <div class="note">Chains are rebuilt from prerequisites in the quest database.</div>
      {/if}
    </section>
    <section class="panel" aria-labelledby="lg">
      <h2 id="lg">Quest log</h2>
      <p class="sub">
        {plural(data.inProgress, "quest", "quests")} in progress, {data.completed} completed.
      </p>
    </section>
  </aside>
</div>
