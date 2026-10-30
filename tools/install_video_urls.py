#!/usr/bin/env python3
"""Install/update the optional platform-video reader in this app's own venv."""
import json
from pathlib import Path
import os
import shutil
import subprocess
import sys
import venv

root = Path(__file__).resolve().parents[1]
environment = root / '.video-env'
print('Dang cai/cap nhat bo doc lien ket video trong .video-env...', flush=True)
venv.EnvBuilder(with_pip=True).create(environment)
python = environment / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
subprocess.run([str(python), '-m', 'pip', 'install', '--upgrade', '--pre', 'yt-dlp[default]'], check=True)
node = shutil.which('node')
(environment / 'runtime.json').write_text(json.dumps({'node': node}), encoding='utf-8')
print('Da cai xong. Khoi dong lai server.py va tai lai trang.')
if not node and not shutil.which('deno'):
    print('YouTube co the can Node.js (22+) hoac Deno. Cai Node.js tu https://nodejs.org/ neu YouTube bao loi, roi chay lai cong cu nay.')
