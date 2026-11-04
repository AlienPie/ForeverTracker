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

FT.register({
  key = "questsCompleted",
  section = "progress",
  run = function()
    local ql = _G.C_QuestLog
    if type(ql) ~= "table" or type(ql.IsQuestFlaggedCompleted) ~= "function" then
      error("no quest completion API", 0)
    end
    local probe = ql.IsQuestFlaggedCompleted
    local out = {}
    for i = 1, #questIds do
      local id = questIds[i]
      local ok, done = pcall(probe, id)
      if ok and done == true then out[#out + 1] = id end
    end
    return out
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
