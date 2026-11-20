// ForeverTracker capture snippet. Paste into your own browser's developer console while viewing a
// Wowhead Forever quest list page. It reads the page you are looking at and prints JSON; it makes
// no network requests. Save the printed JSON as data/wowhead-captures/<name>.json.
// If the page is not recognised, run ftCapture("class", "Shaman") afterwards.
// Tests execute this file with node:vm and a `__ftExports` object.

function ftTitleCase(slug) {
  return slug
    .split("-")
    .filter(function (w) { return w.length > 0; })
    .map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); })
    .join(" ");
}

function ftKindFromUrl(url) {
  var path = String(url).split("#")[0].split("?")[0];
  var m = /\/(classes|professions|races)\/([^\/]+)/.exec(path);
  if (m) {
    var kind = m[1] === "classes" ? "class" : m[1] === "professions" ? "profession" : "race";
    return { kind: kind, value: ftTitleCase(decodeURIComponent(m[2])) };
  }
  if (/zones/.test(path)) return { kind: "zones", value: "" };
  return null;
}

function extract(input, hint) {
  var notes = [];
  var found = ftKindFromUrl(input.url);
  var kind;
  var value;
  if (hint && hint.kind) {
    kind = hint.kind;
    value = hint.value || "";
  } else if (found) {
    kind = found.kind;
    value = found.value;
  } else {
    kind = "unknown";
    value = "";
    notes.push('URL not recognised: rerun as ftCapture("class","Shaman") (kind is class, race, profession or zones).');
  }

  var rows = [];
  var seen = {};
  var noLevel = 0;
  var anchors = input.anchors || [];
  for (var i = 0; i < anchors.length; i++) {
    var a = anchors[i];
    var m = /\/quest=(\d+)/.exec(a.href || "");
    if (!m) continue;
    var id = parseInt(m[1], 10);
    if (seen[id]) continue;
    seen[id] = true;
    var name = String(a.text || "").trim();
    var row = { questId: id, name: name };
    var rest = String(a.rowText || "");
    if (name) rest = rest.split(name).join(" ");
    var nums = rest.match(/(?:^|[^\w])(\d{1,3})(?![\w])/g) || [];
    for (var j = 0; j < nums.length; j++) {
      var n = parseInt(nums[j].replace(/\D/g, ""), 10);
      if (n >= 1 && n <= 70) {
        row.level = n;
        break;
      }
    }
    if (row.level === undefined) noLevel++;
    rows.push(row);
  }
  if (kind !== "zones" && rows.length === 0) notes.push("No quests found on this page (no links containing /quest=).");
  if (noLevel > 0) notes.push(noLevel + " quest row(s) had no level.");

  var zoneRows = [];
  if (kind === "zones") {
    var tr = input.tableRows || [];
    for (var k = 0; k < tr.length; k++) zoneRows.push({ cells: tr[k] });
    if (zoneRows.length === 0) notes.push("No table rows found for the zones page.");
  }

  return {
    tool: "ft-capture",
    version: 1,
    url: input.url,
    title: input.title,
    capturedAt: new Date().toISOString(),
    kind: kind,
    value: value,
    rows: rows,
    zoneRows: zoneRows,
    notes: notes,
  };
}

if (typeof __ftExports !== "undefined") {
  __ftExports.extract = extract;
} else {
  (function () {
    function text(el) {
      return (el.textContent || "").replace(/\s+/g, " ").trim();
    }
    function run(hint) {
      var anchors = [];
      var links = document.querySelectorAll("a[href*='/quest=']");
      for (var i = 0; i < links.length; i++) {
        var tr = links[i].closest("tr");
        anchors.push({ href: links[i].getAttribute("href") || "", text: text(links[i]), rowText: tr ? text(tr) : "" });
      }
      var best = null;
      var tables = document.querySelectorAll("table");
      for (var t = 0; t < tables.length; t++) {
        if (!best || tables[t].rows.length > best.rows.length) best = tables[t];
      }
      var tableRows = [];
      if (best) {
        for (var r = 0; r < best.rows.length; r++) {
          var cells = [];
          for (var c = 0; c < best.rows[r].cells.length; c++) cells.push(text(best.rows[r].cells[c]));
          tableRows.push(cells);
        }
      }
      var capture = extract({ url: location.href, title: document.title, anchors: anchors, tableRows: tableRows }, hint);
      var json = JSON.stringify(capture);
      console.log(json);
      if (typeof copy === "function") copy(json);
      return capture;
    }
    window.ftCapture = function (kind, value) {
      return run({ kind: kind, value: value });
    };
    run();
  })();
}
