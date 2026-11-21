// Read-only probe of Blizzard's (undocumented) WoW: Forever API.
// Needs BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET in the environment (see .env.example). Prints
// the HTTP status and name of each quest id; never prints the credentials or token.
//   node --env-file=.env scripts/probe-battlenet.mjs [region] [questId ...]
const [region = "eu", ...rest] = process.argv.slice(2);
const ids = rest.length ? rest.map(Number) : [5841, 5805, 94499, 96057, 1];
const { BLIZZARD_CLIENT_ID: id, BLIZZARD_CLIENT_SECRET: secret } = process.env;
if (!id || !secret) {
  console.error("Set BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET (e.g. in .env, then run with --env-file=.env).");
  process.exit(1);
}
const tokenRes = await fetch("https://oauth.battle.net/token", {
  method: "POST",
  headers: { authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
  body: "grant_type=client_credentials",
});
if (!tokenRes.ok) {
  console.error(`Token request failed: HTTP ${tokenRes.status}`);
  process.exit(1);
}
const { access_token: token } = await tokenRes.json();
const get = (path) =>
  fetch(`https://${region}.api.blizzard.com${path}${path.includes("?") ? "&" : "?"}namespace=static-forever-${region}&locale=en_GB`, {
    headers: { authorization: `Bearer ${token}` },
  });

for (const q of ids) {
  const r = await get(`/data/wow/quest/${q}`);
  let line = `quest ${q}: HTTP ${r.status}`;
  if (r.ok) {
    const j = await r.json();
    line += ` | ${j.title ?? j.name ?? "(no title)"} | level ${j.level ?? "?"} | area ${j.area?.name ?? "?"} | keys: ${Object.keys(j).join(",")}`;
  }
  console.log(line);
}
const idx = await get("/data/wow/quest/index");
console.log(`quest index: HTTP ${idx.status}`);
if (idx.ok) {
  const j = await idx.json();
  console.log(`  keys: ${Object.keys(j).join(",")}`);
  const list = j.quests ?? j.results ?? [];
  console.log(`  entries: ${Array.isArray(list) ? list.length : "n/a"}`);
}
