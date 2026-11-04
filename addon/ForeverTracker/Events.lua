-- Persistent per-character state (visited places, events, taxi nodes) and the
-- event frame. Everything here is defensive: handlers never raise.
local FT = FT
local num, str, try = FT.num, FT.str, FT.try

local MAX_EVENTS = 500

local function playerGuid()
  local guid = FT.safe(FT.call, "UnitGUID", "player")
  return str(guid)
end

-- Returns characters[guid] (creating DB/characters/table lazily when `create`
-- is true), or nil when there is no player GUID or nothing exists yet.
function FT.getCharacter(create)
  local guid = playerGuid()
  if not guid then return nil end
  if type(_G.ForeverTrackerDB) ~= "table" then
    if not create then return nil end
    _G.ForeverTrackerDB = { schema = FT.SCHEMA }
  end
  local db = _G.ForeverTrackerDB
  if type(db.characters) ~= "table" then
    if not create then return nil end
    db.characters = {}
  end
  if type(db.characters[guid]) ~= "table" then
    if not create then return nil end
    db.characters[guid] = {}
  end
  return db.characters[guid]
end

local function now()
  local t = FT.safe(FT.call, "time")
  return num(t) or 0
end

-- Appends { t, kind, data } to the character's events, keeping the newest 500.
function FT.logEvent(kind, data)
  if not str(kind) then return false end
  local rec = FT.getCharacter(true)
  if not rec then return false end
  if type(rec.events) ~= "table" then rec.events = {} end
  local events = rec.events
  events[#events + 1] = { t = now(), kind = kind, data = type(data) == "table" and data or {} }
  local excess = #events - MAX_EVENTS
  if excess > 0 then
    for i = 1, MAX_EVENTS do events[i] = events[i + excess] end
    for i = MAX_EVENTS + 1, MAX_EVENTS + excess do events[i] = nil end
  end
  return true
end

-- Records the current (mapId, subzone). Returns true when the place was newly
-- added; false when it was already known or cannot be determined. Returns the
-- place as 2nd/3rd values when newly added.
function FT.recordVisit()
  local mapId = FT.safe(function()
    local cmap = _G.C_Map
    return cmap.GetBestMapForUnit("player")
  end)
  if not num(mapId) then return false end
  local sub = FT.safe(FT.call, "GetSubZoneText")
  if type(sub) ~= "string" then sub = "" end
  local rec = FT.getCharacter(true)
  if not rec then return false end
  if type(rec.visited) ~= "table" then rec.visited = {} end
  local key = mapId .. ":" .. sub
  if rec.visited[key] ~= nil then return false end
  rec.visited[key] = { mapId = mapId, subzone = sub, firstSeen = now() }
  return true, mapId, sub
end

-- Records known flight-path node ids from the open taxi map. Uses the
-- retail-shaped C_TaxiMap.GetTaxiNodesForMap(uiMapID) (array of { nodeID, ... })
-- or a global GetTaxiNodesForMap; does nothing when neither exists.
function FT.recordTaxi()
  local fn
  local ct = _G.C_TaxiMap
  if type(ct) == "table" and type(ct.GetTaxiNodesForMap) == "function" then
    fn = ct.GetTaxiNodesForMap
  elseif type(_G.GetTaxiNodesForMap) == "function" then
    fn = _G.GetTaxiNodesForMap
  end
  if not fn then return false end
  -- Prefer the map the open taxi window shows (normally continent-level);
  -- GetBestMapForUnit is a zone map and may yield few or no nodes. The nodes
  -- are recorded as the API returns them, NOT filtered by discovery state (the
  -- state enum is unverified); results accumulate across opens and may be
  -- partial. Verify on launch day.
  local mapId = type(_G.GetTaxiMapID) == "function" and try(_G.GetTaxiMapID) or nil
  if not num(mapId) then
    mapId = try(function() return _G.C_Map.GetBestMapForUnit("player") end)
  end
  if not num(mapId) then return false end
  local nodes = try(fn, mapId)
  if type(nodes) ~= "table" then return false end
  local rec = FT.getCharacter(true)
  if not rec then return false end
  local set = {}
  if type(rec.taxi) == "table" then
    for _, id in ipairs(rec.taxi) do if num(id) then set[id] = true end end
  end
  for _, node in ipairs(nodes) do
    local id = type(node) == "table" and num(node.nodeID)
    if id then set[id] = true end
  end
  local list = {}
  for id in pairs(set) do list[#list + 1] = id end
  table.sort(list)
  rec.taxi = list
  return true
end

local function onZone()
  local added, mapId, sub = FT.recordVisit()
  if added then FT.logEvent("zone_first_visit", { mapId = mapId, subzone = sub }) end
end

FT.handlers = {
  PLAYER_ENTERING_WORLD = function() FT.recordVisit(); FT.save() end,
  PLAYER_LEAVING_WORLD = function() FT.save() end,
  PLAYER_LOGOUT = function() FT.save() end,
  PLAYER_LEVEL_UP = function(level)
    FT.logEvent("level_up", { level = num(level) })
    FT.save()
  end,
  QUEST_TURNED_IN = function(questId)
    FT.logEvent("quest_turned_in", { questId = num(questId) })
    FT.save()
  end,
  ZONE_CHANGED = onZone,
  ZONE_CHANGED_INDOORS = onZone,
  ZONE_CHANGED_NEW_AREA = onZone,
  SKILL_LINES_CHANGED = function()
    FT.logEvent("profession_changed", {})
    FT.save()
  end,
  TAXIMAP_OPENED = function() FT.recordTaxi() end,
}

-- One guarded frame. Each RegisterEvent is pcall'd (an unknown event name
-- raises in the client), and the dispatcher pcalls every handler.
try(function()
  local frame = _G.CreateFrame("Frame")
  for event in pairs(FT.handlers) do
    pcall(frame.RegisterEvent, frame, event)
  end
  frame:SetScript("OnEvent", function(_, event, ...)
    local h = FT.handlers[event]
    if h then pcall(h, ...) end
  end)
end)
