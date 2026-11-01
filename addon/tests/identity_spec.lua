local stubs = require("stubs")

describe("identity collector", function()
  it("collects the stable identifiers", function()
    local id = stubs.load().takeSnapshot().identity
    assert.are.same({
      name = "Thalindra", class = "MAGE", race = "Human", faction = "Alliance",
      level = 34, xp = 12500, xpMax = 41000,
    }, id)
  end)

  it("identity splits Name-Surname", function()
    local FT = stubs.load({ UnitName = function() return "Thalindra-Dawnbringer" end })
    local id = FT.takeSnapshot().identity
    assert.are.equal("Thalindra", id.name)
    assert.are.equal("Dawnbringer", id.surname)
  end)

  it("splits only on the first dash", function()
    local FT = stubs.load({ UnitName = function() return "A-B-C" end })
    local id = FT.takeSnapshot().identity
    assert.are.equal("A", id.name)
    assert.are.equal("B-C", id.surname)
  end)

  it("omits fields of the wrong type and degrades when a global is missing", function()
    local FT = stubs.load({ UnitLevel = function() return "x" end })
    assert.is_nil(FT.takeSnapshot().identity.level)
    FT = stubs.load({ UnitRace = stubs.NIL })
    assert.is_true(FT.takeSnapshot().identity.unavailable)
  end)

  it("degrades when nothing can be read", function()
    local FT = stubs.load({
      UnitName = function() return nil end, UnitClass = function() return nil end,
      UnitRace = function() return nil end, UnitFactionGroup = function() return nil end,
      UnitLevel = function() return nil end, UnitXP = function() return nil end,
      UnitXPMax = function() return nil end,
    })
    assert.is_true(FT.takeSnapshot().identity.unavailable)
  end)
end)
