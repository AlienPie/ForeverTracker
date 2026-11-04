local stubs = require("stubs")

local GUID = "Player-1234-0A1B2C3D"
local function char() return stubs.getDB().characters[GUID] end

describe("FT.recordVisit", function()
  it("recordVisit stores a place once and keeps the earliest firstSeen", function()
    local FT = stubs.load()
    stubs.setDB(nil)
    stubs.now = 1000
    assert.is_true(FT.recordVisit())
    stubs.now = 2000
    assert.is_false(FT.recordVisit())
    local v = char().visited["1434:Booty Bay"]
    assert.are.same({ mapId = 1434, subzone = "Booty Bay", firstSeen = 1000 }, v)
    local n = 0
    for _ in pairs(char().visited) do n = n + 1 end
    assert.are.equal(1, n)
  end)

  it("keeps an existing earlier firstSeen already in the DB", function()
    local FT = stubs.load()
    stubs.setDB({ characters = { [GUID] = { visited = {
      ["1434:Booty Bay"] = { mapId = 1434, subzone = "Booty Bay", firstSeen = 5 } } } } })
    FT.recordVisit()
    assert.are.equal(5, char().visited["1434:Booty Bay"].firstSeen)
  end)

  it("no-ops safely with nil GUID or no map", function()
    local FT = stubs.load({ UnitGUID = function() return nil end })
    stubs.setDB(nil)
    assert.has_no.errors(function() FT.recordVisit() end)
    assert.has_no.errors(function() FT.logEvent("x", {}) end)
    assert.is_nil(stubs.getDB())
    FT = stubs.load({ C_Map = stubs.NIL })
    stubs.setDB(nil)
    assert.has_no.errors(function() FT.recordVisit() end)
  end)

  it("creates the DB lazily when uninitialised", function()
    local FT = stubs.load()
    stubs.setDB(nil)
    FT.logEvent("custom", { a = 1 })
    assert.are.equal("custom", char().events[1].kind)
    assert.are.equal(1730000000, char().events[1].t)
    assert.are.same({ a = 1 }, char().events[1].data)
  end)
end)

