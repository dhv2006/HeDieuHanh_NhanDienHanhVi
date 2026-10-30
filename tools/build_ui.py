"""Build the shipped UI bundle. Windows helper; no build tool needed to run app.

The compiler comes from the official npm package, verified with its published
SHA-512 integrity. Only the compiler executable is extracted, never tar paths.
"""
import argparse
import base64
import hashlib
import io
import json
import re
from pathlib import Path
import subprocess
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
VERSION = '0.25.12'
COMPILER = ROOT / 'tools' / 'build-runtime' / 'esbuild.exe'


def install():
    url = 'https://registry.npmjs.org/@esbuild/win32-x64/' + VERSION
    with urllib.request.urlopen(url, timeout=30) as response:
        dist = json.load(response)['dist']
    if not dist['tarball'].startswith('https://registry.npmjs.org/'):
        raise ValueError('Unexpected compiler registry')
    with urllib.request.urlopen(dist['tarball'], timeout=120) as response:
        data = response.read(16 * 1024 * 1024)
    digest = 'sha512-' + base64.b64encode(hashlib.sha512(data).digest()).decode()
    if digest != dist['integrity']:
        raise ValueError('Compiler integrity mismatch')
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
        member = archive.getmember('package/esbuild.exe')
        if not member.isfile() or member.size > 32 * 1024 * 1024:
            raise ValueError('Invalid compiler executable')
        executable = archive.extractfile(member).read()
    COMPILER.parent.mkdir(parents=True, exist_ok=True)
    COMPILER.write_bytes(executable)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--install', action='store_true')
    args = parser.parse_args()
    if args.install:
        install()
    if not COMPILER.is_file():
        raise SystemExit('Run python tools/build_ui.py --install once, or use esbuild CLI.')
    subprocess.run([str(COMPILER), 'js/bundle-entry.js', '--bundle', '--format=esm',
                    '--platform=browser', '--target=es2020', '--charset=utf8',
                    '--outfile=js/app.bundle.js'], cwd=ROOT, check=True)
    # Keep first paint independent of a separate stylesheet request. The CSS
    # source stays editable and is embedded again on every build.
    index = ROOT / 'index.html'
    html = index.read_text(encoding='utf-8')
    css = (ROOT / 'css/style.css').read_text(encoding='utf-8')
    block = '<!-- app-styles:start -->\n<style>\n' + css + '\n</style>\n<!-- app-styles:end -->'
    if '<!-- app-styles:start -->' in html:
        html = re.sub(r'<!-- app-styles:start -->.*?<!-- app-styles:end -->', lambda _:block, html, flags=re.S)
    else:
        html = re.sub(r'<link[^>]+href="css/style.css"[^>]*>', lambda _:block, html)
    release = re.search(r"APP_VERSION = '([^']+)'", (ROOT/'js/config.js').read_text(encoding='utf-8'))[1]
    html = re.sub(r'(data-entry="\./js/app.bundle.js\?v=)[^"]+', lambda m:m[1]+release, html)
    index.write_text(html, encoding='utf-8')
