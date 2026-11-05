import { expect, test, type Page } from "@playwright/test";
import { contentRecord, openDb } from "@ft/db";
import { join } from "node:path";

// Invented fixture (same shape as packages/core/test/fixtures/ForeverTracker.lua).
const LUA = `ForeverTrackerDB = {
	["schema"] = 1,
	["characters"] = {
		["Player-1234-0A1B2C3D"] = {
			["snapshot"] = {
				["takenAt"] = 1730000000,
				["build"] = "1.60.1.70707",
				["identity"] = { ["name"] = "Thalindra", ["surname"] = "Ashgrove", ["class"] = "MAGE", ["race"] = "Human", ["faction"] = "Alliance", ["level"] = 34, ["xp"] = 12500, ["xpMax"] = 41000 },
				["time"] = { ["played"] = 303400, ["playedLevel"] = 5120 },
				["state"] = { ["zone"] = "Stranglethorn Vale", ["subzone"] = "Booty Bay", ["mapId"] = 1434, ["x"] = 0.2731, ["y"] = 0.7712, ["money"] = 183420, ["equipped"] = { ["HeadSlot"] = 4320 } },
				["progress"] = {
					["talents"] = { ["nodes"] = { ["1"] = 5, ["2"] = 3 }, ["unspent"] = 0 },
					["professions"] = { { ["skillLine"] = 333, ["name"] = "Enchanting", ["rank"] = 150, ["max"] = 225 } },
					["questsCompleted"] = { 1, 2, 3, 4, 5, 8, 13, 9001 },
					["questLog"] = { { ["id"] = 9002 } },
				},
				["exploration"] = { ["visited"] = { { ["mapId"] = 1434, ["subzone"] = "Booty Bay", ["firstSeen"] = 1729990000 } }, ["taxi"] = { 3, 7 } },
			},
			-- Two play sessions (more than 2 hours apart) with level-ups and first visits.
			["events"] = {
				{ ["t"] = 1729970000, ["kind"] = "level_up", ["data"] = { ["level"] = 32 } },
				{ ["t"] = 1729970600, ["kind"] = "zone_first_visit", ["data"] = { ["mapId"] = 1431, ["subzone"] = "Darkshire" } },
				{ ["t"] = 1729971200, ["kind"] = "level_up", ["data"] = { ["level"] = 33 } },
				{ ["t"] = 1729971800, ["kind"] = "quest_turned_in", ["data"] = { ["questId"] = 9001 } },
				{ ["t"] = 1729990000, ["kind"] = "zone_first_visit", ["data"] = { ["mapId"] = 1434, ["subzone"] = "Booty Bay" } },
				{ ["t"] = 1729990600, ["kind"] = "quest_turned_in", ["data"] = { ["questId"] = 8 } },
				{ ["t"] = 1729991200, ["kind"] = "level_up", ["data"] = { ["level"] = 34 } },
			},
			["visited"] = {
				["1431:Darkshire"] = { ["mapId"] = 1431, ["subzone"] = "Darkshire", ["firstSeen"] = 1729970600 },
				["1434:Booty Bay"] = { ["mapId"] = 1434, ["subzone"] = "Booty Bay", ["firstSeen"] = 1729990000 },
			},
			["taxi"] = { 3, 7 },
		},
	},
}
`;

// A tiny invented content mirror (3 quests in one chain), written straight into the app's
// SQLite file with the app's own `openDb` (migrations included). Same JSON shape as
// packages/core/test/fixtures/quests.json.
function seedMirror(dataDir: string) {
  const link = (questId: number, name: string) => ({ questId, name, relation: "Complete first" });
  const quest = (id: number, name: string, level: number, previous: ReturnType<typeof link>[]) => ({
    id,
    name,
    level,
    zone: { n: "Duskwood", slug: "duskwood", m: 1431 },
    chain: { previous, next: [], questLine: null },
    starts: null,
    ends: null,
  });
  const quests = [
    quest(9001, "Lanterns of the Marsh", 30, []),
    quest(9002, "Moths and Embers", 31, [link(9001, "Lanterns of the Marsh")]),
    quest(9003, "The Last Wick", 32, [link(9002, "Moths and Embers")]),
  ];
  // openDb runs the same migrations as the app, so this works before the app's first DB use
  // and is a no-op afterwards; SQLite's own locking covers the two connections.
  const db = openDb(join(dataDir, "forevertracker.sqlite"));
  try {
    db.insert(contentRecord)
      .values(quests.map((q) => ({ resource: "quests", id: String(q.id), build: "1.0", data: JSON.stringify(q), fetchedAt: 1730000000 })))
      .run();
  } finally {
    db.$client.close();
  }
}

const base = process.env.E2E_BASE_URL!;
const dataDir = process.env.E2E_DATA_DIR!;
const password = process.env.E2E_PASSWORD!;

