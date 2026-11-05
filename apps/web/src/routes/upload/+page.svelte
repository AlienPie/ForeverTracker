<script lang="ts">
  import { enhance } from "$app/forms";
  import type { ActionData } from "./$types";

  let { form }: { form: ActionData } = $props();
  let busy = $state(false);

  const summary = $derived(form && "summary" in form ? form.summary : null);
  const error = $derived(form && "error" in form ? (form.error as string) : null);

  const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
  function sentence(s: { characters: number; stored: number; skipped: number; unsupported: number; failed: number }): string {
    const parts = [`${s.stored} stored`, `${s.skipped} already up to date`];
    if (s.unsupported > 0) parts.push(`${s.unsupported} in a newer format this version cannot read`);
    if (s.failed > 0) parts.push(`${s.failed} could not be processed`);
    return `${plural(s.characters, "character")} found: ${parts.join(", ")}.`;
  }
</script>

<svelte:head><title>Upload, ForeverTracker</title></svelte:head>

<div class="account"><h1>Upload</h1></div>

<section class="panel formpanel" aria-labelledby="up-title">
  <h2 id="up-title">Send a ForeverTracker file</h2>
  <p class="sub">
    In game, type <code>/ft sync</code> and then <code>/reload</code>; the addon writes the file when the UI reloads.
    You will find it at <code>WTF/Account/&lt;ACCOUNT&gt;/SavedVariables/ForeverTracker.lua</code> inside your game folder.
  </p>
  <form
    method="POST"
    enctype="multipart/form-data"
    use:enhance={() => {
      busy = true;
      return async ({ update }) => {
        await update({ reset: false });
        busy = false;
      };
    }}
  >
    <label for="file">ForeverTracker.lua</label>
    <input id="file" name="file" type="file" accept=".lua,text/plain" required />
    <p class="hint">Up to 8 MB.</p>
    <button class="btn" type="submit" disabled={busy}>{busy ? "Uploading..." : "Upload"}</button>
  </form>

  <div role="status" aria-live="polite">
    {#if summary}
      <p class="ok">{sentence(summary)} {#if summary.stored === 0 && summary.failed === 0 && summary.unsupported === 0}Nothing has changed since the last upload.{/if} <a href="/">See the roster</a>.</p>
    {/if}
  </div>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</section>
