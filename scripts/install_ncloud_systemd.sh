#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${1:-$(pwd)}"
SERVICE_NAME="b2b-ncloud-api"
NODE_BIN="$(command -v node)"
NPM_BIN="$(command -v npm)"
RUN_USER="${SUDO_USER:-$(id -un)}"

if [ "$(id -u)" -ne 0 ]; then
  echo "sudo bash scripts/install_ncloud_systemd.sh $APP_DIR 로 실행하세요."
  exit 1
fi

cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=B2B Ncloud API Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${RUN_USER}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
Environment=HOST=0.0.0.0
Environment=PORT=8080
ExecStart=${NPM_BIN} run start:ncloud
Restart=always
RestartSec=5
StandardOutput=append:${APP_DIR}/ncloud-api.log
StandardError=append:${APP_DIR}/ncloud-api-error.log

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now "${SERVICE_NAME}"
systemctl --no-pager --full status "${SERVICE_NAME}" || true
curl -fsS --max-time 10 http://127.0.0.1:8080/api/system/status
printf '\n설치 완료: 부팅 후 자동 시작, 장애 시 자동 재시작됩니다.\n'
