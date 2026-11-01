-- Hand-written stubs of the WoW Classic-era globals, plus a loader that
-- resets the world and loads the addon files fresh for every test.
local M = {}

local WOW_GLOBALS = {
  "FT", "ForeverTrackerDB", "time", "GetBuildInfo", "UnitGUID", "UnitName",
  "UnitClass", "UnitRace", "UnitFactionGroup", "UnitLevel", "UnitXP",
  "UnitXPMax", "GetRealZoneText", "GetSubZoneText", "GetMoney",
  "GetInventoryItemLink", "C_Map", "CreateFrame",
}

local ADDON_FILES = {
  "ForeverTracker/Core.lua",
  "ForeverTracker/Collectors/Identity.lua",
  "ForeverTracker/Collectors/State.lua",
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
