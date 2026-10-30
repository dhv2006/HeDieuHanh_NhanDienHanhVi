#!/usr/bin/env python3
"""
tools/download_offline.py — Tải thư viện & mô hình về máy để chạy KHÔNG CẦN MẠNG.

Sau khi chạy, thư mục dự án có thêm:
  vendor/  tf.min.js, các backend WASM/WebGPU, pose-detection, coco-ssd, file .wasm
  models/  movenet-multipose.json/.bin, movenet-thunder.json/.bin, coco-ssd/*
  vendor/manifest.json  — ứng dụng đọc file này để ưu tiên bản offline

Dùng:  python tools/download_offline.py        (chỉ dùng thư viện chuẩn Python)
"""
import json
import os
import sys
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VENDOR = os.path.join(ROOT, "vendor")
MODELS = os.path.join(ROOT, "models")
CDN = "https://cdn.jsdelivr.net/npm/"
TF = "4.22.0"

LIBS = {
    "tf.min.js": f"{CDN}@tensorflow/tfjs@{TF}/dist/tf.min.js",
    "tf-backend-wasm.min.js": f"{CDN}@tensorflow/tfjs-backend-wasm@{TF}/dist/tf-backend-wasm.min.js",
    "tf-backend-webgpu.min.js": f"{CDN}@tensorflow/tfjs-backend-webgpu@{TF}/dist/tf-backend-webgpu.min.js",
    "pose-detection.min.js": f"{CDN}@tensorflow-models/pose-detection@2.1.3/dist/pose-detection.min.js",
    "coco-ssd.min.js": f"{CDN}@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js",
    "tfjs-backend-wasm.wasm": f"{CDN}@tensorflow/tfjs-backend-wasm@{TF}/dist/tfjs-backend-wasm.wasm",
    "tfjs-backend-wasm-simd.wasm": f"{CDN}@tensorflow/tfjs-backend-wasm@{TF}/dist/tfjs-backend-wasm-simd.wasm",
    "tfjs-backend-wasm-threaded-simd.wasm": f"{CDN}@tensorflow/tfjs-backend-wasm@{TF}/dist/tfjs-backend-wasm-threaded-simd.wasm",
}

# Gói npm human-models (~173 MB) vượt giới hạn 150 MB của jsDelivr → 403.
# Lấy thẳng từ GitHub (không cần CORS vì đây là Python).
MIRROR = "https://raw.githubusercontent.com/vladmandic/human-models/main/models/"
GRAPH_MODELS = {
    # tên file đích (trong models/)      : URL model.json
    "movenet-multipose.json": MIRROR + "movenet-multipose.json",
    "movenet-thunder.json": MIRROR + "movenet-thunder.json",
    "coco-ssd/model.json": "https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2/model.json",
    # Khuôn mặt: dò mặt, biểu cảm, nhận dạng (+ tuổi/giới tính)
    "blazeface.json": MIRROR + "blazeface.json",
    "emotion.json": MIRROR + "emotion.json",
    "faceres.json": MIRROR + "faceres.json",
}


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "behavior-analysis-offline/2.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read(), r.geturl()


def save(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)


def human(n):
    return f"{n / 1048576:.1f} MB" if n > 1048576 else f"{n / 1024:.0f} KB"


def main():
    manifest = {"libs": [], "models": []}
    ok = True

    print("== Thư viện ==")
    for name, url in LIBS.items():
        try:
            data, _ = fetch(url)
            save(os.path.join(VENDOR, name), data)
            manifest["libs"].append(name)
            print(f"  ✓ {name} ({human(len(data))})")
        except Exception as e:  # noqa: BLE001
            ok = False
            print(f"  ✗ {name}: {e}")

    print("== Mô hình ==")
    for target, url in GRAPH_MODELS.items():
        try:
            data, final_url = fetch(url)
            model = json.loads(data)
            out_dir = os.path.dirname(os.path.join(MODELS, target))
            total = 0
            for group in model.get("weightsManifest", []):
                for rel in group["paths"]:
                    shard, _ = fetch(urllib.parse.urljoin(final_url, rel))
                    save(os.path.join(out_dir, rel), shard)
                    total += len(shard)
            save(os.path.join(MODELS, target), data)
            manifest["models"].append(target)
            print(f"  ✓ {target} ({human(total)})")
        except Exception as e:  # noqa: BLE001
            ok = False
            print(f"  ✗ {target}: {e}")

    save(os.path.join(VENDOR, "manifest.json"), json.dumps(manifest, indent=2).encode())
    print("\nĐã ghi vendor/manifest.json.", "Hoàn tất!" if ok else "Một số file lỗi — ứng dụng sẽ tự dùng CDN cho phần thiếu.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
