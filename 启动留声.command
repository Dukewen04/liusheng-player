#!/bin/zsh
cd -- "$(dirname -- "$0")" || exit 1
if curl --max-time 2 -fsS http://127.0.0.1:8766/api/health >/dev/null 2>&1; then
  open http://127.0.0.1:8766/
  exit 0
fi
nohup /usr/bin/env python3 server.py </dev/null >/tmp/liusheng-player.log 2>&1 &
open http://127.0.0.1:8766/
