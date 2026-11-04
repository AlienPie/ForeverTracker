local stubs = require("stubs")

describe("interpreter", function()
  it("is Lua 5.1 compatible (LuaJIT)", function()
    assert.is_true(jit ~= nil or _VERSION == "Lua 5.1")
  end)
end)

describe("FT.safe", function()
  local FT
  before_each(function() FT = stubs.load() end)

  it("safe returns the value on success", function()
    assert.are.equal(42, FT.safe(function(a, b) return a + b end, 40, 2))
  end)

  it("safe returns an unavailable marker with the reason when fn errors", function()
    local r = FT.safe(function() error("boom", 0) end)
    assert.is_true(r.unavailable)
    assert.are.equal("boom", r.reason)
  end)

  it("safe still gives a string reason for non-string errors", function()
    local r = FT.safe(function() error({}) end)
    assert.is_true(r.unavailable)
    assert.are.equal("string", type(r.reason))
  end)
end)

describe("FT.takeSnapshot", function()
  it("takeSnapshot still returns other sections when one collector errors", function()
    local FT = stubs.load({ UnitXP = function() error("no xp") end })
    local snap = FT.takeSnapshot()
    assert.is_true(snap.identity.unavailable)
    assert.are.equal("table", type(snap.state))
    assert.is_nil(snap.state.unavailable)
    assert.are.equal("Stranglethorn Vale", snap.state.zone)
  end)

  it("takeSnapshot works when C_Map is nil", function()
    local FT = stubs.load({ C_Map = stubs.NIL })
    local snap
    assert.has_no.errors(function() snap = FT.takeSnapshot() end)
    assert.are.equal("table", type(snap.state))
    assert.is_nil(snap.state.mapId)
    assert.are.equal(183420, snap.state.money)
  end)

  it("sets takenAt and build", function()
    local snap = stubs.load().takeSnapshot()
    assert.are.equal(1730000000, snap.takenAt)
    assert.are.equal("1.60.1.70707", snap.build)
  end)

  it("tolerates missing time and GetBuildInfo", function()
    local FT = stubs.load({ time = stubs.NIL, GetBuildInfo = stubs.NIL })
    local snap = FT.takeSnapshot()
    assert.are.equal("number", type(snap.takenAt))
    assert.is_nil(snap.build)
  end)

  it("places sectioned collectors under snapshot[section][key]", function()
    local FT = stubs.load()
    FT.register({ key = "extra", section = "progress", run = function() return { unspent = 2 } end })
    FT.register({ key = "bad", section = "progress", run = function() error("x") end })
    local snap = FT.takeSnapshot()
    assert.are.equal(2, snap.progress.extra.unspent)
    assert.is_true(snap.progress.bad.unavailable)
  end)

  it("keeps registration order", function()
    local FT = stubs.load()
    local order = {}
    for i, c in ipairs(FT.collectors) do
      order[i] = (c.section and (c.section .. ".") or "") .. c.key
    end
    assert.are.same({ "identity", "state", "time", "progress.talents",
      "progress.professions", "progress.questsCompleted", "progress.questLog",
      "exploration" }, order)
  end)
end)

