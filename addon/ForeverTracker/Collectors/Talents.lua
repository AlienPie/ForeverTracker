local FT = FT
local num, try = FT.num, FT.try

-- Trait tree (current Blizzard talent window). Returns nil when unusable.
local function fromTraits()
  local ct, tr = _G.C_ClassTalents, _G.C_Traits
  if type(ct) ~= "table" or type(tr) ~= "table" then return nil end
  if type(ct.GetActiveConfigID) ~= "function" then return nil end
  local configID = try(ct.GetActiveConfigID)
  if not num(configID) then return nil end
  local info = try(tr.GetConfigInfo, configID)
  if type(info) ~= "table" or type(info.treeIDs) ~= "table" then return nil end

  local nodes, unspent = {}, 0
  for _, treeID in ipairs(info.treeIDs) do
    local nodeIDs = try(tr.GetTreeNodes, treeID)
    if type(nodeIDs) == "table" then
      for _, nodeID in ipairs(nodeIDs) do
        local node = try(tr.GetNodeInfo, configID, nodeID)
        local rank = type(node) == "table" and num(node.currentRank)
        if rank and rank > 0 then nodes[tostring(nodeID)] = rank end
      end
    end
    local currencies = try(tr.GetTreeCurrencyInfo, configID, treeID, false)
    if type(currencies) == "table" then
      for _, c in ipairs(currencies) do
        if type(c) == "table" and num(c.quantity) then unspent = unspent + c.quantity end
      end
    end
  end
  return { nodes = nodes, unspent = unspent }
end

-- Legacy tab API. Returns nil when it does not exist.
local function fromTabs()
  if type(_G.GetNumTalentTabs) ~= "function" or type(_G.GetTalentInfo) ~= "function" then
    return nil
  end
  local tabs = num(try(_G.GetNumTalentTabs))
  if not tabs then return nil end
  local nodes = {}
  for tab = 1, tabs do
    local count = type(_G.GetNumTalents) == "function" and num(try(_G.GetNumTalents, tab)) or 0
    for i = 1, count do
      local ok, _, _, _, _, rank = pcall(_G.GetTalentInfo, tab, i)
      if ok and num(rank) and rank > 0 then nodes[tab .. "." .. i] = rank end
    end
  end
  local unspent = 0
  if type(_G.UnitCharacterPoints) == "function" then
    unspent = num(try(_G.UnitCharacterPoints, "player")) or 0
  end
  return { nodes = nodes, unspent = unspent }
end

FT.register({
  key = "talents",
  section = "progress",
  run = function()
    local result = fromTraits() or fromTabs()
    if not result then error("no talent API", 0) end
    return result
  end,
})
