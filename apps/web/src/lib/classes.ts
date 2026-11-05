/** Standard WoW class colours, keyed by the class token as stored (e.g. "SHAMAN"). */
const CLASS_COLORS: Record<string, string> = {
  DEATHKNIGHT: "#c41e3a",
  DEMONHUNTER: "#a330c9",
  DRUID: "#ff7c0a",
  EVOKER: "#33937f",
  HUNTER: "#aad372",
  MAGE: "#3fc7eb",
  MONK: "#00ff98",
  PALADIN: "#f48cba",
  PRIEST: "#ffffff",
  ROGUE: "#fff468",
  SHAMAN: "#0070dd",
  WARLOCK: "#8788ee",
  WARRIOR: "#c69b6d",
};

/** Muted gilt for unknown or missing classes (the theme's --gilt-dim). */
export const NEUTRAL_CLASS_COLOR = "#8f7433";

/** Class colour for a stored class token, case-insensitive; neutral for unknown or null. */
export function classColor(token: string | null | undefined): string {
  return (token && CLASS_COLORS[token.toUpperCase()]) || NEUTRAL_CLASS_COLOR;
}

const TWO_WORD: Record<string, string> = { DEATHKNIGHT: "Death Knight", DEMONHUNTER: "Demon Hunter" };

/** Display name for a class token ("SHAMAN" to "Shaman"); null when missing. */
export function className(token: string | null | undefined): string | null {
  if (!token) return null;
  const t = token.toUpperCase();
  return TWO_WORD[t] ?? t.charAt(0) + t.slice(1).toLowerCase();
}

/** Display name for a race token as the addon stores it ("NightElf" to "Night Elf"); null when missing. */
export function raceName(token: string | null | undefined): string | null {
  if (!token) return null;
  if (token === "Scourge") return "Undead";
  return token.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

/** Seal text colours (see .seal in theme.css). */
const LIGHT_TEXT = 1; // #fff
const DARK_TEXT = luminance("#222222");

/**
 * True when dark seal text contrasts better with the class colour than white
 * text does (priest white, rogue yellow and the other light colours).
 */
export function sealTextIsDark(token: string | null | undefined): boolean {
  const l = luminance(classColor(token));
  return (l + 0.05) / (DARK_TEXT + 0.05) > (LIGHT_TEXT + 0.05) / (l + 0.05);
}
