local stubs = require("stubs")

describe("talents collector", function()
  it("talents uses the trait tree when C_Traits exists", function()
    local t = stubs.load().takeSnapshot().progress.talents
    assert.are.same({ ["9001"] = 2, ["9003"] = 1 }, t.nodes)
    assert.are.equal(3, t.unspent)
  end)

  it("talents falls back to tabs when only GetTalentInfo exists", function()
    local FT = stubs.load({
      C_ClassTalents = stubs.NIL, C_Traits = stubs.NIL,
      GetNumTalentTabs = function() return 2 end,
      GetNumTalents = function(tab) return tab == 1 and 2 or 1 end,
      GetTalentInfo = function(tab, i)
        local ranks = { ["1.1"] = 5, ["1.2"] = 0, ["2.1"] = 3 }
        return "Name", "icon", 1, 1, ranks[tab .. "." .. i], 5
      end,
      UnitCharacterPoints = function() return 4 end,
    })
    local t = FT.takeSnapshot().progress.talents
    assert.are.same({ ["1.1"] = 5, ["2.1"] = 3 }, t.nodes)
    assert.are.equal(4, t.unspent)
  end)

  it("talents is unavailable when neither API exists", function()
    local FT = stubs.load({ C_ClassTalents = stubs.NIL, C_Traits = stubs.NIL })
    local t = FT.takeSnapshot().progress.talents
    assert.is_true(t.unavailable)
    assert.are.equal("string", type(t.reason))
  end)

  it("talents falls back when the trait tree has no active config", function()
    local FT = stubs.load({
      C_ClassTalents = { GetActiveConfigID = function() return nil end },
      GetNumTalentTabs = function() return 0 end,
      GetTalentInfo = function() end,
    })
    local t = FT.takeSnapshot().progress.talents
    assert.are.same({}, t.nodes)
    assert.are.equal(0, t.unspent)
  end)

  it("talents tolerates a throwing node lookup", function()
    local FT = stubs.load()
    _G.C_Traits.GetNodeInfo = function() error("restricted") end
    local t = FT.takeSnapshot().progress.talents
    assert.are.same({}, t.nodes)
  end)
end)
