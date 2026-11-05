import { expect, test, type Page } from "@playwright/test";

// Invented fixture (same shape as packages/core/test/fixtures/ForeverTracker.lua).
const LUA = `ForeverTrackerDB = {
	["schema"] = 1,
	["characters"] = {
		["Player-1234-0A1B2C3D"] = {
			["snapshot"] = {
				["takenAt"] = 1730000000,
				["build"] = "1.60.1.70707",
				["identity"] = { ["name"] = "Thalindra", ["class"] = "MAGE", ["race"] = "Human", ["faction"] = "Alliance", ["level"] = 34, ["xp"] = 12500, ["xpMax"] = 41000 },
				["time"] = { ["played"] = 303400, ["playedLevel"] = 5120 },
				["state"] = { ["zone"] = "Stranglethorn Vale", ["subzone"] = "Booty Bay", ["mapId"] = 1434, ["x"] = 0.2731, ["y"] = 0.7712, ["money"] = 183420, ["equipped"] = { ["HeadSlot"] = 4320 } },
				["progress"] = {
					["talents"] = { ["nodes"] = { ["1"] = 5, ["2"] = 3 }, ["unspent"] = 0 },
					["professions"] = { { ["skillLine"] = 333, ["name"] = "Enchanting", ["rank"] = 150, ["max"] = 225 } },
					["questsCompleted"] = { 1, 2, 3, 4, 5, 8, 13 },
					["questLog"] = { { ["id"] = 575 } },
				},
				["exploration"] = { ["visited"] = { { ["mapId"] = 1434, ["subzone"] = "Booty Bay", ["firstSeen"] = 1729990000 } }, ["taxi"] = { 3, 7 } },
			},
			["events"] = { { ["t"] = 1729999000, ["kind"] = "level_up", ["data"] = { ["level"] = 34 } } },
			["visited"] = { ["1434:Booty Bay"] = { ["mapId"] = 1434, ["subzone"] = "Booty Bay", ["firstSeen"] = 1729990000 } },
			["taxi"] = { 3, 7 },
		},
	},
}
`;

const base = process.env.E2E_BASE_URL!;
const password = process.env.E2E_PASSWORD!;

async function signIn(page: Page, pw: string) {
  await page.getByLabel("Password").fill(pw);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("owner journey: login, upload, browse, settings, sign out", async ({ page }) => {
  const consoleErrors: string[] = [];
  const foreign: string[] = [];
  const failed: string[] = [];
  const badResponses: string[] = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => consoleErrors.push(String(e)));
  page.on("request", (r) => {
    if (!r.url().startsWith(base) && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) foreign.push(r.url());
  });
  page.on("response", (r) => r.status() >= 400 && badResponses.push(`${r.status()} ${r.request().method()} ${r.url()}`));
  // ERR_ABORTED is a request cancelled by a navigation, not a failure.
  page.on("requestfailed", (r) => r.failure()?.errorText !== "net::ERR_ABORTED" && failed.push(`${r.url()} ${r.failure()?.errorText}`));

  // Unauthenticated -> login
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);

  // Wrong password
  await signIn(page, "definitely-wrong");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
  consoleErrors.length = 0; // the browser logs the expected 400 of the rejected sign-in
  badResponses.length = 0;

  // Correct password
  await signIn(page, password);
  await expect(page.getByRole("heading", { name: "Your characters" })).toBeVisible();

  // Empty roster invitation
  await expect(page.getByText("No characters yet")).toBeVisible();
  await expect(page.getByRole("link", { name: /Upload a ForeverTracker file/ })).toHaveAttribute("href", "/upload");

  // Upload through the page
  await page.getByRole("link", { name: /Upload a ForeverTracker file/ }).click();
  await page.getByLabel("ForeverTracker.lua").setInputFiles({
    name: "ForeverTracker.lua",
    mimeType: "text/plain",
    buffer: Buffer.from(LUA),
  });
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByRole("status").filter({ hasText: "1 character found" })).toBeVisible();

  // Roster shows the character; footer credit
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Thalindra/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Data from ForeverDB.net" })).toHaveAttribute("href", "https://foreverdb.net");

  // Character page and tabs
  await page.getByRole("link", { name: /Thalindra/ }).click();
  const tabs = page.getByRole("navigation", { name: "Character" });
  for (const name of ["Journey", "Quests", "Talents", "Professions"]) {
    await tabs.getByRole("link", { name }).click();
    await expect(tabs.getByRole("link", { name })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
  }

  // Settings: create (shown once) and revoke a token
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.getByLabel("New token label").fill("e2e-token");
  await page.getByRole("button", { name: "Create token" }).click();
  await expect(page.getByLabel("New token", { exact: true })).not.toHaveValue("");
  await page.goto("/settings");
  await expect(page.getByLabel("New token", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Revoke token e2e-token" }).click();
  await expect(page.getByText("revoked", { exact: true })).toBeVisible();

  // Sign out
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);

  expect(badResponses, "error responses").toEqual([]);
  expect(consoleErrors, "console errors").toEqual([]);
  expect(failed, "failed requests").toEqual([]);
  expect(foreign, "third-party requests").toEqual([]);
});
