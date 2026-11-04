local FT = FT
local str, num = FT.str, FT.num

-- Primary and secondary profession skill line IDs, with English names for
-- clients whose GetSkillLineInfo does not return the skill line ID.
local BY_ID = {
  [171] = "Alchemy", [164] = "Blacksmithing", [333] = "Enchanting",
  [202] = "Engineering", [165] = "Leatherworking", [197] = "Tailoring",
  [182] = "Herbalism", [186] = "Mining", [393] = "Skinning",
  [185] = "Cooking", [129] = "First Aid", [356] = "Fishing",
}
local BY_NAME = {}
for id, name in pairs(BY_ID) do BY_NAME[name] = id end

FT.register({
  key = "professions",
  section = "progress",
  run = function()
    if type(_G.GetNumSkillLines) ~= "function" or type(_G.GetSkillLineInfo) ~= "function" then
      error("no skill line API", 0)
    end
    local n = num(_G.GetNumSkillLines())
    if not n then error("no skill lines", 0) end
    local out = {}
    for i = 1, n do
      local ok, name, header, _, rank, _, _, max, _, _, _, _, _, _, lineId =
        pcall(_G.GetSkillLineInfo, i)
      if ok and not header and str(name) then
        local id = (num(lineId) and BY_ID[lineId] and lineId) or BY_NAME[name]
        if id and num(rank) and num(max) then
          out[#out + 1] = { skillLine = id, name = name, rank = rank, max = max }
        end
      end
    end
    return out
  end,
})
