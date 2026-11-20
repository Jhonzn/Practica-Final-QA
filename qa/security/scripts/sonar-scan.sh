#!/usr/bin/env bash
# Análisis estático de nodebb/NodeBB con sonar-scanner (Docker) contra el SonarQube local.
#
# Requisitos: SonarQube arriba (docker compose up -d sonarqube, en qa/security), el proyecto
# "nodebb" creado y un token de análisis en la variable SONAR_TOKEN.
#   export SONAR_TOKEN=squ_xxx
#   bash qa/security/scripts/sonar-scan.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
: "${SONAR_TOKEN:?Definir SONAR_TOKEN con un token de análisis de SonarQube}"
SONAR_HOST="${SONAR_HOST:-http://host.docker.internal:9000}"

# MSYS_NO_PATHCONV evita que Git Bash en Windows reescriba las rutas del contenedor.
MSYS_NO_PATHCONV=1 docker run --rm \
  -e SONAR_HOST_URL="$SONAR_HOST" \
  -e SONAR_TOKEN="$SONAR_TOKEN" \
  -v "$REPO_ROOT:/usr/src" \
  sonarsource/sonar-scanner-cli:latest \
  -Dproject.settings=/usr/src/qa/security/sonarqube/sonar-project.properties \
  -Dsonar.projectBaseDir=/usr/src/nodebb/NodeBB \
  -Dsonar.working.directory=/tmp/scannerwork \
  -Dsonar.scm.disabled=true
