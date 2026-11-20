#!/usr/bin/env bash
# Análisis dinámico de NodeBB con OWASP ZAP (imagen zaproxy/zap-stable).
#   1. Baseline: spider + reglas pasivas (no ataca).
#   2. Full scan: spider + escaneo activo (envía cargas de ataque), limitado a 30 minutos.
# ZAP corre dentro de la red del contenedor de NodeBB para que http://localhost:4567 sea la app.
# Solo debe ejecutarse contra el ambiente local autorizado.
set -euo pipefail

cd "$(dirname "$0")/.."
OUT="$(pwd -W 2>/dev/null || pwd)/reportes/zap"
mkdir -p reportes/zap
NODEBB_CONTAINER="${NODEBB_CONTAINER:-nodebb-qa-sec-nodebb-1}"
TARGET="${TARGET:-http://localhost:4567}"
RUN=(docker run --rm --network "container:${NODEBB_CONTAINER}" -v "${OUT}:/zap/wrk:rw" -t zaproxy/zap-stable:latest)

export MSYS_NO_PATHCONV=1

echo "== Baseline"
"${RUN[@]}" zap-baseline.py -t "$TARGET" -m 3 -I \
  -r zap-baseline.html -J zap-baseline.json -w zap-baseline.md | tee reportes/zap/zap-baseline-consola.txt

echo "== Full scan"
"${RUN[@]}" zap-full-scan.py -t "$TARGET" -m 5 -I \
  -r zap-full.html -J zap-full.json -w zap-full.md \
  -z "-config scanner.maxScanDurationInMins=30 -config scanner.maxRuleDurationInMins=4" \
  | tee reportes/zap/zap-full-consola.txt
