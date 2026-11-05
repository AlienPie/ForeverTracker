<script lang="ts">
  import { classColor, sealTextIsDark } from "../classes";

  let { level, classToken }: { level: number | null; classToken: string | null } = $props();
</script>

<div
  class="seal"
  class:light={sealTextIsDark(classToken)}
  style:--cc={classColor(classToken)}
  aria-label={level === null ? "Level unknown" : `Level ${level}`}
  role="img"
>
  <span aria-hidden="true">{level ?? "-"}</span>
</div>
