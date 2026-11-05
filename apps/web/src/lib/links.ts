export type TooltipProvider = "none" | "wowhead" | "foreverdb";
export type EntityKind = "item" | "spell" | "quest";

const PROVIDERS: readonly TooltipProvider[] = ["none", "wowhead", "foreverdb"];

/** Parse TOOLTIP_PROVIDER; unset or empty means "none". Throws naming the variable on anything else. */
export function parseTooltipProvider(raw: string | undefined): TooltipProvider {
  if (raw === undefined || raw === "") return "none";
  if ((PROVIDERS as readonly string[]).includes(raw)) return raw as TooltipProvider;
  throw new Error(`Invalid TOOLTIP_PROVIDER: "${raw}" (expected one of ${PROVIDERS.join(", ")})`);
}

/**
 * Link target for an item, spell or quest, in the form the chosen provider's tooltip script recognises.
 * Wowhead needs its /forever/ pages (other forms show retail data); ForeverDB is the default target otherwise.
 * Returns null for ids that are not positive integers, so callers render plain text.
 */
export function entityUrl(kind: EntityKind, id: number, provider: TooltipProvider): string | null {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return provider === "wowhead"
    ? `https://www.wowhead.com/forever/${kind}=${id}`
    : `https://foreverdb.net/${kind}/${id}`;
}

/** Script the browser should load for a provider, or null when none. */
export function providerScriptUrl(provider: TooltipProvider): string | null {
  switch (provider) {
    case "wowhead":
      return "https://wow.zamimg.com/js/tooltips.js";
    case "foreverdb":
      return "https://foreverdb.net/embed/tooltips.js";
    default:
      return null;
  }
}
