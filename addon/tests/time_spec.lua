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
    assert.are.same({ played = 90000, playedLevel = 4000 }, t)
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
end)
