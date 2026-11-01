local FT = FT

-- Equipment slot name -> inventory slot id (stable, non-localized keys).
local SLOTS = {
  AmmoSlot = 0, HeadSlot = 1, NeckSlot = 2, ShoulderSlot = 3, ShirtSlot = 4,
  ChestSlot = 5, WaistSlot = 6, LegsSlot = 7, FeetSlot = 8, WristSlot = 9,
  HandsSlot = 10, Finger0Slot = 11, Finger1Slot = 12, Trinket0Slot = 13,
  Trinket1Slot = 14, BackSlot = 15, MainHandSlot = 16, SecondaryHandSlot = 17,
  RangedSlot = 18, TabardSlot = 19,
}

local str, num, try = FT.str, FT.num, FT.try

local function equipped()
  local out = {}
  for name, slot in pairs(SLOTS) do
    local link = try(FT.call, "GetInventoryItemLink", "player", slot)
    if type(link) == "string" then
      local id = tonumber(link:match("item:(%d+)"))
      if id then out[name] = id end
    end
  end
  return out
end

local function position()
  local map = _G.C_Map
  if type(map) ~= "table" then return nil end
  local mapId = num(try(map.GetBestMapForUnit, "player"))
  if not mapId then return nil end
  local x, y
  local pos = try(map.GetPlayerMapPosition, mapId, "player")
  if type(pos) == "table" and type(pos.GetXY) == "function" then
    local okXY, px, py = pcall(pos.GetXY, pos)
    if okXY then x, y = num(px), num(py) end
  end
  return mapId, x, y
end

FT.register({
  key = "state",
  run = function()
    local s = {}
    s.zone = str(try(FT.call, "GetRealZoneText"))
    s.subzone = str(try(FT.call, "GetSubZoneText"))
    s.money = num(try(FT.call, "GetMoney"))
    -- Map data is optional: without C_Map the rest of the section still lands.
    local okPos, mapId, x, y = pcall(position)
    if okPos then s.mapId, s.x, s.y = mapId, x, y end
    -- Only report equipment when the API exists at all.
    if type(_G.GetInventoryItemLink) == "function" then s.equipped = equipped() end
    local hasData = false
    for k, v in pairs(s) do
      if k ~= "equipped" or next(v) ~= nil then hasData = true end
    end
    if not hasData then error("no state data", 0) end
    return s
  end,
})
