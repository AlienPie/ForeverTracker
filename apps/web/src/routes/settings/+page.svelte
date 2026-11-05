<script lang="ts">
  import { enhance } from "$app/forms";
  import { ingestCommand } from "../../lib/ingest-command";
  import type { ActionData, PageData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const created = $derived(form && "created" in form ? form.created : null);
  const error = $derived(form && "error" in form ? (form.error as string) : null);
  const errorFor = $derived(form && "action" in form ? (form.action as string) : null);
  const content = $derived(data.content);
</script>

<svelte:head><title>Settings, ForeverTracker</title></svelte:head>

<div class="account"><h1>Settings</h1></div>

<div class="stack">
  <section class="panel formpanel" aria-labelledby="tok-title">
    <h2 id="tok-title">Device tokens</h2>
    <p class="sub">A token lets a script on your computer upload the file without opening this page.</p>

    {#if data.tokens.length === 0}
      <p class="empty-note">No tokens yet.</p>
    {:else}
      <ul class="rows" aria-label="Device tokens">
        {#each data.tokens as t (t.id)}
          <li>
            <span class="grow"><b>{t.label}</b> <span class="sub">{t.created ? `created ${t.created}` : "created at an unknown time"}</span></span>
            <span class="tag" class:cont={!t.revoked}>{t.revoked ? "revoked" : "active"}</span>
            {#if !t.revoked}
              <form method="POST" action="?/revoke" use:enhance>
                <input type="hidden" name="id" value={t.id} />
                <button class="btn ghost" type="submit" aria-label={`Revoke token ${t.label}`}>Revoke</button>
              </form>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
    {#if error && errorFor === "revoke"}<p class="error" role="alert">{error}</p>{/if}

    <form method="POST" action="?/create" use:enhance class="create">
      <label for="label">New token label</label>
      <input id="label" name="label" type="text" maxlength="60" required autocomplete="off" placeholder="Desktop" />
      <button class="btn" type="submit">Create token</button>
    </form>
    {#if error && errorFor === "create"}<p class="error" role="alert">{error}</p>{/if}

    <div role="status" aria-live="polite">
      {#if created}
        <div class="secret">
          <p><b>Token "{created.label}" created. It is shown once; store it now.</b> It cannot be shown again.</p>
          <input class="tokenbox" readonly value={created.token} aria-label="New token" onfocus={(e) => e.currentTarget.select()} />
          <p class="hint">Use it as a header, keeping it out of the address:</p>
          <pre><code>{ingestCommand(data.origin)}</code></pre>
        </div>
      {/if}
    </div>
  </section>

  <section class="panel" aria-labelledby="cont-title">
    <h2 id="cont-title">Content</h2>
    {#if content.resources.length === 0}
      <p class="empty-note">Nothing synced yet. Run <code>pnpm content:sync</code> to mirror ForeverDB.net data.</p>
    {:else}
      <p class="sub">
        Game build {content.build ?? "unknown"}{#if content.levelCap !== null}, level cap {content.levelCap}{/if}.
        Refresh with <code>pnpm content:sync</code>.
      </p>
      <table class="grid">
        <thead><tr><th scope="col">Resource</th><th scope="col">Build</th><th scope="col">Status</th><th scope="col">Records</th><th scope="col">Last synced</th></tr></thead>
        <tbody>
          {#each content.resources as r (r.resource)}
            <tr>
              <th scope="row">{r.resource}</th><td>{r.build}</td><td>{r.status}</td>
              <td>{r.total ?? "unknown"}</td><td>{r.updated ?? "unknown"}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>

  <section class="panel" aria-labelledby="sign-title">
    <h2 id="sign-title">Sign-in</h2>
    {#if data.loginEnabled}
      <p>Owner password is set. Pages ask for it before showing your characters.</p>
    {:else}
      <p class="warn">Anyone who can reach this page can see your characters. Set <code>OWNER_PASSWORD</code> and <code>SESSION_SECRET</code> in <code>.env</code>.</p>
    {/if}
  </section>

  <section class="panel" aria-labelledby="cred-title">
    <h2 id="cred-title">Credits</h2>
    <p>Quest and zone data comes from <a href="https://foreverdb.net">ForeverDB.net</a>. Data from ForeverDB.net.</p>
    <p class="sub">ForeverTracker is an unofficial companion app, not affiliated with or endorsed by Blizzard Entertainment.</p>
  </section>
</div>
