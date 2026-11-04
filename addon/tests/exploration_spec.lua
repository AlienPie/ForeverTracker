local stubs = require("stubs")

local GUID = "Player-1234-0A1B2C3D"

describe("exploration collector", function()
  it("emits visited as a sorted array and taxi as an array", function()
    local FT = stubs.load()
    stubs.setDB({ characters = { [GUID] = {
      visited = {
        ["1434:Booty Bay"] = { mapId = 1434, subzone = "Booty Bay", firstSeen = 200 },
        ["1429:Goldshire"] = { mapId = 1429, subzone = "Goldshire", firstSeen = 100 },
      },
      taxi = { 3, 12 },
    } } })
    local e = FT.takeSnapshot().exploration
    assert.are.same({
      { mapId = 1429, subzone = "Goldshire", firstSeen = 100 },
      { mapId = 1434, subzone = "Booty Bay", firstSeen = 200 },
    }, e.visited)
    assert.are.same({ 3, 12 }, e.taxi)
  end)

  it("emits an empty visited list and no taxi when nothing is recorded", function()
    local FT = stubs.load()
    stubs.setDB(nil)
    local e = FT.takeSnapshot().exploration
    assert.are.same({}, e.visited)
    assert.is_nil(e.taxi)
  end)

  it("exploration is unavailable when C_Map is missing", function()
    local FT = stubs.load({ C_Map = stubs.NIL })
    local e = FT.takeSnapshot().exploration
    assert.is_true(e.unavailable)
  end)

  it("taxi is omitted, not an error, when GetTaxiNodesForMap is missing", function()
    local FT = stubs.load({ C_TaxiMap = stubs.NIL })
    stubs.setDB(nil)
    assert.has_no.errors(function() FT.handlers.TAXIMAP_OPENED() end)
    local e = FT.takeSnapshot().exploration
    assert.is_nil(e.taxi)
    assert.is_table(e.visited)
  end)
end)
