-- ForeverTracker core: collector registry, defensive helpers, snapshot + save.
-- Lua 5.1 only. The only globals defined are FT and ForeverTrackerDB.

FT = FT or {}
local FT = FT

FT.SCHEMA = 1
FT.collectors = {}

local function unavailable(reason)
  return { unavailable = true, reason = reason }
end
FT.unavailable = unavailable

-- Runs fn(...) under pcall. Returns its first value, or an unavailable marker
-- carrying the error text when it throws.
function FT.safe(fn, ...)
  local ok, result = pcall(fn, ...)
  if ok then return result end
  local reason = type(result) == "string" and result or tostring(result)
  if #reason > 200 then reason = reason:sub(1, 200) end
  return unavailable(reason)
end

-- Appends a collector: { key = string, section = string?, run = function }.
function FT.register(entry)
  if type(entry) ~= "table" or type(entry.key) ~= "string" or type(entry.run) ~= "function" then
    return false
  end
  FT.collectors[#FT.collectors + 1] = entry
  return true
end

-- Calls the global function `name` (error if it is not a function).
function FT.call(name, ...)
  local fn = _G[name]
  if type(fn) ~= "function" then error(name .. " unavailable", 0) end
  return fn(...)
end

function FT.isUnavailable(v)
  return type(v) == "table" and v.unavailable == true
end

function FT.takeSnapshot()
  local snap = {}
  local now = FT.safe(FT.call, "time")
  snap.takenAt = type(now) == "number" and now or 0

  local build = FT.safe(function()
    local version, number = FT.call("GetBuildInfo")
    if version == nil or number == nil then return nil end
    return tostring(version) .. "." .. tostring(number)
  end)
  if type(build) == "string" then snap.build = build end

  for _, c in ipairs(FT.collectors) do
    local result = FT.safe(c.run)
    if c.section then
      if type(snap[c.section]) ~= "table" then snap[c.section] = {} end
      snap[c.section][c.key] = result
    else
      snap[c.key] = result
    end
  end
  return snap
end

-- Replaces only characters[guid].snapshot, preserving events/visited/etc.
-- Returns true, or false plus a reason.
function FT.save()
  local guid = FT.safe(FT.call, "UnitGUID", "player")
  if type(guid) ~= "string" or guid == "" then return false, "no player GUID" end

  local snap = FT.takeSnapshot()
  if type(ForeverTrackerDB) ~= "table" then ForeverTrackerDB = {} end
  local db = ForeverTrackerDB
  db.schema = FT.SCHEMA
  if type(db.characters) ~= "table" then db.characters = {} end
  if type(db.characters[guid]) ~= "table" then db.characters[guid] = {} end
  db.characters[guid].snapshot = snap
  return true
end
