#!/bin/sh
# Runs the addon specs under LuaJIT (Lua 5.1 semantics, like the WoW client).
cd "$(dirname "$0")" && exec busted --lua=luajit "$@"
