#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
npm install
sudo bash scripts/install_ncloud_systemd.sh "$(pwd)"
echo "외부 확인: curl http://101.79.27.234.sslip.io:8080/api/system/status"
