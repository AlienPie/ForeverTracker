<script lang="ts">
  import { enhance } from "$app/forms";
  import { page } from "$app/state";
  import ContentBanner from "../../../../../../lib/components/ContentBanner.svelte";
  import ItemLink from "../../../../../../lib/components/ItemLink.svelte";
  import type { ChainPageData } from "./+page.server";

  let { data }: { data: ChainPageData } = $props();

  const back = $derived(`/c/${encodeURIComponent(page.params.guid ?? "")}/quests`);
  const STATE: Record<string, string> = {
    done: "done",
    "in-log": "in your log",
    available: "available now",
    locked: "locked",
    unavailable: "not available to you",
    skipped: "skipped, you completed what follows",
  };
  const WHY: Record<string, string> = {
    profession: "not for your professions",
    class: "not for your class",
    race: "not for your race",
  };
</script>

<svelte:head>{#if data.chain}<title>{data.chain.name}, quest chain, ForeverTracker</title>{/if}</svelte:head>

<p class="backlink"><a href={back}>&larr; Back to quests</a></p>

<section class="panel chainpage" aria-labelledby="cn">
  {#if !data.chain}
    <h2 id="cn">Quest chain</h2>
    <p class="sub">No chain to show yet: chains are built from the quest mirror, which is empty.</p>
    <ContentBanner contentMode={data.contentMode} />
  {:else}
    {@const c = data.chain}
    <h2 id="cn">{c.name}</h2>
    <p class="sub">
      {c.done} of {c.total} done{#if data.current !== null}, now at step {c.members.find((m) => m.questId === data.current)?.step} of {c.total}{/if}.
    </p>
    {#if c.otherRoute > 0}
      <p class="sub note">
        {c.otherRoute === 1 ? "One quest here is" : `${c.otherRoute} quests here are`} completed, but not through this chain: some
        quests have the same name in other starting regions, and only quests done after this chain's earlier steps count.
      </p>
    {/if}
    <div class="pips" aria-hidden="true">
      {#each c.members as m (m.questId)}<i class:done={m.state === "done" && !m.otherRoute} class:other={m.otherRoute} class:skipped={m.state === "skipped"} class:now={m.questId === data.current}></i>{/each}
    </div>
    <ol class="steps">
      {#each c.members as m (m.questId)}
        <li class="step st-{m.state}" class:other={m.otherRoute} class:current={m.questId === data.current} aria-current={m.questId === data.current ? "step" : undefined}>
          <span class="num" aria-hidden="true">{m.step ?? ""}</span>
          <div class="body">
            <h3>{#if m.step !== null}<span class="sr-only">Step {m.step}: </span>{/if}<ItemLink kind="quest" id={m.questId} name={m.name} /></h3>
            <div class="meta">
              <span class="tag state">{m.otherRoute ? "completed, but not through this chain" : m.state === "unavailable" ? (WHY[data.reasons?.[m.questId] ?? ""] ?? STATE.unavailable) : (STATE[m.state] ?? m.state)}</span>
              {#if m.questId === data.current}<span class="tag cont">current step</span>{/if}
              {#if data.manual.includes(m.questId)}
                <span class="tag">marked by you</span>
                <form method="POST" action="?/unmark" use:enhance class="inline"><input type="hidden" name="questId" value={m.questId} /><button type="submit" class="linkbtn">Remove mark</button></form>
              {:else if m.state !== "done" && m.state !== "unavailable"}
                <form method="POST" action="?/mark" use:enhance class="inline"><input type="hidden" name="questId" value={m.questId} /><button type="submit" class="linkbtn">Mark as completed</button></form>
              {/if}
              {#if m.zone}<span>{m.zone}</span>{/if}
              {#if m.giver}<span>from {m.giver}</span>{/if}
            </div>
          </div>
          <span class="lvl">level {m.level}</span>
        </li>
      {/each}
    </ol>
    {#if c.members.some((m) => m.state === "unavailable")}
      <p class="sub note">Dimmed steps are quests your character cannot take, going by Wowhead's class, race and profession tags. They are not counted above.</p>
    {/if}
    {#if c.members.some((m) => m.state === "skipped")}
      <p class="sub note">Dimmed steps marked skipped are not needed: you completed what follows them. They are not counted above.</p>
    {/if}
    <p class="sub foot">
      Order and prerequisites come from ForeverDB. "Available now" means you have finished the step just before it in the chain, so you can pick it up. Some steps
      can be reached from more than one earlier step, for example one per race or faction; finishing any one of those is enough.
    </p>
  {/if}
</section>
