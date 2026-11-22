# 先発品と効能効果・用法用量に違いのある後発品（ジェネリック）のデータ data/gediff.json を作る。
#
# 元：日本ジェネリック製薬協会「効能効果、用法用量等に違いのある後発医薬品リスト」（Excel）
#     https://www.jga.gr.jp/medical/confirm-effective.html （更新のたびにファイル名が変わる。このページから最新の .xlsx を探す）
#   Ⅰ．先発品のみ特定の効能、用法を有する医薬品リスト／Ⅱ．先発品及び一部後発品が特定の効能、用法を有する医薬品リスト
#   列：有効成分名・違いのある効能効果等（①②…）・規格・後発品（「後発」）・販売名・会社名・効能の有無（①②／―）
# 販売名は data/otc.json の names（HOTコードマスター）と突き合わせて YJ にする（空白・記号・全角半角を無視）。
#
# 出力：{"source", "date", "groups": [{"n": 有効成分名, "d": 違いのある効能効果等, "s": 1|2, "p": [{"n": 販売名, "c": 会社名, "g": 1（後発）, "a": 効能の有無, "y": [YJ…], "k": 規格}]}]}
# 使い方：python3 tools/make_gediff.py（jga.gr.jp から取る）／ python3 tools/make_gediff.py ファイル.xlsx
import io, json, os, re, sys, unicodedata, urllib.request
import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "data", "gediff.json")
PAGE = "https://www.jga.gr.jp/medical/confirm-effective.html"
UA = {"User-Agent": "PharmaCalc/1.0"}


def key(s):
    s = unicodedata.normalize("NFKC", str(s or ""))
    s = s.replace("®", "").lstrip("*＊ ")
    return re.sub(r"[\s・･\-‐－―/／()（）「」『』.,，、]", "", s).upper()


if len(sys.argv) > 1:
    data = open(sys.argv[1], "rb").read()
    date = re.search(r"(\d{6})", os.path.basename(sys.argv[1]))
    date = date.group(1) if date else ""
else:
    html = urllib.request.urlopen(urllib.request.Request(PAGE, headers=UA), timeout=60).read().decode("utf-8", "ignore")
    path = sorted(re.findall(r'href="(/\d{4}/\d{2}/\d{2}/(\d{6})_effectiveness\.xlsx)"', html), key=lambda x: x[1])[-1]
    data = urllib.request.urlopen(urllib.request.Request("https://www.jga.gr.jp" + path[0], headers=UA), timeout=120).read()
    date = path[1]
date = f"20{date[:2]}-{date[2:4]}-{date[4:6]}" if len(date) == 6 else ""

names = json.load(open(os.path.join(HERE, "..", "data", "otc.json"), encoding="utf-8"))["names"]
by = {}
for yj, n in names.items():
    by.setdefault(key(n), []).append(yj)

ws = openpyxl.load_workbook(io.BytesIO(data), read_only=True).worksheets[0]
groups, cur, sec, spec = [], None, 0, ""
miss = []
for r in ws.iter_rows(values_only=True):
    r = list(r) + [None] * 10
    c1 = str(r[1] or "").strip()
    if c1.startswith("Ⅰ"):
        sec = 1
        continue
    if c1.startswith("Ⅱ"):
        sec = 2
        continue
    if not sec or c1 == "有効成分名":
        continue
    name = str(r[5] or "").strip()
    if c1:
        cur = {"n": c1, "d": str(r[2] or "").strip(), "s": sec, "p": []}
        groups.append(cur)
    if r[3]:
        spec = str(r[3]).strip()
    if not name or cur is None:
        continue
    a = str(r[7] or "").strip().replace(" ", "")
    p = {"n": name.lstrip("*＊ "), "c": str(r[6] or "").strip(), "a": a or "―", "k": spec}
    if str(r[4] or "").startswith("後発"):
        p["g"] = 1
    if name.startswith(("*", "＊")):
        p["x"] = 1  # 経過措置品目
    y = by.get(key(name))
    if y:
        p["y"] = y
    else:
        miss.append(name)
    cur["p"].append(p)
groups = [g for g in groups if g["p"]]
out = {"source": "日本ジェネリック製薬協会「効能効果、用法用量等に違いのある後発医薬品リスト」", "date": date, "groups": groups}
json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
n = sum(len(g["p"]) for g in groups)
print("成分", len(groups), "製品", n, "YJ なし", len(miss), "（例：", miss[:8], "）", os.path.getsize(OUT) // 1024, "KB")
