<script lang="ts">
  import "@fontsource/im-fell-english/latin-400.css";
  import "@fontsource/im-fell-english/latin-400-italic.css";
  import "@fontsource-variable/instrument-sans/wght.css";
  import "../lib/theme.css";
  import type { Snippet } from "svelte";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import { providerScriptUrl, type TooltipProvider } from "../lib/links";

  let { data, children }: { data: { loginEnabled: boolean; tooltipProvider: TooltipProvider }; children: Snippet } =
    $props();

  // Third-party tooltip script: added client-side only, and only when a provider is configured.
  onMount(() => {
    const src = providerScriptUrl(data.tooltipProvider);
    if (!src) return;
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    document.head.appendChild(s);
    return () => s.remove();
  });

  const links = [
    { href: "/", label: "Roster" },
    { href: "/upload", label: "Upload" },
    { href: "/settings", label: "Settings" },
  ];
  const current = (href: string) =>
    href === "/"
      ? page.url.pathname === "/" || page.url.pathname.startsWith("/c/") // character pages live under the roster
      : page.url.pathname.startsWith(href) ? true : undefined;
</script>

<div class="page">
  <a class="skip" href="#main">Skip to content</a>
  <header class="site">
    <div class="wrap">
      <a class="brand" href="/">ForeverTracker</a>
      <nav class="main" aria-label="Main">
        {#each links as l (l.href)}
          <a href={l.href} aria-current={current(l.href) ? "page" : undefined}>{l.label}</a>
        {/each}
      </nav>
      {#if data.loginEnabled && page.url.pathname !== "/login"}
        <form class="signout" method="POST" action="/logout"><button type="submit">Sign out</button></form>
      {/if}
    </div>
  </header>

  <main id="main" class="wrap" tabindex="-1">
    {@render children()}
  </main>

  <footer class="site">
    <div class="wrap">
      <a href="https://foreverdb.net">Data from ForeverDB.net</a>. Unofficial companion app, not affiliated with Blizzard.
    </div>
  </footer>
</div>