describe("FT.logEvent", function()
  it("events are capped at 500 and keep the newest", function()
    local FT = stubs.load()
    stubs.setDB(nil)
    for i = 1, 510 do FT.logEvent("tick", { n = i }) end
    local ev = char().events
    assert.are.equal(500, #ev)
    assert.are.equal(11, ev[1].data.n)
    assert.are.equal(510, ev[500].data.n)
  end)
end)

describe("event handlers", function()
  it("PLAYER_LEVEL_UP logs a level_up event with the new level", function()
    local FT = stubs.load()
    stubs.setDB(nil)
    FT.handlers.PLAYER_LEVEL_UP(35)
    local e = char().events[1]
    assert.are.equal("level_up", e.kind)
    assert.are.same({ level = 35 }, e.data)
    assert.is_table(char().snapshot) -- saved afterwards
  end)

  it("QUEST_TURNED_IN logs quest_turned_in and saves", function()
    local FT = stubs.load()
    stubs.setDB(nil)
    FT.handlers.QUEST_TURNED_IN(77, 1000, 50)
    assert.are.same({ questId = 77 }, char().events[1].data)
    assert.are.equal("quest_turned_in", char().events[1].kind)
    assert.is_table(char().snapshot)
  end)

  it("zone_first_visit is logged only for a newly added place", function()
    local FT = stubs.load()
    stubs.setDB(nil)
    FT.handlers.ZONE_CHANGED()
    FT.handlers.ZONE_CHANGED_INDOORS()
    FT.handlers.ZONE_CHANGED_NEW_AREA()
    assert.are.equal(1, #char().events)
    assert.are.equal("zone_first_visit", char().events[1].kind)
    assert.are.same({ mapId = 1434, subzone = "Booty Bay" }, char().events[1].data)
  end)

  it("PLAYER_ENTERING_WORLD records a visit and saves", function()
    local FT = stubs.load()
    stubs.setDB(nil)
    FT.handlers.PLAYER_ENTERING_WORLD()
    assert.is_table(char().visited["1434:Booty Bay"])
    assert.is_table(char().snapshot)
  end)

  it("PLAYER_LOGOUT and PLAYER_LEAVING_WORLD leave the stored snapshot untouched", function()
    local FT = stubs.load()
    stubs.setDB(nil)
    FT.save()
    local before = char().snapshot
    stubs.now = stubs.now + 100
    local frame = stubs.frames[#stubs.frames]
    assert.has_no.errors(function() frame.OnEvent(frame, "PLAYER_LOGOUT") end)
    assert.has_no.errors(function() frame.OnEvent(frame, "PLAYER_LEAVING_WORLD") end)
    assert.is_nil(FT.handlers.PLAYER_LOGOUT)
    assert.is_nil(FT.handlers.PLAYER_LEAVING_WORLD)
    assert.are.equal(before, char().snapshot)
    assert.are.equal(1730000000, char().snapshot.takenAt)
  end)

  it("PLAYER_ENTERING_WORLD requests /played only on initial login", function()
    local FT = stubs.load()
    stubs.setDB(nil)
    FT.handlers.PLAYER_ENTERING_WORLD(true, false)
    assert.are.equal(1, stubs.playedRequests)
    FT.handlers.PLAYER_ENTERING_WORLD(false, true)  -- reload
    FT.handlers.PLAYER_ENTERING_WORLD(false, false) -- zone change
    FT.handlers.PLAYER_ENTERING_WORLD()
    assert.are.equal(1, stubs.playedRequests)
  end)

  it("TAXIMAP_OPENED records unique ascending node ids", function()
    local FT = stubs.load()
    stubs.setDB(nil)
    FT.handlers.TAXIMAP_OPENED()
    assert.are.same({ 3, 12 }, char().taxi)
    FT.handlers.TAXIMAP_OPENED()
    assert.are.same({ 3, 12 }, char().taxi)
  end)

  it("registers every handled event on a guarded frame and dispatches", function()
    local FT = stubs.load()
    local frame = stubs.frames[#stubs.frames]
    for event in pairs(FT.handlers) do assert.is_true(frame.events[event], event) end
    stubs.setDB(nil)
    frame.OnEvent(frame, "PLAYER_LEVEL_UP", 40)
    assert.are.equal(40, char().events[1].data.level)
    assert.has_no.errors(function() frame.OnEvent(frame, "NOPE") end)
  end)

  it("a throwing handler never escapes the frame script", function()
    local FT = stubs.load()
    local frame = stubs.frames[#stubs.frames]
    FT.handlers.PLAYER_LEVEL_UP = function() error("boom") end
    assert.has_no.errors(function() frame.OnEvent(frame, "PLAYER_LEVEL_UP") end)
  end)

  it("loads without CreateFrame", function()
    local FT = stubs.load({ CreateFrame = stubs.NIL })
    assert.is_function(FT.handlers.PLAYER_LEVEL_UP)
  end)
end)

describe("taxi map id", function()
  local function stubNodes(seen)
    return { GetTaxiNodesForMap = function(id) seen[#seen + 1] = id; return { { nodeID = 7 } } end }
  end

  it("queries GetTaxiMapID's map when it exists", function()
    local seen = {}
    local FT = stubs.load({ C_TaxiMap = stubNodes(seen), GetTaxiMapID = function() return 1414 end })
    stubs.setDB(nil)
    FT.handlers.TAXIMAP_OPENED()
    assert.are.same({ 1414 }, seen)
    assert.are.same({ 7 }, char().taxi)
  end)

  it("falls back to the best map when GetTaxiMapID is absent or unusable", function()
    local seen = {}
    local FT = stubs.load({ C_TaxiMap = stubNodes(seen) })
    stubs.setDB(nil)
    FT.handlers.TAXIMAP_OPENED()
    FT = stubs.load({ C_TaxiMap = stubNodes(seen), GetTaxiMapID = function() return nil end })
    stubs.setDB(nil)
    FT.handlers.TAXIMAP_OPENED()
    assert.are.same({ 1434, 1434 }, seen)
  end)

  it("records nothing and does not error when no map id is available", function()
    local seen = {}
    local FT = stubs.load({ C_TaxiMap = stubNodes(seen), C_Map = stubs.NIL,
      GetTaxiMapID = function() error("boom") end })
    stubs.setDB(nil)
    assert.has_no.errors(function() FT.handlers.TAXIMAP_OPENED() end)
    assert.are.same({}, seen)
    assert.is_nil(stubs.getDB())
  end)
end)

describe("autosave ticker", function()
  it("is created once even after several PLAYER_ENTERING_WORLD events", function()
    local FT = stubs.load()
    stubs.setDB(nil)
    FT.handlers.PLAYER_ENTERING_WORLD(true, false)
    FT.handlers.PLAYER_ENTERING_WORLD(false, true)
    FT.handlers.PLAYER_ENTERING_WORLD(false, false)
    assert.are.equal(1, #stubs.tickers)
    assert.are.equal(120, stubs.tickers[1].sec)
  end)

  it("saves when it fires", function()
    local FT = stubs.load()
    stubs.setDB(nil)
    FT.handlers.PLAYER_ENTERING_WORLD()
    char().snapshot = nil
    stubs.tickers[1].fn()
    assert.is_table(char().snapshot)
  end)

  it("a throwing save does not escape the ticker", function()
    local FT = stubs.load()
    FT.handlers.PLAYER_ENTERING_WORLD()
    FT.save = function() error("boom") end
    assert.has_no.errors(function() stubs.tickers[1].fn() end)
  end)

  it("missing C_Timer or NewTicker means no ticker and no error", function()
    local FT = stubs.load({ C_Timer = stubs.NIL })
    stubs.setDB(nil)
    assert.has_no.errors(function() FT.handlers.PLAYER_ENTERING_WORLD() end)
    FT = stubs.load({ C_Timer = { After = function() end } })
    assert.has_no.errors(function() FT.handlers.PLAYER_ENTERING_WORLD() end)
    assert.are.equal(0, #stubs.tickers)
  end)
end)

describe("SKILL_LINES_CHANGED", function()
  local function fire(FT, n) for _ = 1, n do FT.handlers.SKILL_LINES_CHANGED() end end
  local SIG = "Alchemy:150|Cooking:75"

  it("debounces to one scheduled save and logs nothing when the signature is unchanged", function()
    local FT = stubs.load()
    stubs.setDB({ characters = { [GUID] = { profSig = SIG } } })
    fire(FT, 30)
    assert.are.equal(1, #stubs.timers)
    assert.are.equal(5, stubs.timers[1].sec)
    assert.is_nil(char().snapshot)
    assert.is_nil(char().events)
    stubs.timers[1].fn()
    assert.is_table(char().snapshot)
    fire(FT, 2) -- a new burst may schedule again after the save ran
    assert.are.equal(2, #stubs.timers)
  end)

  it("logs exactly one event with the count on a real change and updates profSig", function()
    local FT = stubs.load()
    stubs.setDB({ characters = { [GUID] = { profSig = SIG } } })
    fire(FT, 3)
    assert.are.equal(0, #(char().events or {}))
    local rows = { { "Alchemy", "icon", 150, 225, 2, 0, 171, 0, 0, 0 },
                   { "Cooking", "icon", 75, 150, 1, 0, 185, 0, 0, 0 },
                   { "Mining", "icon", 1, 75, 1, 0, 186, 0, 0, 0 } }
    _G.GetProfessions = function() return 1, 2, 3 end
    _G.GetProfessionInfo = function(i) local r = rows[i]; if r then return unpack(r, 1, 10) end end
    fire(FT, 5)
    assert.are.equal(1, #char().events)
    assert.are.equal("profession_changed", char().events[1].kind)
    assert.are.same({ count = 3 }, char().events[1].data)
    assert.are.equal("Alchemy:150|Cooking:75|Mining:1", char().profSig)
  end)

  it("first observation with no persisted signature and no professions logs nothing", function()
    local FT = stubs.load({ GetProfessions = function() return end })
    stubs.setDB(nil)
    fire(FT, 2)
    assert.are.equal(0, #(char() and char().events or {}))
  end)

  it("uses an empty signature when the collector is unavailable", function()
    local FT = stubs.load({ GetProfessions = function() error("x") end })
    stubs.setDB({ characters = { [GUID] = { profSig = SIG } } })
    FT.handlers.SKILL_LINES_CHANGED()
    assert.are.equal(1, #char().events)
    assert.are.same({ count = 0 }, char().events[1].data)
    assert.are.equal("", char().profSig)
  end)

  it("no-ops without a GUID", function()
    local FT = stubs.load({ UnitGUID = function() return nil end })
    stubs.setDB(nil)
    assert.has_no.errors(function() fire(FT, 3) end)
    assert.is_nil(stubs.getDB())
  end)

  it("works inline when C_Timer is missing", function()
    local FT = stubs.load({ C_Timer = stubs.NIL })
    stubs.setDB({ characters = { [GUID] = { profSig = "" } } })
    assert.has_no.errors(function() FT.handlers.SKILL_LINES_CHANGED() end)
    assert.is_table(char().snapshot)
    assert.are.equal(1, #char().events)
  end)
end)
