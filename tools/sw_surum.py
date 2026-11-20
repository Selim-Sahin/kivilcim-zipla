"""sw.js'teki VERSION'u oyun dosyalarının içerik özetine göre günceller.

Oyunda bir dosyayı değiştirdikten sonra, commit'ten ÖNCE proje kökünde çalıştır:
    python tools/sw_surum.py
Böylece telefonlardaki önbellek yeni sürümü tanır ve kendini yeniler.
ASSETS listesi ile diskteki dosyalar uyuşmazsa hata verir (çıkış kodu 1).
"""
import glob
import hashlib
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

src = open("sw.js", encoding="utf-8").read()
block = src.split("const ASSETS", 1)[1].split("];", 1)[0]
files = [a for a in re.findall(r"'\./([^']*)'", block) if a]  # './' → index.html zaten listede

missing = [f for f in files if not os.path.isfile(f)]
needed = sorted({f.replace(os.sep, "/") for pat in ("src/*.js", "vendor/**/*.js", "icons/*")
                 for f in glob.glob(pat, recursive=True)})
unlisted = [f for f in needed if f not in files]
if missing or unlisted:
    if missing:
        print("HATA: sw.js ASSETS içinde olup diskte olmayan dosyalar:", ", ".join(missing))
    if unlisted:
        print("HATA: önbelleğe alınmayan dosyalar (sw.js ASSETS listesine ekle):", ", ".join(unlisted))
    sys.exit(1)

VERSION_RE = r"const VERSION = '[^']*';"
h = hashlib.sha256()
for f in sorted(files):
    # Satır sonu farkı (Windows CRLF / LF) sürümü değiştirmesin
    h.update(f.encode() + b"\0" + open(f, "rb").read().replace(b"\r\n", b"\n"))
h.update(re.sub(VERSION_RE, "", src).replace("\r\n", "\n").encode())
version = "v-" + h.hexdigest()[:10]

new = re.sub(VERSION_RE, f"const VERSION = '{version}';", src, count=1)
if new != src:
    with open("sw.js", "w", encoding="utf-8", newline="") as fh:
        fh.write(new)
    print("sw.js VERSION ->", version)
else:
    print("sw.js VERSION değişmedi:", version)
