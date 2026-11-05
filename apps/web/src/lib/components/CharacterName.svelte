<script lang="ts">
  let { name, surname }: { name: string; surname: string | null } = $props();
</script>

<!-- The space sits outside the span: Svelte trims a leading space inside an element. -->
{name}{#if surname}{" "}<span class="surname">{surname}</span>{/if}
