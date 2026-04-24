#!/usr/bin/env bash
# Run all 5 VRTX scenarios sequentially, capturing violation patterns.
# Usage: bash vrtx/scripts/run_scenarios.sh
# Output: vrtx/scripts/scenario_results.txt

SCENARIOS=("short_sleep" "momentum" "depleted" "hrv_suppressed" "steady")
OUT="vrtx/scripts/scenario_results.txt"
ENGINE="vrtx/engine/vrtx_engine.cjs"

echo "VRTX SCENARIO SWEEP — $(date)" > "$OUT"
echo "==============================" >> "$OUT"

for SCENARIO in "${SCENARIOS[@]}"; do
  echo "" >> "$OUT"
  echo "--- SCENARIO: $SCENARIO ---" >> "$OUT"

  RAW=$(SKIP_AUDIO=1 SCENARIO="$SCENARIO" node "$ENGINE" 2>&1)
  STATUS=$?

  # Pull the lines that matter
  DAY_FRAME=$(echo "$RAW" | grep -i "day_frame\|day frame\|governing\|scene\." | head -3)
  VIOLATIONS=$(echo "$RAW" | grep -i "violation\|check\|FAIL\|WARN\|noncompliant\|isolated\|retry\|PATHWAY\|adenosine\|line10" | head -20)
  LINE10=$(echo "$RAW" | grep -i "^Sabian:" | tail -1)
  FINAL=$(echo "$RAW" | grep -i "Run complete\|output written\|vrtx_run" | head -2)

  echo "Exit: $STATUS" >> "$OUT"
  echo "" >> "$OUT"
  echo "Day frame signals:" >> "$OUT"
  echo "$DAY_FRAME" >> "$OUT"
  echo "" >> "$OUT"
  echo "Violations / checks fired:" >> "$OUT"
  echo "$VIOLATIONS" >> "$OUT"
  echo "" >> "$OUT"
  echo "Final Line 10 (last Sabian line):" >> "$OUT"
  echo "$LINE10" >> "$OUT"
  echo "" >> "$OUT"
  echo "Run complete signal:" >> "$OUT"
  echo "$FINAL" >> "$OUT"
  echo "---" >> "$OUT"

  echo "[$SCENARIO] done (exit $STATUS)"
done

echo ""
echo "Results written to $OUT"
