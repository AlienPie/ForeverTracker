export type TooltipProvider = "none" | "wowhead";
export type EntityKind = "item" | "spell" | "quest";

const PROVIDERS: readonly TooltipProvider[] = ["none", "wowhead"];

/** Parse TOOLTIP_PROVIDER; unset or empty means "wowhead" (set "none" for no third-party script). Throws naming the variable on anything else. */
export function parseTooltipProvider(raw: string | undefined): TooltipProvider {
  if (raw === undefined || raw === "") return "wowhead";
  if ((PROVIDERS as readonly string[]).includes(raw)) return raw as TooltipProvider;
  throw new Error(`Invalid TOOLTIP_PROVIDER: "${raw}" (expected one of ${PROVIDERS.join(", ")})`);
}

/**
 * Link target for an item, spell or quest: always Wowhead's /forever/ page (other forms show retail
 * data), whatever the tooltip provider. The provider only decides which tooltip script loads.
 * Returns null for ids that are not positive integers, so callers render plain text.
 */
export function entityUrl(kind: EntityKind, id: number, _provider?: TooltipProvider): string | null {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return `https://www.wowhead.com/forever/${kind}=${id}`;
}

/** Script the browser should load for a provider, or null when none. */
export function providerScriptUrl(provider: TooltipProvider): string | null {
  switch (provider) {
    case "wowhead":
      return "https://wow.zamimg.com/js/tooltips.js";
    default:
      return null;
  }
}

/**
 * Value for a `data-wowhead` attribute on a link that goes somewhere else in the app, so Wowhead's
 * tooltip script still shows the Forever tooltip on hover (`dataEnv=16` is the Forever data set).
 * Undefined when the provider is not Wowhead or the id is not a positive integer.
 */
export function tooltipData(kind: EntityKind, id: number, provider: TooltipProvider): string | undefined {
  if (provider !== "wowhead" || !Number.isSafeInteger(id) || id <= 0) return undefined;
  return `${kind}=${id}&dataEnv=16`;
}
