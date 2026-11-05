local stubs = require("stubs")

describe("quests collectors", function()
  it("questsCompleted lists only IDs flagged completed", function()
    local FT = stubs.load()
    FT.setQuestIdList({ 100, 200, 300 })
    assert.are.same({ 100, 300 }, FT.takeSnapshot().progress.questsCompleted)
  end)

  it("questsCompleted uses the bundled list by default (stub flags 100 and 300, only 100 is a shipped quest)", function()
    local done = stubs.load().takeSnapshot().progress.questsCompleted
    assert.are.same({ 100 }, done)
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

describe("bundled quest ID list", function()
  local function shipped()
    local captured
    local FT = stubs.load()
    local orig = FT.setQuestIdList
    FT.setQuestIdList = function(ids) captured = ids return orig(ids) end
    assert(loadfile("ForeverTracker/Data/QuestIds.lua"))()
    return captured, FT
  end

  it("is a large, sorted, unique list of positive integers", function()
    local ids = shipped()
    assert.is_true(#ids > 1000)
    for i, id in ipairs(ids) do
      assert.is_true(type(id) == "number" and id > 0 and id % 1 == 0)
      if i > 1 then assert.is_true(id > ids[i - 1]) end
    end
  end)

  it("is loaded by default so completed quests are reported", function()
    local ids = shipped()
    local a, b = ids[10], ids[200]
    local FT = stubs.load({ C_QuestLog = {
      IsQuestFlaggedCompleted = function(id) return id == a or id == b end,
    } })
    assert.are.same({ a, b }, FT.takeSnapshot().progress.questsCompleted)
  end)

  it("keeps the other IDs when one probe errors", function()
    local ids = shipped()
    local a, bad, b = ids[10], ids[11], ids[12]
    local FT = stubs.load({ C_QuestLog = {
      IsQuestFlaggedCompleted = function(id)
        if id == bad then error("boom") end
        return id == a or id == b
      end,
    } })
    assert.are.same({ a, b }, FT.takeSnapshot().progress.questsCompleted)
  end)
end)

describe("questsCompleted source order", function()
  local function snap(overrides, setup)
    local FT = stubs.load(overrides)
    if setup then setup(FT) end
    local p = FT.takeSnapshot().progress
    return p.questsCompleted, p.questsSource
  end

  it("uses C_QuestLog.GetAllCompletedQuestIDs first, sorted and unique", function()
    local done, src = snap({ C_QuestLog = {
      GetAllCompletedQuestIDs = function() return { 98581, 5, 5, 12, -1, "x" } end,
      IsQuestFlaggedCompleted = function() return true end,
    }, GetQuestsCompleted = function() return { [999] = true } end })
    assert.are.same({ 5, 12, 98581 }, done)
    assert.are.equal("c_questlog_bulk", src)
  end)

  it("falls back to legacy GetQuestsCompleted keys", function()
    local done, src = snap({ GetQuestsCompleted = function() return { [30] = true, [4] = true, [9] = false } end })
    assert.are.same({ 4, 30 }, done)
    assert.are.equal("legacy_bulk", src)
  end)

  it("erroring or non-table C_QuestLog bulk falls through to legacy, then to probe", function()
    local ql = { GetAllCompletedQuestIDs = function() error("boom") end,
      IsQuestFlaggedCompleted = function(id) return id == 100 end }
    local done, src = snap({ C_QuestLog = ql, GetQuestsCompleted = function() return { [7] = true } end })
    assert.are.same({ 7 }, done)
    assert.are.equal("legacy_bulk", src)
    ql.GetAllCompletedQuestIDs = function() return "nope" end
    done, src = snap({ C_QuestLog = ql, GetQuestsCompleted = function() error("x") end })
    assert.are.same({ 100 }, done)
    assert.are.equal("probe", src)
  end)

  it("probe path unions witnessed turn-ins, dedups and sorts", function()
    local FT = stubs.load({ C_QuestLog = {
      IsQuestFlaggedCompleted = function(id) return id == 100 or id == 17 end,
    } })
    stubs.setDB(nil)
    FT.handlers.QUEST_TURNED_IN(98581)
    FT.handlers.QUEST_TURNED_IN(100)
    local p = FT.takeSnapshot().progress
    assert.are.same({ 17, 100, 98581 }, p.questsCompleted)
    assert.are.equal("probe", p.questsSource)
  end)

  it("bulk paths do not add witnessed ids", function()
    local FT = stubs.load({ C_QuestLog = {
      GetAllCompletedQuestIDs = function() return { 5 } end,
    } })
    stubs.setDB(nil)
    FT.handlers.QUEST_TURNED_IN(98581)
    assert.are.same({ 5 }, FT.takeSnapshot().progress.questsCompleted)
  end)

  it("is unavailable when no source works", function()
    local FT = stubs.load({ C_QuestLog = stubs.NIL })
    local p = FT.takeSnapshot().progress
    assert.is_true(p.questsCompleted.unavailable)
  end)
end)
