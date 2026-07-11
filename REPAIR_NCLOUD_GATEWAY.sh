#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -f .dev.vars ]; then
  echo "오류: .dev.vars가 없습니다. 기존 운영 폴더의 .dev.vars를 이 폴더로 먼저 복사하세요."
  exit 1
fi
chmod 600 .dev.vars
npm ci
sudo bash scripts/install_ncloud_systemd.sh "$(pwd)"
sleep 3
curl -fsS http://127.0.0.1:8080/api/system/status
printf '\nV193 Ncloud 고정 IP 게이트웨이 적용 완료\n'
