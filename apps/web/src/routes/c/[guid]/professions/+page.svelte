<script lang="ts">
  import type { ProfessionsPageData } from "./+page.server";

  let { data }: { data: ProfessionsPageData } = $props();

  const pct = (rank: number, max: number) => (max > 0 ? Math.min(100, Math.floor((rank * 100) / max)) : 0);
</script>

<div class="cols">
  <section class="panel" aria-labelledby="pr">
    <h2 id="pr">Professions</h2>
    {#if data.professions.length === 0}
      <p class="sub">
        No professions yet. Learn one from a profession trainer; it appears here after your next
        upload.
      </p>
    {:else}
      <p class="sub">Skill from your latest upload.</p>
      <ul class="skills">
        {#each data.professions as p (p.skillLine + p.name)}
          <li>
            <div class="top"><span>{p.name}</span><span class="rank">{p.rank} / {p.max}</span></div>
            <div class="xp" role="img" aria-label="{p.name}: skill {p.rank} of {p.max}"><i style:width="{pct(p.rank, p.max)}%"></i></div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
  <aside class="side">
    <section class="panel" aria-labelledby="rc">
      <h2 id="rc">Recipes</h2>
      <p class="sub">Recipes and trainer advice arrive in a later release.</p>
    </section>
  </aside>
</div>
