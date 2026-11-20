# 製品ごとの薬価と識別コード（錠剤の刻印など）のデータ data/info.json を作る。
#
# 薬価：tools/generic_src/ の厚労省「薬価基準収載品目リスト」（内用・注射・外用。make_generic.py と同じ元データ）の
#   「薬価」と「規格」。統一名収載（一般名で1行にまとめて載る後発品）の製品は、YJ コードの先頭9桁が同じ行の薬価
#   （その9桁の行の薬価が1つにそろうときだけ）
# 識別コード：PMDA の電子添文 XML の性状の表（PropertyForBrand → IdCode）。どの製品の物かは ref → DetailBrandName の YJCode。
#   XML は make_handling.py が取ったキャッシュ（/tmp/pmda_handling_cache と /tmp/pmda_limits_cache）を使う
#
# 使い方：python3 tools/make_info.py
import glob, json, os, re, unicodedata, zipfile
import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "data", "info.json")
CACHES = ["/tmp/pmda_handling_cache", "/tmp/pmda_limits_cache"]


def nk(s):
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", str(s or "")))


def fmt_price(p):
    return f"{p:.2f}".rstrip("0").rstrip(".")


# 薬価
price = {}
by9 = {}
for f in sorted(glob.glob(os.path.join(HERE, "generic_src", "tp*_0[123]_*.xlsx"))):
    ws = openpyxl.load_workbook(f, read_only=True).worksheets[0]
    for r in list(ws.iter_rows(values_only=True))[1:]:
        if not r[1] or r[12] is None:
            continue
        yj = str(r[1]).strip()
        rec = {"p": fmt_price(float(r[12])), "s": nk(r[3])}
        price[yj] = rec
        by9.setdefault(yj[:9], set()).add((rec["p"], rec["s"]))
p9 = {k: {"p": list(v)[0][0], "s": list(v)[0][1]} for k, v in by9.items() if len(v) == 1}


def text(x):
    x = re.sub(r"<\?enter\?>", " ", x)
    x = re.sub(r"<[^>]+>", "", x)
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", x)).strip()


# 識別コード
idc = {}
seen = set()
for d in CACHES:
    for f in glob.glob(os.path.join(d, "*.zip")):
        name = os.path.basename(f)
        if name in seen:
            continue
        seen.add(name)
        try:
            z = zipfile.ZipFile(f)
            s = z.read([n for n in z.namelist() if n.endswith(".xml")][0]).decode("utf-8", "ignore")
        except Exception:
            continue
        brands = {m.group(1): m.group(2) for m in re.finditer(r'<DetailBrandName id="([^"]+)">.*?<YJCode>([0-9A-Z]{12})</YJCode>', s, re.S)}
        for m in re.finditer(r'<PropertyForBrand ref="([^"]+)">(.*?)</PropertyForBrand>', s, re.S):
            yj = brands.get(m.group(1))
            if not yj:
                continue
            codes = [text(c) for c in re.findall(r"<IdCode[^>]*>(.*?)</IdCode>", m.group(2), re.S)]
            codes = [c for c in dict.fromkeys(codes) if c and c not in ("-", "－", "なし")]
            if codes and yj not in idc:
                idc[yj] = " / ".join(codes)[:60]

out = {}
for yj in set(price) | set(idc):
    rec = {}
    if yj in price:
        rec.update(price[yj])
    if yj in idc:
        rec["i"] = idc[yj]
    out[yj] = rec
# 統一名収載の製品：一覧に無い YJ は先頭9桁で薬価を引く（識別コードだけある製品にも足す）
for yj, rec in out.items():
    if "p" not in rec and yj[:9] in p9:
        rec.update(p9[yj[:9]])
data = {
    "source": "薬価：厚生労働省「薬価基準収載品目リスト」（令和8年11月13日適用）。識別コード：PMDA 医療用医薬品の電子添文（性状）",
    "items": out,
    "p9": p9,
}
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
print("薬価", len(price), "識別コード", len(idc), "製品", len(out), "9桁", len(p9), os.path.getsize(OUT) // 1024, "KB")