describe("FT.save", function()
  it("save keeps existing events", function()
    local FT = stubs.load()
    local events = { { t = 1, kind = "levelup", data = { level = 2 } } }
    stubs.setDB({ schema = 1, characters = { ["Player-1234-0A1B2C3D"] = {
      events = events, visited = { 1 }, snapshot = { takenAt = 5 } } } })
    assert.is_true(FT.save())
    local c = stubs.getDB().characters["Player-1234-0A1B2C3D"]
    assert.are.equal(events, c.events)
    assert.are.same({ 1 }, c.visited)
    assert.are.equal(1730000000, c.snapshot.takenAt)
  end)

  it("save writes schema = 1", function()
    local FT = stubs.load()
    stubs.setDB(nil)
    assert.is_true(FT.save())
    assert.are.equal(1, stubs.getDB().schema)
    assert.are.equal("Thalindra", stubs.getDB().characters["Player-1234-0A1B2C3D"].snapshot.identity.name)
  end)

  it("save does nothing without a GUID", function()
    local FT = stubs.load({ UnitGUID = function() return nil end })
    stubs.setDB(nil)
    local ok, reason = FT.save()
    assert.is_false(ok)
    assert.are.equal("string", type(reason))
    assert.is_nil(stubs.getDB())
  end)

  it("save leaves an existing DB untouched without a GUID", function()
    local FT = stubs.load({ UnitGUID = function() return nil end })
    local db = { schema = 1, characters = { x = { snapshot = { takenAt = 1 } } } }
    stubs.setDB(db)
    assert.is_false((FT.save()))
    assert.are.equal(db, stubs.getDB())
    assert.are.same({ schema = 1, characters = { x = { snapshot = { takenAt = 1 } } } }, db)
  end)
end)

describe("FT helpers", function()
  local FT
  before_each(function() FT = stubs.load() end)

  it("str keeps only non-empty strings", function()
    assert.are.equal("a", FT.str("a"))
    assert.is_nil(FT.str(""))
    assert.is_nil(FT.str(5))
    assert.is_nil(FT.str(nil))
  end)

  it("num keeps only numbers", function()
    assert.are.equal(0, FT.num(0))
    assert.is_nil(FT.num("1"))
    assert.is_nil(FT.num(nil))
  end)

  it("try returns the first value or nil when fn throws", function()
    assert.are.equal(3, FT.try(function(a, b) return a + b, 9 end, 1, 2))
    assert.is_nil(FT.try(function() error("x") end))
    assert.is_nil(FT.try(nil))
  end)
end)

describe("FT.safe edge cases", function()
  local FT
  before_each(function() FT = stubs.load() end)

  it("keeps only the first of multiple returns", function()
    local a, b = FT.safe(function() return 1, 2 end)
    assert.are.equal(1, a)
    assert.is_nil(b)
  end)

  it("passes a nil return through", function()
    assert.is_nil(FT.safe(function() return nil end))
  end)

  it("reports unavailable for a nil fn", function()
    local r = FT.safe(nil)
    assert.is_true(r.unavailable)
    assert.are.equal("string", type(r.reason))
  end)
end)

describe("FT.register validation", function()
  local FT, run
  before_each(function()
    FT = stubs.load()
    run = function() return {} end
  end)

  local function fails(entry)
    local ok, err = pcall(FT.register, entry)
    assert.is_false(ok)
    assert.are.equal("string", type(err))
    assert.is_truthy(err:find("FT.register", 1, true))
  end

  it("rejects a non-table entry", function() fails("x") end)
  it("rejects a missing or empty key", function()
    fails({ run = run })
    fails({ key = "", run = run })
    fails({ key = 5, run = run })
  end)
  it("rejects a non-function run", function() fails({ key = "k", run = 1 }) end)
  it("rejects a bad section", function()
    fails({ key = "k", section = "", run = run })
    fails({ key = "k", section = 3, run = run })
  end)
  it("rejects a duplicate top-level key", function()
    fails({ key = "identity", run = run })
  end)
  it("rejects a duplicate key within a section but allows it across sections", function()
    FT.register({ key = "k", section = "a", run = run })
    fails({ key = "k", section = "a", run = run })
    assert.has_no.errors(function() FT.register({ key = "k", section = "b", run = run }) end)
  end)
  it("rejects a section named like a top-level key, and the reverse", function()
    fails({ key = "k", section = "identity", run = run })
    FT.register({ key = "k", section = "grp", run = run })
    fails({ key = "grp", run = run })
  end)
  it("returns true for a valid entry", function()
    assert.is_true(FT.register({ key = "ok", run = run }))
  end)
end)
