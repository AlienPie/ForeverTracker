<script lang="ts">
  let { data, form } = $props();
</script>

<svelte:head><title>Sign in, ForeverTracker</title></svelte:head>

<section class="signin panel" aria-labelledby="signin-title">
  <h1 id="signin-title">Sign in</h1>
  <form method="POST">
    <input type="hidden" name="next" value={form?.next ?? data.next} />
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required />
    <button class="btn" type="submit">Sign in</button>
    {#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
  </form>
</section>
