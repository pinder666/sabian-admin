#!/bin/bash
# Phase 1 completion chain — GDELT, FIRMS, seismic, then reliability map + baselines.
# Run with: nohup bash historical/phase1_finish.sh >> historical/phase1_finish.log 2>&1 &

cd "$(dirname "$0")/.."
LOG="historical/phase1_finish.log"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] === PHASE 1 FINISH CHAIN STARTED ===" | tee -a "$LOG"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Starting GDELT (25 countries, ~150 months each)..." | tee -a "$LOG"
node historical/ingest_runner.cjs --signal gdelt >> "$LOG" 2>&1
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] GDELT done." | tee -a "$LOG"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Starting FIRMS (41 countries, 2001-present)..." | tee -a "$LOG"
node historical/ingest_runner.cjs --signal firms >> "$LOG" 2>&1
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] FIRMS done." | tee -a "$LOG"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Starting seismic (22 countries, 1970-present)..." | tee -a "$LOG"
node historical/ingest_runner.cjs --signal seismic >> "$LOG" 2>&1
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Seismic done." | tee -a "$LOG"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Building signal reliability map..." | tee -a "$LOG"
node historical/reliability_map.cjs >> "$LOG" 2>&1
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Reliability map done." | tee -a "$LOG"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Running baseline discovery..." | tee -a "$LOG"
node historical/baseline_discovery.cjs >> "$LOG" 2>&1
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Baseline discovery done." | tee -a "$LOG"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] === PHASE 1 COMPLETE ===" | tee -a "$LOG"
