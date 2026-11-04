local stubs = require("stubs")

local NO_PRIMARY = { GetProfessions = stubs.NIL, GetProfessionInfo = stubs.NIL }
local function fallback(extra)
  local o = { GetProfessions = stubs.NIL, GetProfessionInfo = stubs.NIL }
  for k, v in pairs(extra or {}) do o[k] = v end
  return o
end

describe("professions collector", function()
  it("professions primary path is used when GetProfessions exists", function()
    local FT = stubs.load({
      -- the skill window would give different data; it must not be consulted
      GetNumSkillLines = function() error("must not be called") end,
    })
    assert.are.same({
      { skillLine = 171, name = "Alchemy", rank = 150, max = 225 },
      { skillLine = 185, name = "Cooking", rank = 75, max = 150 },
    }, FT.takeSnapshot().progress.professions)
  end)

  it("professions primary path returns skillLine ids regardless of localized name", function()
    local FT = stubs.load({
      GetProfessions = function() return nil, 1 end,
      GetProfessionInfo = function()
        return "Alchimie", "icon", 40, 75, 1, 0, 171, 0, 0, 0
      end,
    })
    assert.are.same({ { skillLine = 171, name = "Alchimie", rank = 40, max = 75 } },
      FT.takeSnapshot().progress.professions)
  end)

  it("professions fallback path is used when GetProfessions is nil", function()
    local FT = stubs.load(NO_PRIMARY)
    assert.are.same({
      { skillLine = 0, name = "Alchemy", rank = 150, max = 225 },
      { skillLine = 0, name = "Cooking", rank = 75, max = 150 },
    }, FT.takeSnapshot().progress.professions)
  end)

  it("professions fallback excludes non-profession lines and headers", function()
    local FT = stubs.load(fallback({
      GetNumSkillLines = function() return 4 end,
      GetSkillLineInfo = function(i)
        local rows = {
          { "Professions", true }, { "first aid", false, nil, 10, 0, 0, 75 },
          { "Swords", false, nil, 5, 0, 0, 300 }, { "Common", false, nil, 300, 0, 0, 300 },
        }
        local r = rows[i]
        if r then return unpack(r, 1, 13) end
      end,
    }))
    assert.are.same({ { skillLine = 0, name = "first aid", rank = 10, max = 75 } },
      FT.takeSnapshot().progress.professions)
  end)

  it("professions fallback is unavailable when nothing is recognised", function()
    local FT = stubs.load(fallback({
      GetNumSkillLines = function() return 2 end,
      GetSkillLineInfo = function(i)
        if i == 1 then return "Alchimie", false, nil, 10, 0, 0, 75 end
        return "Epees", false, nil, 10, 0, 0, 300
      end,
    }))
    local p = FT.takeSnapshot().progress.professions
    assert.is_true(p.unavailable)
    assert.is_truthy(p.reason:find("not recognised", 1, true))
  end)

  it("professions fallback with only headers returns an empty list", function()
    local FT = stubs.load(fallback({
      GetNumSkillLines = function() return 1 end,
      GetSkillLineInfo = function() return "Professions", true end,
    }))
    assert.are.same({}, FT.takeSnapshot().progress.professions)
  end)

  it("professions is unavailable without any skill API", function()
    local FT = stubs.load(fallback({ GetNumSkillLines = stubs.NIL }))
    assert.is_true(FT.takeSnapshot().progress.professions.unavailable)
  end)

  it("professions never mutates the skill window", function()
    local touched = false
    local FT = stubs.load(fallback({
      ExpandSkillHeader = function() touched = true end,
      CollapseSkillHeader = function() touched = true end,
    }))
    FT.takeSnapshot()
    assert.is_false(touched)
  end)
end)
