-- Minimal Lua table writer producing SavedVariables-style text.
local M = {}

local function key_text(k)
  if type(k) == "string" then return string.format("[%q]", k) end
  return "[" .. tostring(k) .. "]"
end

local function value_text(v, indent)
  local t = type(v)
  if t == "string" then return string.format("%q", v):gsub("\\\n", "\\n") end
  if t == "number" then return string.format("%.14g", v) end
  if t == "boolean" then return tostring(v) end
  if t ~= "table" then error("cannot serialize " .. t) end
  local keys = {}
  for k in pairs(v) do keys[#keys + 1] = k end
  table.sort(keys, function(a, b)
    if type(a) == type(b) then return a < b end
    return type(a) == "number"
  end)
  local pad = string.rep("  ", indent + 1)
  local out = {}
  for _, k in ipairs(keys) do
    out[#out + 1] = pad .. key_text(k) .. " = " .. value_text(v[k], indent + 1)
  end
  if #out == 0 then return "{}" end
  return "{\n" .. table.concat(out, ",\n") .. ",\n" .. string.rep("  ", indent) .. "}"
end

function M.saved_variables(name, tbl)
  return name .. " = " .. value_text(tbl, 0) .. "\n"
end

return M
