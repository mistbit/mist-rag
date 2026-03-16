#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"
API_DIR="$ROOT_DIR/services/api"
API_VENV="$API_DIR/.venv"
API_PID_FILE="$RUN_DIR/api.pid"
WEB_PID_FILE="$RUN_DIR/web.pid"
API_LOG_FILE="$RUN_DIR/api.log"
WEB_LOG_FILE="$RUN_DIR/web.log"
API_URL="http://127.0.0.1:8000"
WEB_URL="http://127.0.0.1:5173"
COMMAND="${1:-status}"

mkdir -p "$RUN_DIR"

is_running() {
  local pid="$1"
  kill -0 "$pid" 2>/dev/null
}

read_pid() {
  local pid_file="$1"
  if [[ -f "$pid_file" ]]; then
    tr -d '[:space:]' <"$pid_file"
  fi
}

cleanup_stale_pid() {
  local pid_file="$1"
  local pid
  pid="$(read_pid "$pid_file")"

  if [[ -n "${pid:-}" ]] && ! is_running "$pid"; then
    rm -f "$pid_file"
  fi
}

ensure_node_modules() {
  if [[ ! -d "$ROOT_DIR/node_modules" ]]; then
    echo "Installing workspace dependencies..."
    (cd "$ROOT_DIR" && pnpm install)
  fi
}

ensure_api_env() {
  if [[ ! -x "$API_VENV/bin/python" ]]; then
    echo "Creating API virtualenv..."
    python3 -m venv "$API_VENV"
  fi

  if ! "$API_VENV/bin/python" -c "import fastapi, uvicorn" >/dev/null 2>&1; then
    echo "Installing API dependencies..."
    "$API_VENV/bin/pip" install -e "$API_DIR"
  fi
}

spawn_detached() {
  local cwd="$1"
  local log_file="$2"
  local pid_file="$3"
  shift 3

  local pid
  pid="$(
    python3 - "$cwd" "$log_file" "$@" <<'PY'
import os
import subprocess
import sys

cwd = sys.argv[1]
log_file = sys.argv[2]
cmd = sys.argv[3:]
env = os.environ.copy()

with open(log_file, "ab", buffering=0) as log:
    process = subprocess.Popen(
        cmd,
        cwd=cwd,
        env=env,
        stdin=subprocess.DEVNULL,
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )

print(process.pid)
PY
  )"

  echo "$pid" >"$pid_file"
}

wait_for_url() {
  local url="$1"
  local label="$2"

  for _ in {1..15}; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  echo "$label did not become ready in time"
  return 1
}

start_api() {
  cleanup_stale_pid "$API_PID_FILE"
  local pid
  pid="$(read_pid "$API_PID_FILE")"

  if [[ -n "${pid:-}" ]] && is_running "$pid"; then
    echo "API already running (pid $pid)"
    return
  fi

  ensure_api_env
  echo "Starting API on $API_URL"
  spawn_detached \
    "$API_DIR" \
    "$API_LOG_FILE" \
    "$API_PID_FILE" \
    "$API_VENV/bin/python" \
    -m \
    uvicorn \
    app.main:app \
    --reload \
    --host \
    127.0.0.1 \
    --port \
    8000

  pid="$(read_pid "$API_PID_FILE")"
  if [[ -z "${pid:-}" ]] || ! is_running "$pid"; then
    echo "API failed to start. Check $API_LOG_FILE"
    exit 1
  fi

  wait_for_url "$API_URL/healthz" "API" || {
    echo "Check $API_LOG_FILE"
    exit 1
  }
}

start_web() {
  cleanup_stale_pid "$WEB_PID_FILE"
  local pid
  pid="$(read_pid "$WEB_PID_FILE")"

  if [[ -n "${pid:-}" ]] && is_running "$pid"; then
    echo "Web already running (pid $pid)"
    return
  fi

  ensure_node_modules
  echo "Starting Web on $WEB_URL"
  VITE_API_BASE_URL="$API_URL" spawn_detached \
    "$ROOT_DIR" \
    "$WEB_LOG_FILE" \
    "$WEB_PID_FILE" \
    pnpm \
    --filter \
    @mist-rag/web \
    exec \
    vite \
    --host \
    127.0.0.1

  pid="$(read_pid "$WEB_PID_FILE")"
  if [[ -z "${pid:-}" ]] || ! is_running "$pid"; then
    echo "Web failed to start. Check $WEB_LOG_FILE"
    exit 1
  fi

  wait_for_url "$WEB_URL" "Web" || {
    echo "Check $WEB_LOG_FILE"
    exit 1
  }
}

stop_service() {
  local name="$1"
  local pid_file="$2"
  local pid
  pid="$(read_pid "$pid_file")"

  if [[ -z "${pid:-}" ]]; then
    echo "$name is not running"
    return
  fi

  if ! is_running "$pid"; then
    echo "$name has a stale pid file; cleaning up"
    rm -f "$pid_file"
    return
  fi

  echo "Stopping $name (pid $pid)"
  kill "$pid"

  for _ in {1..10}; do
    if ! is_running "$pid"; then
      rm -f "$pid_file"
      echo "$name stopped"
      return
    fi
    sleep 1
  done

  echo "$name did not stop gracefully; sending SIGKILL"
  kill -9 "$pid"
  rm -f "$pid_file"
}

print_status() {
  cleanup_stale_pid "$API_PID_FILE"
  cleanup_stale_pid "$WEB_PID_FILE"

  local api_pid web_pid
  api_pid="$(read_pid "$API_PID_FILE")"
  web_pid="$(read_pid "$WEB_PID_FILE")"

  if [[ -n "${api_pid:-}" ]] && is_running "$api_pid"; then
    echo "API: running (pid $api_pid) -> $API_URL"
  else
    echo "API: stopped"
  fi

  if [[ -n "${web_pid:-}" ]] && is_running "$web_pid"; then
    echo "Web: running (pid $web_pid) -> $WEB_URL"
  else
    echo "Web: stopped"
  fi

  echo "Logs: $RUN_DIR"
}

print_logs() {
  if [[ -f "$API_LOG_FILE" ]]; then
    echo "=== API log ==="
    tail -n 20 "$API_LOG_FILE"
  else
    echo "=== API log ==="
    echo "No API log yet"
  fi

  if [[ -f "$WEB_LOG_FILE" ]]; then
    echo "=== Web log ==="
    tail -n 20 "$WEB_LOG_FILE"
  else
    echo "=== Web log ==="
    echo "No Web log yet"
  fi
}

case "$COMMAND" in
  start)
    start_api
    start_web
    print_status
    ;;
  stop)
    stop_service "Web" "$WEB_PID_FILE"
    stop_service "API" "$API_PID_FILE"
    ;;
  restart)
    stop_service "Web" "$WEB_PID_FILE"
    stop_service "API" "$API_PID_FILE"
    start_api
    start_web
    print_status
    ;;
  status)
    print_status
    ;;
  logs)
    print_logs
    ;;
  *)
    echo "Usage: bash scripts/dev-stack.sh {start|stop|restart|status|logs}"
    exit 1
    ;;
esac
