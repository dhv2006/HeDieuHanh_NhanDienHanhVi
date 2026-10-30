#!/usr/bin/env sh
# Chạy trên macOS / Linux:  ./start.sh   (thêm --isolate để bật WASM đa luồng)
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then exec python3 server.py "$@"
elif command -v python >/dev/null 2>&1; then exec python server.py "$@"
else echo "Không tìm thấy Python 3. macOS: cài từ python.org hoặc 'brew install python'. Linux: 'sudo apt install python3'."; exit 1
fi
