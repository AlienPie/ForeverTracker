local FT = FT
local num, try = FT.num, FT.try

-- Cached /played values from the last TIME_PLAYED_MSG in this session. The
-- values are also persisted per character (characters[guid].played) so they
-- survive /reload and relogin; `at` is the unix time they were measured.
local cached

local function validPlayed(p)
  return type(p) == "table" and num(p.played) and num(p.playedLevel) and true or false
end

local function persisted()
  local getCharacter = FT.getCharacter
  if type(getCharacter) ~= "function" then return nil end
  local rec = getCharacter(false)
  if rec and validPlayed(rec.played) then return rec.played end
  return nil
end

function FT.onTimePlayed(total, level)
  if num(total) and num(level) then
    local at = num(FT.safe(FT.call, "time")) or 0
    cached = { played = total, playedLevel = level, at = at }
    local getCharacter = FT.getCharacter
    local rec = type(getCharacter) == "function" and getCharacter(true) or nil
    if rec then rec.played = { played = total, playedLevel = level, at = at } end
  end
  -- A /ft sync in progress is waiting for this reply (set by Slash.lua).
  local pending = FT.pendingPlayed
  if type(pending) == "function" then pcall(pending) end
end

-- Asks the client for /played; the answer arrives via TIME_PLAYED_MSG and is
-- picked up by the next snapshot. Returns true when the request was sent.
function FT.requestPlayed()
  local fn = _G.RequestTimePlayed
  if type(fn) ~= "function" then return false end
  return pcall(fn)
end

-- Event frame: optional, a missing CreateFrame just means no cache updates.
try(function()
  local frame = _G.CreateFrame("Frame")
  frame:RegisterEvent("TIME_PLAYED_MSG")
  frame:SetScript("OnEvent", function(_, _, total, level)
    FT.onTimePlayed(total, level)
  end)
end)

FT.register({
  key = "time",
  run = function()
    local p = cached or persisted()
    if not p then error("RequestTimePlayed pending", 0) end
    return { played = p.played, playedLevel = p.playedLevel, at = num(p.at) or 0 }
  end,
})
