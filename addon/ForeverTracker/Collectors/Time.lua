local FT = FT
local num, try = FT.num, FT.try

-- Cached /played values from the last TIME_PLAYED_MSG.
local cached

function FT.onTimePlayed(total, level)
  if num(total) and num(level) then
    cached = { played = total, playedLevel = level }
  end
  -- A /ft sync in progress is waiting for this reply (set by Slash.lua).
  local pending = FT.pendingPlayed
  if type(pending) == "function" then pending() end
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
    if not cached then error("RequestTimePlayed pending", 0) end
    return { played = cached.played, playedLevel = cached.playedLevel }
  end,
})
