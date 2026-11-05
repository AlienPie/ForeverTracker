<script lang="ts">
  let { data, form } = $props();
</script>

<svelte:head><title>Sign in</title></svelte:head>

<main>
  <h1>Sign in</h1>
  <form method="POST">
    <input type="hidden" name="next" value={form?.next ?? data.next} />
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required />
    <button type="submit">Sign in</button>
    {#if form?.error}<p role="alert">{form.error}</p>{/if}
  </form>
</main>
