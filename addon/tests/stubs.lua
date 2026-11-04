-- Hand-written stubs of the WoW Classic-era globals, plus a loader that
-- resets the world and loads the addon files fresh for every test.
local M = { frames = {}, playedRequests = 0 }

local WOW_GLOBALS = {
  "FT", "ForeverTrackerDB", "time", "GetBuildInfo", "UnitGUID", "UnitName",
  "UnitClass", "UnitRace", "UnitFactionGroup", "UnitLevel", "UnitXP",
  "UnitXPMax", "GetRealZoneText", "GetSubZoneText", "GetMoney",
  "GetInventoryItemLink", "C_Map", "CreateFrame", "RequestTimePlayed",
  "C_ClassTalents", "C_Traits", "GetNumTalentTabs", "GetNumTalents",
  "GetTalentInfo", "UnitCharacterPoints", "GetNumSkillLines",
  "GetSkillLineInfo", "GetProfessions", "GetProfessionInfo", "C_QuestLog",
}

local ADDON_FILES = {
  "ForeverTracker/Core.lua",
  "ForeverTracker/Collectors/Identity.lua",
  "ForeverTracker/Collectors/State.lua",
  "ForeverTracker/Collectors/Time.lua",
  "ForeverTracker/Collectors/Talents.lua",
  "ForeverTracker/Collectors/Professions.lua",
  "ForeverTracker/Collectors/Quests.lua",
}

function M.defaults()
  local links = {
    [1] = "|cff9d9d9d|Hitem:4320:0:0:0:0:0:0:0:60|h[Spider Silk Slippers]|h|r",
    [5] = "|cffffffff|Hitem:14136:0:0:0:0:0:0:0:60|h[Robe]|h|r",
    [16] = "|Hitem:1234:0:0:0:0:0:0:0:60|h[Staff]|h",
  }
  return {
    time = function() return 1730000000 end,
    GetBuildInfo = function() return "1.60.1", "70707", "Jan 1 2026", 16001 end,
    UnitGUID = function() return "Player-1234-0A1B2C3D" end,
    UnitName = function() return "Thalindra", nil end,
    UnitClass = function() return "Mage", "MAGE", 8 end,
    UnitRace = function() return "Human", "Human", 1 end,
    UnitFactionGroup = function() return "Alliance", "Alliance" end,
    UnitLevel = function() return 34 end,
    UnitXP = function() return 12500 end,
    UnitXPMax = function() return 41000 end,
    GetRealZoneText = function() return "Stranglethorn Vale" end,
    GetSubZoneText = function() return "Booty Bay" end,
    GetMoney = function() return 183420 end,
    GetInventoryItemLink = function(unit, slot) return links[slot] end,
    CreateFrame = function()
      local frame = { events = {} }
      function frame:RegisterEvent(e) self.events[e] = true end
      function frame:SetScript(name, fn) self[name] = fn end
      M.frames[#M.frames + 1] = frame
      return frame
    end,
    RequestTimePlayed = function() M.playedRequests = M.playedRequests + 1 end,
    C_ClassTalents = { GetActiveConfigID = function() return 77 end },
    C_Traits = {
      GetConfigInfo = function() return { treeIDs = { 500 } } end,
      GetTreeNodes = function() return { 9001, 9002, 9003 } end,
      GetNodeInfo = function(_, nodeID)
        return ({ [9001] = { currentRank = 2 }, [9002] = { currentRank = 0 },
                  [9003] = { currentRank = 1 } })[nodeID]
      end,
      GetTreeCurrencyInfo = function() return { { quantity = 3, spent = 5 } } end,
    },
    GetNumSkillLines = function() return 5 end,
    -- Faithful Classic 13-return signature: name, isHeader, isExpanded, rank,
    -- numTemp, modifier, maxRank, isAbandonable, stepCost, rankCost, minLevel,
    -- costType, description.
    GetSkillLineInfo = function(i)
      local rows = {
        { "Professions", true, true },
        { "Alchemy", false, nil, 150, 0, 0, 225, nil, nil, nil, nil, nil, "" },
        { "Secondary Skills", true, true },
        { "Cooking", false, nil, 75, 0, 0, 150, nil, nil, nil, nil, nil, "" },
        { "Swords", false, nil, 100, 0, 0, 300, nil, nil, nil, nil, nil, "" },
      }
      local r = rows[i]
      if r then return unpack(r, 1, 13) end
    end,
    -- prof1, prof2, archaeology, fishing, cooking (indices; any may be nil)
    GetProfessions = function() return 1, nil, nil, nil, 2 end,
    -- name, icon, skillLevel, maxSkillLevel, numAbilities, spelloffset,
    -- skillLine, skillModifier, specializationIndex, specializationOffset
    GetProfessionInfo = function(index)
      local rows = {
        { "Alchemy", "icon", 150, 225, 2, 0, 171, 0, 0, 0 },
        { "Cooking", "icon", 75, 150, 1, 0, 185, 0, 0, 0 },
      }
      local r = rows[index]
      if r then return unpack(r, 1, 10) end
    end,
    C_QuestLog = {
      IsQuestFlaggedCompleted = function(id) return id == 100 or id == 300 end,
      GetNumQuestLogEntries = function() return 3, 2 end,
      GetInfo = function(i)
        return ({ { questID = 0, isHeader = true }, { questID = 555, isHeader = false },
                  { questID = 556, isHeader = false } })[i]
      end,
    },
    C_Map = {
      GetBestMapForUnit = function() return 1434 end,
      GetPlayerMapPosition = function()
        return { GetXY = function() return 0.2731, 0.7712 end }
      end,
    },
  }
end

function M.setDB(v) _G.ForeverTrackerDB = v end
function M.getDB() return _G.ForeverTrackerDB end

-- overrides: name -> value; use M.NIL to force a global to nil.
M.NIL = {}

function M.load(overrides)
  M.frames = {}
  M.playedRequests = 0
  for _, name in ipairs(WOW_GLOBALS) do _G[name] = nil end
  local env = M.defaults()
  for k, v in pairs(overrides or {}) do
    if v == M.NIL then env[k] = nil else env[k] = v end
  end
  for k, v in pairs(env) do _G[k] = v end
  for _, path in ipairs(ADDON_FILES) do
    local chunk = assert(loadfile(path))
    chunk("ForeverTracker", {})
  end
  return FT
end

return M
