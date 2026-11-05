<script lang="ts">
  import { clockTime, sessionHeading, type SessionView } from "../journey-view";

  /**
   * `local`: false on the server and for the first browser render (UTC text from
   * the server, so hydration matches); true after mount, when times switch to the
   * browser's time zone.
   */
  let { session, local }: { session: SessionView; local: boolean } = $props();

  const heading = $derived(local ? (sessionHeading(session.t, Date.now() / 1000) ?? session.heading) : session.heading);
  const time = (e: SessionView["events"][number]) => (local ? (clockTime(e.t) ?? e.time) : e.time);
</script>

<details class="session" open={session.open}>
  <summary>
    <h3>{heading}</h3>
    <span class="len"><span class="sr-only">Played </span>{session.duration}</span>
    <span class="line">{session.summary}</span>
  </summary>
  <ul class="events">
    {#each session.events as e, i (i)}
      <li>
        {#if e.iso}<time datetime={e.iso}>{time(e)}</time>{:else}<span class="when">Time unknown</span>{/if}
        <span>{e.text}</span>
      </li>
    {/each}
    {#if session.moreEvents > 0}
      <li class="more"><span></span><span>and {session.moreEvents.toLocaleString("en-GB")} earlier events in this session</span></li>
    {/if}
  </ul>
</details>
