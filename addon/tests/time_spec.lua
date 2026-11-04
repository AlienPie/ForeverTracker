local stubs = require("stubs")

describe("time collector", function()
  it("time uses the cached TIME_PLAYED_MSG values and reports unavailable if none yet", function()
    local FT = stubs.load()
    local t = FT.takeSnapshot().time
    assert.is_true(t.unavailable)
    local frame = stubs.frames[1]
    assert.is_true(frame.events["TIME_PLAYED_MSG"])
    frame.OnEvent(frame, "TIME_PLAYED_MSG", 90000, 4000)
    t = FT.takeSnapshot().time
    assert.are.same({ played = 90000, playedLevel = 4000, at = stubs.now }, t)
  end)

  it("requestPlayed calls RequestTimePlayed and tolerates its absence", function()
    local FT = stubs.load()
    FT.requestPlayed()
    assert.are.equal(1, stubs.playedRequests)
    FT = stubs.load({ RequestTimePlayed = stubs.NIL, CreateFrame = stubs.NIL })
    assert.has_no.errors(function() FT.requestPlayed() end)
    assert.is_true(FT.takeSnapshot().time.unavailable)
  end)

  it("ignores non-numeric played values", function()
    local FT = stubs.load()
    stubs.frames[1].OnEvent(stubs.frames[1], "TIME_PLAYED_MSG", "x", nil)
    assert.is_true(FT.takeSnapshot().time.unavailable)
  end)

  local function char() return stubs.getDB().characters["Player-1234-0A1B2C3D"] end

  it("TIME_PLAYED_MSG persists { played, playedLevel, at } beside the snapshot", function()
    stubs.setDB(nil)
    stubs.load()
    stubs.frames[1].OnEvent(stubs.frames[1], "TIME_PLAYED_MSG", 90000, 4000)
    assert.are.same({ played = 90000, playedLevel = 4000, at = stubs.now }, char().played)
  end)

  it("a reload (fresh load, persisted DB) keeps time with its original `at`", function()
    stubs.setDB(nil)
    local FT = stubs.load()
    stubs.frames[1].OnEvent(stubs.frames[1], "TIME_PLAYED_MSG", 90000, 4000)
    local saved = stubs.getDB()
    stubs.load()
    stubs.setDB(saved)
    stubs.now = stubs.now + 600
    FT = _G.FT
    FT.save()
    assert.are.same({ played = 90000, playedLevel = 4000, at = 1730000000 }, char().snapshot.time)
  end)

  it("in-memory cache wins over the persisted value", function()
    stubs.setDB({ characters = { ["Player-1234-0A1B2C3D"] = { played = { played = 1, playedLevel = 1, at = 5 } } } })
    local FT = stubs.load()
    stubs.setDB({ characters = { ["Player-1234-0A1B2C3D"] = { played = { played = 1, playedLevel = 1, at = 5 } } } })
    assert.are.same({ played = 1, playedLevel = 1, at = 5 }, FT.takeSnapshot().time)
    stubs.frames[1].OnEvent(stubs.frames[1], "TIME_PLAYED_MSG", 7, 3)
    assert.are.same({ played = 7, playedLevel = 3, at = stubs.now }, FT.takeSnapshot().time)
  end)

  it("a malformed persisted value is ignored (unavailable)", function()
    local FT = stubs.load()
    stubs.setDB({ characters = { ["Player-1234-0A1B2C3D"] = { played = { played = "x" } } } })
    assert.is_true(FT.takeSnapshot().time.unavailable)
  end)

  it("no error and nothing persisted when the player GUID is nil", function()
    stubs.setDB(nil)
    local FT = stubs.load({ UnitGUID = function() return nil end })
    assert.has_no.errors(function()
      stubs.frames[1].OnEvent(stubs.frames[1], "TIME_PLAYED_MSG", 9, 9)
    end)
    assert.is_nil(stubs.getDB())
    assert.is_true(FT.takeSnapshot().time.played == 9)
  end)
end)
