<script lang="ts">
  import { page } from "$app/state";
  import ItemLink from "../../../../lib/components/ItemLink.svelte";
  import type { ReputationPageData } from "./+page.server";

  let { data }: { data: ReputationPageData } = $props();
  const chainHref = (questId: number) => `/c/${encodeURIComponent(page.params.guid ?? "")}/quests/chain/${questId}`;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
</script>

<section class="panel" aria-labelledby="rep">
  <h2 id="rep">Reputation</h2>
  {#if data.rows === null}
    <p class="sub">
      Reputation comes from Blizzard's profile for this character.
      {#if data.canApiSync}Use "Sync from Blizzard" in the header to load it.{:else}Set BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET to turn that on.{/if}
      Characters under level 10 have no Blizzard profile.
    </p>
  {:else if data.rows.length === 0}
    <p class="sub">Blizzard lists no reputation standings for this character yet.</p>
  {:else}
    <p class="sub">Standings from Blizzard's profile. Quests listed raise that faction and are open to you now (up to three levels above yours).</p>
    <ul class="reps">
      {#each data.rows as r (r.id)}
        <li class="rep">
          <div class="rhead">
            <span class="rname">{r.name}</span>
            <span class="tag" class:cont={r.maxed}>{r.tierName}</span>
            <span class="rnum">{#if r.maxed}maxed{:else}{r.value.toLocaleString("en")} / {r.max.toLocaleString("en")}, {r.remaining.toLocaleString("en")} to go{/if}</span>
          </div>
          <div class="track" role="progressbar" aria-label="{r.name} standing" aria-valuemin="0" aria-valuemax="100" aria-valuenow={r.pct}><i style:width="{r.pct}%"></i></div>
          {#if r.openCount > 0}
            <details>
              <summary>{plural(r.openCount, "quest", "quests")} open now, worth {r.openTotal.toLocaleString("en")} reputation</summary>
              <ul class="rq">
                {#each r.open as q (q.questId)}
                  <li><ItemLink kind="quest" id={q.questId} name={q.name} /> <span class="lvl">level {q.level}</span> <span class="rv">+{q.value}</span> <a class="open" href={chainHref(q.questId)}>chain</a></li>
                {/each}
              </ul>
              {#if r.openCount > r.open.length}<p class="sub">and {r.openCount - r.open.length} more, smaller ones.</p>{/if}
            </details>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>
