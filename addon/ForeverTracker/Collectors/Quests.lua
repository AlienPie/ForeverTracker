local FT = FT
local num, try = FT.num, FT.try

-- Quest IDs to probe; supplied by the server later, empty until then.
local questIds = {}

function FT.setQuestIdList(ids)
  local list = {}
  if type(ids) == "table" then
    for _, id in ipairs(ids) do
      if num(id) then list[#list + 1] = id end
    end
  end
  questIds = list
end

-- Sorted, de-duplicated array of positive integer ids from a set { [id] = true }.
local function setToList(set)
  local out = {}
  for id in pairs(set) do out[#out + 1] = id end
  table.sort(out)
  return out
end

local function validId(id)
  return num(id) and id > 0 and id % 1 == 0 and id < 2 ^ 31
end

-- Resolves completed quests: C_QuestLog bulk, then legacy bulk, then probing
-- the bundled list plus witnessed turn-ins. Returns list, source or raises.
local function resolveCompleted()
  local ql = _G.C_QuestLog
  if type(ql) == "table" and type(ql.GetAllCompletedQuestIDs) == "function" then
    local ids = try(ql.GetAllCompletedQuestIDs)
    if type(ids) == "table" then
      local set = {}
      for _, id in ipairs(ids) do if validId(id) then set[id] = true end end
      return setToList(set), "c_questlog_bulk"
    end
  end
  if type(_G.GetQuestsCompleted) == "function" then
    local map = try(_G.GetQuestsCompleted)
    if type(map) == "table" then
      local set = {}
      for id, v in pairs(map) do if v and validId(id) then set[id] = true end end
      return setToList(set), "legacy_bulk"
    end
  end
  if type(ql) ~= "table" or type(ql.IsQuestFlaggedCompleted) ~= "function" then
    error("no quest completion API", 0)
  end
  local probe = ql.IsQuestFlaggedCompleted
  local set = {}
  for i = 1, #questIds do
    local id = questIds[i]
    local ok, done = pcall(probe, id)
    if ok and done == true and validId(id) then set[id] = true end
  end
  local rec = FT.getCharacter and FT.getCharacter(false)
  if rec and type(rec.turnedIn) == "table" then
    for key in pairs(rec.turnedIn) do
      local id = type(key) == "string" and tonumber(key)
      if id and validId(id) then set[id] = true end
    end
  end
  return setToList(set), "probe"
end

FT.register({
  key = "questsCompleted",
  section = "progress",
  run = function() return (resolveCompleted()) end,
})

FT.register({
  key = "questsSource",
  section = "progress",
  run = function()
    local _, source = resolveCompleted()
    return source
  end,
})

FT.register({
  key = "questLog",
  section = "progress",
  run = function()
    local ql = _G.C_QuestLog
    if type(ql) ~= "table" or type(ql.GetNumQuestLogEntries) ~= "function"
      or type(ql.GetInfo) ~= "function" then
      error("no quest log API", 0)
    end
    local n = num(ql.GetNumQuestLogEntries())
    if not n then error("no quest log", 0) end
    local out = {}
    for i = 1, n do
      local info = try(ql.GetInfo, i)
      if type(info) == "table" and not info.isHeader and num(info.questID) then
        out[#out + 1] = { id = info.questID }
      end
    end
    return out
  end,
})
