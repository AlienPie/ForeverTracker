import { describe, expect, test } from "vitest";
import { entityUrl, providerScriptUrl } from "../src/lib/links";

describe("entityUrl", () => {
  test("wowhead uses the /forever/ form for all kinds", () => {
    expect(entityUrl("quest", 1582, "wowhead")).toBe("https://www.wowhead.com/forever/quest=1582");
    expect(entityUrl("item", 6710, "wowhead")).toBe("https://www.wowhead.com/forever/item=6710");
    expect(entityUrl("spell", 145, "wowhead")).toBe("https://www.wowhead.com/forever/spell=145");
  });
  test("every provider links to Wowhead", () => {
    expect(entityUrl("item", 1482, "none")).toBe("https://www.wowhead.com/forever/item=1482");
    expect(entityUrl("quest", 1582, "none")).toBe("https://www.wowhead.com/forever/quest=1582");
  });
  test("non-positive-integer ids give no link", () => {
    for (const id of [0, -1, 1.5, NaN, Infinity]) expect(entityUrl("item", id, "none")).toBeNull();
  });
});

describe("providerScriptUrl", () => {
  test("none has no script", () => expect(providerScriptUrl("none")).toBeNull());
  test("providers", () => {
    expect(providerScriptUrl("wowhead")).toBe("https://wow.zamimg.com/js/tooltips.js");
  });
});

describe("tooltipData", () => {
  test("a Wowhead data attribute for the Forever data set, only with the wowhead provider", async () => {
    const { tooltipData } = await import("../src/lib/links");
    expect(tooltipData("quest", 1582, "wowhead")).toBe("quest=1582&domain=forever");
    expect(tooltipData("quest", 1582, "none")).toBeUndefined();
    expect(tooltipData("quest", 0, "wowhead")).toBeUndefined();
  });
});
