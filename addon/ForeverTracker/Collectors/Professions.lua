local FT = FT
local str, num = FT.str, FT.num

-- English names of the primary and secondary professions (lowercase), used
-- only by the fallback path.
local ALLOW = {}
for _, n in ipairs({ "alchemy", "blacksmithing", "enchanting", "engineering",
  "herbalism", "leatherworking", "mining", "skinning", "tailoring",
  "cooking", "first aid", "fishing" }) do ALLOW[n] = true end

-- Primary, locale-independent: GetProfessions() gives up to 5 indices
-- (prof1, prof2, archaeology, fishing, cooking; any may be nil), and
-- GetProfessionInfo(index) carries the skill line id. Unaffected by a
-- collapsed skill window.
local function fromProfessions()
  local out = {}
  local packed = { pcall(_G.GetProfessions) }
  if not packed[1] then error("GetProfessions failed", 0) end
  for i = 2, 6 do
    local index = packed[i]
    if num(index) then
      local ok, name, _, rank, max, _, _, skillLine = pcall(_G.GetProfessionInfo, index)
      if ok and str(name) and num(skillLine) and num(rank) and num(max) then
        out[#out + 1] = { skillLine = skillLine, name = name, rank = rank, max = max }
      end
    end
  end
  return out
end

-- Fallback, English-only: scans the skill window with the 13-return Classic
-- GetSkillLineInfo. Collapsed headers hide rows, which is reported rather
-- than hidden. Never expands or collapses headers.
local function fromSkillLines()
  if type(_G.GetNumSkillLines) ~= "function" or type(_G.GetSkillLineInfo) ~= "function" then
    error("no skill line API", 0)
  end
  local n = num(_G.GetNumSkillLines())
  if not n then error("no skill lines", 0) end
  local out, nonHeader = {}, 0
  for i = 1, n do
    local ok, name, header, _, rank, _, _, max = pcall(_G.GetSkillLineInfo, i)
    if ok and not header and str(name) then
      nonHeader = nonHeader + 1
      if ALLOW[name:lower()] and num(rank) and num(max) then
        out[#out + 1] = { skillLine = 0, name = name, rank = rank, max = max }
      end
    end
  end
  if #out == 0 and nonHeader > 0 then
    error("professions not recognised (non-English client or collapsed skill headers)", 0)
  end
  return out
end

FT.register({
  key = "professions",
  section = "progress",
  run = function()
    if type(_G.GetProfessions) == "function" and type(_G.GetProfessionInfo) == "function" then
      return fromProfessions()
    end
    return fromSkillLines()
  end,
})
