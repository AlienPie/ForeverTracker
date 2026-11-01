-- Writes the serialized snapshot for tools/addon-roundtrip.ts (run manually).
local stubs = require("stubs")
local serialize = require("serialize")

describe("round trip fixture", function()
  it("writes tests/out/snapshot.lua", function()
    local FT = stubs.load()
    stubs.setDB(nil)
    assert.is_true(FT.save())
    stubs.getDB().characters["Player-1234-0A1B2C3D"].events =
      { { t = 1729999000, kind = "levelup", data = { level = 34 } } }
    os.execute("mkdir -p tests/out")
    local f = assert(io.open("tests/out/snapshot.lua", "w"))
    f:write(serialize.saved_variables("ForeverTrackerDB", stubs.getDB()))
    f:close()
  end)
end)
