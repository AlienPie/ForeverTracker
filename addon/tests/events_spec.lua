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

  it("SKILL_LINES_CHANGED logs profession_changed and saves", function()
    local FT = stubs.load()
    stubs.setDB(nil)
    FT.handlers.SKILL_LINES_CHANGED()
    assert.are.equal("profession_changed", char().events[1].kind)
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

  it("PLAYER_ENTERING_WORLD records a visit and saves; PLAYER_LOGOUT saves", function()
    local FT = stubs.load()
    stubs.setDB(nil)
    FT.handlers.PLAYER_ENTERING_WORLD()
    assert.is_table(char().visited["1434:Booty Bay"])
    assert.is_table(char().snapshot)
    char().snapshot = nil
    FT.handlers.PLAYER_LOGOUT()
    assert.is_table(char().snapshot)
    assert.is_function(FT.handlers.PLAYER_LEAVING_WORLD)
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
    FT.handlers.PLAYER_LOGOUT = function() error("boom") end
    assert.has_no.errors(function() frame.OnEvent(frame, "PLAYER_LOGOUT") end)
  end)

  it("loads without CreateFrame", function()
    local FT = stubs.load({ CreateFrame = stubs.NIL })
    assert.is_function(FT.handlers.PLAYER_LOGOUT)
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
