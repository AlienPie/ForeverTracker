local FT = FT
local num = FT.num

-- Reads the persistent per-character state kept by Events.lua. Pure read: it
-- never writes. visited is an array sorted by firstSeen then key; taxi is an
-- array of node ids and is omitted when none are recorded.
FT.register({
  key = "exploration",
  run = function()
    local cmap = _G.C_Map
    if type(cmap) ~= "table" or type(cmap.GetBestMapForUnit) ~= "function" then
      error("C_Map unavailable", 0)
    end
    local rec = FT.getCharacter and FT.getCharacter(false)
    local visited, keys = {}, {}
    if rec and type(rec.visited) == "table" then
      for k, v in pairs(rec.visited) do
        if type(v) == "table" and num(v.mapId) and type(v.subzone) == "string" then
          keys[#keys + 1] = { key = tostring(k), v = v }
        end
      end
    end
    table.sort(keys, function(a, b)
      local fa, fb = num(a.v.firstSeen) or 0, num(b.v.firstSeen) or 0
      if fa ~= fb then return fa < fb end
      return a.key < b.key
    end)
    for i, e in ipairs(keys) do
      visited[i] = { mapId = e.v.mapId, subzone = e.v.subzone, firstSeen = num(e.v.firstSeen) or 0 }
    end
    local out = { visited = visited }
    if rec and type(rec.taxi) == "table" and #rec.taxi > 0 then
      local taxi = {}
      for i, id in ipairs(rec.taxi) do taxi[i] = id end
      out.taxi = taxi
    end
    return out
  end,
})
