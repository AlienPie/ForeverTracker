local stubs = require("stubs")

describe("professions collector", function()
  it("professions excludes non-profession skill lines", function()
    local p = stubs.load().takeSnapshot().progress.professions
    assert.are.same({
      { skillLine = 171, name = "Alchemy", rank = 150, max = 225 },
      { skillLine = 185, name = "Cooking", rank = 75, max = 150 },
    }, p)
  end)

  it("resolves the skill line from the English name when no id is returned", function()
    local FT = stubs.load({
      GetNumSkillLines = function() return 2 end,
      GetSkillLineInfo = function(i)
        if i == 1 then return "Mining", false, nil, 10, 0, 0, 75 end
        return "Swords", false, nil, 10, 0, 0, 300
      end,
    })
    assert.are.same({ { skillLine = 186, name = "Mining", rank = 10, max = 75 } },
      FT.takeSnapshot().progress.professions)
  end)

  it("is unavailable without the skill APIs", function()
    local FT = stubs.load({ GetNumSkillLines = stubs.NIL })
    assert.is_true(FT.takeSnapshot().progress.professions.unavailable)
  end)
end)
