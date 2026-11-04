-- /ft sync: refresh /played, save, then reload so SavedVariables hit disk.
local FT = FT
local try = FT.try

local SYNC_TIMEOUT = 2

function FT.sync()
  local done = false
  local function finish()
    if done then return end
    done = true
    FT.pendingPlayed = nil
    FT.save()
    local reload = _G.ReloadUI
    if type(reload) == "function" then pcall(reload) end
  end

  if not FT.requestPlayed() then finish(); return end
  local timer = _G.C_Timer
  if type(timer) ~= "table" or type(timer.After) ~= "function" then
    finish()
    return
  end
  FT.pendingPlayed = finish
  if not pcall(timer.After, SYNC_TIMEOUT, finish) then finish() end
end

local function say(msg)
  local p = _G.print
  if type(p) == "function" then pcall(p, msg) end
end

local function handle(msg)
  local arg = type(msg) == "string" and msg:lower():match("^%s*(%S*)") or ""
  if arg == "sync" then
    FT.sync()
  else
    say("ForeverTracker: /ft sync - save a fresh snapshot and reload the UI")
  end
end

-- Slash commands need globals; only our own SlashCmdList key is written.
_G.SLASH_FOREVERTRACKER1 = "/ft"
_G.SLASH_FOREVERTRACKER2 = "/forevertracker"
if type(_G.SlashCmdList) == "table" then
  _G.SlashCmdList["FOREVERTRACKER"] = handle
end
