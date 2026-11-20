# 先発品・後発品（ジェネリック）・準先発品・基礎的医薬品の判定データ data/generic.json を作る。
#
# 元データ（tools/generic_src/）
#  - 厚労省「薬価基準収載品目リスト及び後発医薬品に関する情報について」（令和8年11月13日適用）
#      https://www.mhlw.go.jp/topics/2026/04/tp20260401-01.html
#      内用薬・注射薬・外用薬の一覧（tp…_01〜03）：品名・成分名・規格・「後発品」「先発品／準先発品」「同一剤形・規格の後発医薬品がある先発医薬品（○）」
#      後発医薬品に関する情報（tp…_05）：1＝後発品の無い先発品、2・☆＝後発品のある先発品、3・★＝後発品
#  - 「令和8年度薬価基準改定の概要」別添３ 基礎的医薬品対象品一覧（品名で突き合わせる）
#      https://www.mhlw.go.jp/stf/newpage_67729.html
#
# 後発品の先発品は、成分名・規格・剤形（YJコード8桁目）・投与区分が同じ先発品（準先発品を含む）。無ければ規格違い、それも無ければ剤形違いの同じ成分の先発品
# 使い方：python3 tools/make_generic.py （新しい一覧に替えるときは generic_src のファイルを置き替える）
import glob, json, os, re, unicodedata
import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "generic_src")
OUT = os.path.join(HERE, "..", "data", "generic.json")


def nk(s):
    """全角英数を半角に、空白を取る（照合用）"""
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", str(s or "")))


def rows(path):
    ws = openpyxl.load_workbook(path, read_only=True, data_only=True).worksheets[0]
    return list(ws.iter_rows(values_only=True))


items = {}  # yj → dict
for f in sorted(glob.glob(os.path.join(SRC, "tp*_0[123]_*.xlsx"))):
    for r in rows(f)[1:]:
        if not r[1]:
            continue
        yj = str(r[1]).strip()
        kind = ""
        if r[10] == "先発品":
            kind = "brand"
        elif r[10] == "準先発品":
            kind = "quasi"
        elif r[9] in ("後発品", "★"):
            kind = "generic"
        items[yj] = {"kind": kind, "ing": nk(r[2]), "spec": nk(r[3]), "name": unicodedata.normalize("NFKC", str(r[7] or "")).strip(),
                     "route": str(r[0])[:1], "sameGeneric": r[11] == "○"}

# 後発医薬品に関する情報（後発品の有無）
info = {}
for r in rows(glob.glob(os.path.join(SRC, "tp*_05_*.xlsx"))[0])[1:]:
    if r[0]:
        info[str(r[0]).strip()] = str(r[3] or "")

# 基礎的医薬品（品名で突き合わせる）
kiso_names = {}
for r in rows(glob.glob(os.path.join(SRC, "*基礎的医薬品*.xlsx"))[0])[2:]:
    if r[3]:
        kiso_names[nk(r[3])] = str(r[1] or "")
by_name = {}
for yj, it in items.items():
    by_name.setdefault(nk(it["name"]), []).append(yj)
kiso = {}
for n, cat in kiso_names.items():
    for yj in by_name.get(n, []):
        kiso[yj] = cat

# 後発品 → 先発品
def ing0(s):
    """成分名の照合用（「水和物」の有無の違いは同じとみなす）"""
    return s.replace("水和物", "")


def key(yj, it, spec=True, form=True):
    return (it["route"], ing0(it["ing"]), yj[7] if form else "", it["spec"] if spec else "")

brands_same, brands_any, brands_form = {}, {}, {}
for yj, it in items.items():
    if it["kind"] in ("brand", "quasi"):
        brands_same.setdefault(key(yj, it), []).append(yj)
        brands_any.setdefault(key(yj, it, False), []).append(yj)
        brands_form.setdefault(key(yj, it, False, False), []).append(yj)

out_items = {}
n_gen = n_gen_brand = n_gen_other = 0
for yj, it in items.items():
    k = it["kind"]
    code = info.get(yj, "")
    rec = {}
    if k in ("brand", "quasi"):
        has = it["sameGeneric"] or code in ("2", "☆")
        rec = {"k": "B" if k == "brand" else "Q", "g": 1 if has else 0}
    elif k == "generic":
        n_gen += 1
        b = brands_same.get(key(yj, it), [])
        other = 0
        if not b:
            b = brands_any.get(key(yj, it, False), [])
            other = 1 if b else 0
        if not b:
            b = brands_form.get(key(yj, it, False, False), [])
            other = 2 if b else 0
        if b:
            n_gen_brand += 1
            n_gen_other += 1 if other else 0
        rec = {"k": "G", "b": sorted(b)[:6]}
        if other:
            rec["o"] = other  # 1＝規格違い、2＝剤形違いの先発品
    if yj in kiso:
        rec["s"] = kiso[yj]
    if rec:
        out_items[yj] = rec

names = {}
for yj, rec in out_items.items():
    for b in rec.get("b", []):
        names[b] = items[b]["name"]

out = {
    "source": "厚生労働省「薬価基準収載品目リスト及び後発医薬品に関する情報」（令和8年11月13日適用）、令和8年度薬価基準改定の概要 別添３ 基礎的医薬品対象品一覧",
    "items": out_items,
    "names": names,
}
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
print("品目", len(items), "出力", len(out_items), "後発品", n_gen, "先発品が分かる", n_gen_brand, "（規格違い", n_gen_other, "）",
      "基礎的医薬品", len(kiso), "/", len(kiso_names), "→", os.path.getsize(OUT) // 1024, "KB")
