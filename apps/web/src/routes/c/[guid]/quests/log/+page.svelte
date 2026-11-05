<script lang="ts">
  import { page as pageState } from "$app/state";
  import ContentBanner from "../../../../../lib/components/ContentBanner.svelte";
  import ItemLink from "../../../../../lib/components/ItemLink.svelte";
  import type { QuestLogPageData } from "./+page.server";

  let { data }: { data: QuestLogPageData } = $props();

  const base = $derived(`/c/${encodeURIComponent(pageState.params.guid ?? "")}/quests`);
  const href = (list: string, p: number, q: string) => {
    const s = new URLSearchParams({ list });
    if (q) s.set("q", q);
    if (p > 1) s.set("page", String(p));
    return `${base}/log?${s}`;
  };
  const label = $derived(data.list === "completed" ? "Completed" : "In progress");
</script>

<svelte:head><title>Quest log, {label}, ForeverTracker</title></svelte:head>

<p class="backlink"><a href={base}>&larr; Back to quests</a></p>

<section class="panel logpage" aria-labelledby="ql">
  <h2 id="ql">Quest log</h2>
  <nav class="logtabs" aria-label="Quest lists">
    <a href={href("progress", 1, data.q)} aria-current={data.list === "progress" ? "page" : undefined}>In progress ({data.counts.progress})</a>
    <a href={href("completed", 1, data.q)} aria-current={data.list === "completed" ? "page" : undefined}>Completed ({data.counts.completed})</a>
  </nav>

  {#if !data.contentReady}
    <p class="sub">Quest names are not available yet, so quests show by number.</p>
    <ContentBanner contentMode={data.contentMode} />
  {/if}

  <form method="get" class="logsearch" action="{base}/log">
    <input type="hidden" name="list" value={data.list} />
    <label for="logq">Search {label.toLowerCase()} quests by name</label>
    <span class="row">
      <input id="logq" name="q" type="search" value={data.q} maxlength="100" autocomplete="off" />
      <button type="submit">Search</button>
    </span>
  </form>

  <p class="sub" role="status">
    {#if data.total === 0}
      {#if data.q}No {label.toLowerCase()} quest matches "{data.q}".{:else}No quests {data.list === "completed" ? "completed yet" : "in progress"}.{/if}
    {:else}
      {data.total} {data.total === 1 ? "quest" : "quests"}{data.q ? ` matching "${data.q}"` : ""}, page {data.page} of {data.pages}.
    {/if}
  </p>

  {#if data.rows.length > 0}
    <ol class="quests logrows">
      {#each data.rows as r (r.questId)}
        <li class="quest">
          <h3><ItemLink kind="quest" id={r.questId} name={r.name} /></h3>
          <span class="lvl">{r.level === null ? "level unknown" : `level ${r.level}`}</span>
          {#if r.zone}<div class="why">{r.zone}</div>{/if}
        </li>
      {/each}
    </ol>
  {/if}

  {#if data.pages > 1}
    <nav class="pager" aria-label="Pages">
      {#if data.page > 1}<a rel="prev" href={href(data.list, data.page - 1, data.q)}>&larr; Previous</a>{:else}<span aria-hidden="true"></span>{/if}
      <span class="sub">Page {data.page} of {data.pages}</span>
      {#if data.page < data.pages}<a rel="next" href={href(data.list, data.page + 1, data.q)}>Next &rarr;</a>{:else}<span aria-hidden="true"></span>{/if}
    </nav>
  {/if}
</section>