async function signIn(page: Page, pw: string) {
  await page.getByLabel("Password").fill(pw);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("owner journey: login, upload, browse, settings, sign out", async ({ page, request }) => {
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
  // ERR_ABORTED on a subresource (script, style, fetch) is a request cancelled by a
  // navigation, not a failure. An aborted document is a broken navigation: still fail it.
  page.on("requestfailed", (r) => {
    const aborted = r.failure()?.errorText === "net::ERR_ABORTED";
    if (!aborted || r.resourceType() === "document") failed.push(`${r.resourceType()} ${r.url()} ${r.failure()?.errorText}`);
  });

  // Unauthenticated -> login
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);

  // Wrong password
  await signIn(page, "definitely-wrong");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
  consoleErrors.length = 0; // the browser logs the expected 400 of the rejected sign-in
  badResponses.length = 0;

  // Seed the mirror before the first roster
  // load: the roster loads the quest catalog, which is memoised for 60 seconds (empty included).
  seedMirror(dataDir);

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

  // Roster shows the character with surname; footer credit
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Thalindra Ashgrove/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Data from ForeverDB.net" })).toHaveAttribute("href", "https://foreverdb.net");

  // Character page and tabs
  await page.getByRole("link", { name: /Thalindra/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Thalindra Ashgrove");
  const guid = "Player-1234-0A1B2C3D";
  const tabs = page.getByRole("navigation", { name: "Character" });
  for (const name of ["Journey", "Quests", "Talents", "Professions"]) {
    await tabs.getByRole("link", { name }).click();
    await expect(tabs.getByRole("link", { name })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
  }

  // Journey: pace strip, route strip and play sessions, a session card toggles
  await tabs.getByRole("link", { name: "Journey" }).click();
  await expect(page.getByRole("heading", { name: "Time per level" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your route" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Play sessions" })).toBeVisible();
  const cards = page.locator("details.session");
  await expect(cards).toHaveCount(2);
  const closed = cards.nth(1);
  await expect(closed).not.toHaveAttribute("open", "");
  await closed.locator("summary").click();
  await expect(closed).toHaveAttribute("open", "");

  // Quests: the chain page and the quest log are linked and load
  await tabs.getByRole("link", { name: "Quests" }).click();
  const chainLink = page.getByRole("link", { name: /Lanterns of the Marsh/ }).first();
  await expect(chainLink).toHaveAttribute("href", new RegExp(`/c/${guid}/quests/chain/\\d+$`));
  await chainLink.click();
  await expect(page.getByRole("heading", { level: 2, name: "Lanterns of the Marsh" })).toBeVisible();
  await expect(page.getByText("Moths and Embers").first()).toBeVisible();
  await page.getByRole("link", { name: /Back to quests/ }).click();
  await page.getByRole("link", { name: /^Completed \(/ }).click();
  await expect(page.getByRole("heading", { name: "Quest log" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Quest lists" }).getByRole("link")).toHaveCount(2);
  const unknownPage = await page.goto(`/c/${guid}/quests/chain/12345`);
  expect(unknownPage?.status()).toBe(404);
  badResponses.length = 0; // that 404 (and the browser's console line for it) is expected
  consoleErrors.length = 0;

  // Settings: create (shown once) and revoke a token
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.getByLabel("New token label").fill("e2e-token");
  await page.getByRole("button", { name: "Create token" }).click();
  const tokenBox = page.getByLabel("New token", { exact: true });
  await expect(tokenBox).not.toHaveValue("");
  const token = await tokenBox.inputValue();

  // The displayed upload command must actually work: same method, headers and URL.
  const command = page.locator(".secret pre code");
  await expect(command).toContainText("-X POST");
  await expect(command).toContainText("-H 'Content-Type: application/octet-stream'");
  await expect(command).toContainText('-H "Authorization: Bearer $TOKEN"');
  await expect(command).toContainText(`'${base}/api/ingest'`);
  // `request` has no browser cookies: only the bearer token authenticates this.
  const newer = LUA.replace('["takenAt"] = 1730000000', '["takenAt"] = 1730000600');
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" };
  const ingest = await request.post(`${base}/api/ingest`, { headers, data: Buffer.from(newer) });
  expect(ingest.status(), await ingest.text()).toBe(200);
  expect(await ingest.json()).toEqual({ characters: 1, stored: 1, skipped: 0, unsupported: 0, failed: 0 });

  await page.goto("/settings");
  await expect(page.getByLabel("New token", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Revoke token e2e-token" }).click();
  await expect(page.getByText("revoked", { exact: true })).toBeVisible();
  const afterRevoke = await request.post(`${base}/api/ingest`, { headers, data: Buffer.from(newer) });
  expect(afterRevoke.status()).toBe(401);

  // Sign out
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);

  expect(badResponses, "error responses").toEqual([]);
  expect(consoleErrors, "console errors").toEqual([]);
  expect(failed, "failed requests").toEqual([]);
  expect(foreign, "third-party requests").toEqual([]);
});
