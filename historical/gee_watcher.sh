#!/bin/bash
LOG=/c/Users/user/Desktop/sabian.ai/sabian_core/historical/gee_fire_backfill.log
CHAIN="historical/post_backfill_chain.cjs"
ROOT=/c/Users/user/Desktop/sabian.ai/sabian_core

echo "[WATCHER] Monitoring GEE fire backfill..."
until grep -q "Ingestion complete" "$LOG" 2>/dev/null; do
  sleep 30
done

echo "[WATCHER] GEE fire backfill complete. Starting post-backfill chain..."
cd "$ROOT" && node "$CHAIN" --signal gee_fire > historical/post_backfill_chain.log 2>&1
echo "[WATCHER] Chain finished."
