-- Writes the serialized snapshot for tools/addon-roundtrip.ts (run manually).
local stubs = require("stubs")
local serialize = require("serialize")

describe("round trip fixture", function()
  it("writes tests/out/snapshot.lua", function()
    local FT = stubs.load()
    stubs.setDB(nil)
    -- Populate events, visited places and taxi nodes through the real handlers.
    FT.handlers.PLAYER_LEVEL_UP(34)
    FT.handlers.ZONE_CHANGED()
    FT.handlers.TAXIMAP_OPENED()
    assert.is_true(FT.save())
    local rec = stubs.getDB().characters["Player-1234-0A1B2C3D"]
    assert.are.equal("level_up", rec.events[1].kind)
    assert.is_table(rec.visited["1434:Booty Bay"])
    assert.are.same({ 3, 12 }, rec.taxi)
    assert.are.equal(1, #rec.snapshot.exploration.visited)
    os.execute("mkdir -p tests/out")
    local f = assert(io.open("tests/out/snapshot.lua", "w"))
    f:write(serialize.saved_variables("ForeverTrackerDB", stubs.getDB()))
    f:close()
  end)
end)
