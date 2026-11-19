# OTC類似薬（要指導医薬品又は一般用医薬品との代替性が特に高い医療用医薬品）の判定データ data/otc.json を作る。
#
# 元データ
#  - 厚労省「ＯＴＣ類似薬の一部保険外療養」の対象医薬品リスト等（tools/otc_src/ の3つの xlsx。令和8年11月公表、令和9年3月1日施行）
#      https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/iryouhoken/juuyou/otc.html
#  - MEDIS-DC「医薬品HOTコードマスター（販売包装単位コード付版）」：箱のGS1コード（販売包装単位）→ YJコード、販売名
#      https://www2.medis.or.jp/hcode/  （引数で MEDISyyyymmdd_h.txt を渡す。無ければダウンロードする）
#
#  - 厚労省「後発医薬品のある先発医薬品（長期収載品）の選定療養について」の対象医薬品リスト（tools/sentei_src/ の xlsx）
#      https://www.mhlw.go.jp/stf/newpage_39830.html
#
# PTPシート（調剤包装単位）のGS1コードはHOTマスターに無いので、アプリが PMDA に問い合わせて YJコードを得る。
# 使い方：python3 tools/make_otc.py [MEDISyyyymmdd_h.txt]
import csv, io, json, os, re, sys, urllib.request, zipfile
import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "otc_src")
OUT = os.path.join(HERE, "..", "data", "otc.json")

def z2h(s):
    """全角英数を半角に（品名の「錠６０ｍｇ」→「錠60mg」）"""
    if s is None:
        return ""
    s = str(s)
    return s.translate({c: c - 0xFEE0 for c in range(0xFF01, 0xFF5F)}).replace("　", " ").strip()

def sheet_rows(path, name=None):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[name] if name else wb.worksheets[0]
    return list(ws.iter_rows(values_only=True))

def find(pattern):
    for f in os.listdir(SRC):
        if pattern in f:
            return os.path.join(SRC, f)
    raise SystemExit("見つかりません: " + pattern)

# ---- 対象医薬品リスト（別添１）----
targets = {}
for r in sheet_rows(find("対象医薬品"))[1:]:
    if not r[1]:
        continue
    yj = str(r[1]).strip()
    price, quarter, base = r[6], r[7], r[8]
    targets[yj] = {
        "name": z2h(r[2]), "ingredient": z2h(r[3]), "spec": z2h(r[4]), "maker": z2h(r[5]),
        "price": round(float(price), 2), "quarter": round(float(quarter), 2), "base": round(float(base), 2),
    }

# ---- 特別の料金の対象外となる効能・効果（別添２）。品目ごと。続きの行は品目の欄が空 ----
effects = {}
cur = None
for r in sheet_rows(find("効能効果"), "効能・効果リスト")[1:]:
    if r[1]:
        cur = str(r[1]).strip()
    if cur and r[4]:
        effects.setdefault(cur, []).append(z2h(r[4]))

# ---- 特別の料金の対象外となる傷病名の例（別添２）。成分ごと ----
diseases = {}
for r in sheet_rows(find("効能効果"), "傷病名リスト")[1:]:
    if r[0] and r[1]:
        diseases.setdefault(z2h(r[0]), []).append(z2h(r[1]))

# ---- 妊婦等（別添３）----
def yjs(sheet):
    return sorted({str(r[1]).strip() for r in sheet_rows(find("妊婦"), sheet)[1:] if r[1] and re.match(r"^\d{7}\w{5}$", str(r[1]).strip())})
pregnant = yjs("妊婦・妊娠の可能性がある者")
lactating = yjs("授乳婦")

# ---- 長期収載品の選定療養の対象医薬品リスト ----
SENTEI = os.path.join(HERE, "sentei_src")
sentei_file = [f for f in os.listdir(SENTEI) if f.endswith(".xlsx")]
if len(sentei_file) != 1:
    raise SystemExit("tools/sentei_src に xlsx を1つだけ置いてください")
sentei = {}
for r in sheet_rows(os.path.join(SENTEI, sentei_file[0]))[1:]:
    if not r[0]:
        continue
    sentei[str(r[0]).strip()] = {
        "name": z2h(r[1]), "ingredient": z2h(r[2]), "spec": z2h(r[3]), "maker": z2h(r[4]),
        "price": round(float(r[5]), 2), "generic": round(float(r[6]), 2),
        "half": round(float(r[7]), 2), "base": round(float(r[8]), 2),
    }

# ---- HOTコードマスター：箱のGS1コード → YJ、YJ → 販売名 ----
if len(sys.argv) > 1:
    hot_text = open(sys.argv[1], encoding="cp932").read()
    hot_name = os.path.basename(sys.argv[1])
else:
    page = urllib.request.urlopen("https://www2.medis.or.jp/hcode/").read().decode("cp932", "ignore")
    url = re.search(r"https://www2\.medis\.or\.jp/hcode/moto_data/h\d{8}_h\.zip", page).group(0)
    z = zipfile.ZipFile(io.BytesIO(urllib.request.urlopen(url).read()))
    n = [x for x in z.namelist() if re.search(r"MEDIS\d{8}_h\.txt$", x, re.I)][0]
    hot_text = z.read(n).decode("cp932")
    hot_name = os.path.basename(n)
hot_date = re.search(r"(\d{8})", hot_name).group(1)
rows = list(csv.reader(io.StringIO(hot_text)))
h = rows[0]
iY, iG, iN = h.index("個別医薬品コード"), h.index("販売包装単位コード"), h.index("販売名")
names, box = {}, {}
for r in rows[1:]:
    yj = r[iY].strip()
    if not yj:
        continue
    names.setdefault(yj, z2h(r[iN]))
    g = r[iG].strip()
    if re.fullmatch(r"\d{14}", g):
        box[g] = yj
for yj, t in list(targets.items()) + list(sentei.items()):
    names.setdefault(yj, t["name"])

out = {
    "source": "厚生労働省「ＯＴＣ類似薬の一部保険外療養」対象医薬品リスト等（令和8年11月公表・令和9年3月1日施行）",
    "hot": "MEDIS-DC 医薬品HOTコードマスター %s年%s月%s日版" % (hot_date[:4], int(hot_date[4:6]), int(hot_date[6:])),
    "targets": targets,
    "effects": effects,
    "diseases": diseases,
    "pregnant": pregnant,
    "lactating": lactating,
    "senteiSource": "厚生労働省「長期収載品の処方等又は調剤に係る選定療養の対象医薬品リスト」（令和8年6月1日から・令和8年3月31日更新）",
    "sentei": sentei,
    "names": names,
    "box": box,
}
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
print("対象", len(targets), "効能", len(effects), "傷病名の成分", len(diseases), "妊婦", len(pregnant), "授乳婦", len(lactating),
      "選定療養", len(sentei), "販売名", len(names), "箱のコード", len(box), "→", os.path.getsize(OUT) // 1024, "KB")
