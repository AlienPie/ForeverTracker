-- /ft sync: refresh /played, then save a snapshot. The addon never calls
-- ReloadUI (blocked for addons on this client); the player types /reload.
local FT = FT
local try = FT.try

local SYNC_TIMEOUT = 2

local function say(msg)
  local p = _G.print
  if type(p) == "function" then pcall(p, msg) end
end

function FT.sync()
  local done = false
  local function finish()
    if done then return end
    done = true
    FT.pendingPlayed = nil
    local ok, saved = pcall(FT.save)
    if ok and saved == true then
      say("ForeverTracker: snapshot saved. Type /reload to write the data file to disk.")
    else
      say("ForeverTracker: could not save a snapshot.")
    end
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

local function handle(msg)
  local arg = type(msg) == "string" and msg:lower():match("^%s*(%S*)") or ""
  if arg == "sync" then
    FT.sync()
  else
    say("ForeverTracker: /ft sync - save a fresh snapshot (then type /reload)")
  end
end

-- Slash commands need globals; only our own SlashCmdList key is written.
_G.SLASH_FOREVERTRACKER1 = "/ft"
_G.SLASH_FOREVERTRACKER2 = "/forevertracker"
if type(_G.SlashCmdList) == "table" then
  _G.SlashCmdList["FOREVERTRACKER"] = handle
end
