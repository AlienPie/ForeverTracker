local stubs = require("stubs")

describe("quests collectors", function()
  it("questsCompleted lists only IDs flagged completed", function()
    local FT = stubs.load()
    FT.setQuestIdList({ 100, 200, 300 })
    assert.are.same({ 100, 300 }, FT.takeSnapshot().progress.questsCompleted)
  end)

  it("questsCompleted is empty by default", function()
    assert.are.same({}, stubs.load().takeSnapshot().progress.questsCompleted)
  end)

  it("questsCompleted with 6000 IDs completes in under 1 second under stubs", function()
    local FT = stubs.load()
    local ids = {}
    for i = 1, 6000 do ids[i] = i end
    FT.setQuestIdList(ids)
    local start = os.clock()
    local done = FT.takeSnapshot().progress.questsCompleted
    assert.is_true(os.clock() - start < 1)
    assert.are.equal(2, #done)
  end)

  it("questsCompleted skips IDs whose probe throws and is unavailable without the API", function()
    local FT = stubs.load({ C_QuestLog = {
      IsQuestFlaggedCompleted = function(id) if id == 2 then error("x") end return true end,
    } })
    FT.setQuestIdList({ 1, 2, 3 })
    assert.are.same({ 1, 3 }, FT.takeSnapshot().progress.questsCompleted)
    FT = stubs.load({ C_QuestLog = stubs.NIL })
    assert.is_true(FT.takeSnapshot().progress.questsCompleted.unavailable)
  end)

  it("setQuestIdList ignores non-numeric entries and non-tables", function()
    local FT = stubs.load()
    FT.setQuestIdList({ 100, "x", 300 })
    assert.are.same({ 100, 300 }, FT.takeSnapshot().progress.questsCompleted)
    FT.setQuestIdList(nil)
    assert.are.same({}, FT.takeSnapshot().progress.questsCompleted)
  end)

  it("questLog skips header rows", function()
    assert.are.same({ { id = 555 }, { id = 556 } },
      stubs.load().takeSnapshot().progress.questLog)
  end)

  it("questLog is unavailable without the API", function()
    local FT = stubs.load({ C_QuestLog = stubs.NIL })
    assert.is_true(FT.takeSnapshot().progress.questLog.unavailable)
  end)
end)
