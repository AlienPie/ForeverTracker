local FT = FT
local call = FT.call

local str, num = FT.str, FT.num

FT.register({
  key = "identity",
  run = function()
    local id = {}
    local fullName = call("UnitName", "player")
    if type(fullName) == "string" and fullName ~= "" then
      local dash = fullName:find("-", 1, true)
      if dash then
        id.name = fullName:sub(1, dash - 1)
        id.surname = str(fullName:sub(dash + 1))
      else
        id.name = fullName
      end
    end
    -- Stable non-localized tokens: class/race tokens are the 2nd returns.
    local _, classToken = call("UnitClass", "player")
    id.class = str(classToken)
    local _, raceToken = call("UnitRace", "player")
    id.race = str(raceToken)
    id.faction = str((call("UnitFactionGroup", "player")))
    id.level = num(call("UnitLevel", "player"))
    id.xp = num(call("UnitXP", "player"))
    id.xpMax = num(call("UnitXPMax", "player"))
    if next(id) == nil then error("no identity data", 0) end
    return id
  end,
})
