local stubs = require("stubs")

describe("state collector", function()
  it("collects zone, map, position, money and equipment", function()
    local s = stubs.load().takeSnapshot().state
    assert.are.equal("Stranglethorn Vale", s.zone)
    assert.are.equal("Booty Bay", s.subzone)
    assert.are.equal(1434, s.mapId)
    assert.are.equal(0.2731, s.x)
    assert.are.equal(0.7712, s.y)
    assert.are.equal(183420, s.money)
    assert.are.same({ HeadSlot = 4320, ChestSlot = 14136, MainHandSlot = 1234 }, s.equipped)
  end)

  it("omits position when the map has no player position", function()
    local FT = stubs.load({ C_Map = {
      GetBestMapForUnit = function() return 1434 end,
      GetPlayerMapPosition = function() return nil end,
    } })
    local s = FT.takeSnapshot().state
    assert.are.equal(1434, s.mapId)
    assert.is_nil(s.x)
  end)

  it("survives a throwing GetPlayerMapPosition and bad links", function()
    local FT = stubs.load({
      C_Map = { GetBestMapForUnit = function() return 1 end,
                GetPlayerMapPosition = function() error("restricted") end },
      GetInventoryItemLink = function() return 12 end,
    })
    local s = FT.takeSnapshot().state
    assert.are.equal(1, s.mapId)
    assert.is_nil(s.x)
    assert.are.same({}, s.equipped)
  end)

  it("degrades when everything is missing", function()
    local FT = stubs.load({
      GetRealZoneText = stubs.NIL, GetSubZoneText = stubs.NIL, GetMoney = stubs.NIL,
      GetInventoryItemLink = stubs.NIL, C_Map = stubs.NIL,
    })
    assert.is_true(FT.takeSnapshot().state.unavailable)
  end)
end)
