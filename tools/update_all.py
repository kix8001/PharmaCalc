# 全データの更新（毎月1日の自動更新と、手動の更新で使う）。
#
# 使い方：python3 tools/update_all.py [--keep-cache] [--skip-renal] [--from 手順名]
#   ・最新の元データを取り直し、data/*.json・web/public/label/ をすべて作り直す。全部で3〜5時間（PMDA に1秒1回ほどで問い合わせるため）。
#   ・途中で止まっても、もう一度実行すると終わった手順は飛ばして続きから進む（/tmp/update_all_state.json）。
#     最初からやり直すときは /tmp/update_all_state.json を消す。
#   ・--keep-cache：PMDA などのキャッシュ（/tmp/pmda_*）を消さずに使う（試しに流すとき用。ふだんは消して取り直す）
#   ・--skip-renal：腎機能で注意する薬（1〜2時間）を作り直さない
#   ・最後に data/updated.json（アプリの「情報」の「データ更新日」）を今日の日付にし、
#     目で確かめる物（新しく無字とされた錠剤、識別コードが画像だけの新しい製品）を /tmp/update_review/ に絵で出す。
#
# 自動で取り直す元データ
#   ・PMDA の電子添文 XML・GeneralList・インタビューフォーム（make_handling・make_limits・make_if・make_label・fetch_renal_all）
#   ・厚労省「薬価基準収載品目リスト及び後発医薬品に関する情報」（generic_src/tp*.xlsx。新しい適用日の物があれば置き替える）
#   ・診療報酬情報提供サービスの医薬品マスター（generic_src/y_*.zip）
#   ・MEDIS の HOTコードマスター（make_otc.py がその場で取る）
#   ・中医協の新医薬品の資料（make_newdrug.py）
#   ・日本ジェネリック製薬協会の「効能効果、用法用量等に違いのある後発医薬品リスト」（make_gediff.py）
#   ・AG（make_if.py が IF の「オーソライズド・ジェネリック」の記載から data/ag.json を作る）
# 手で置き替える元データ（変わったときだけ）：OTC類似薬のリスト（otc_src）、選定療養のリスト（sentei_src）、
#   基礎的医薬品（generic_src/*基礎的医薬品*）、RMP資材（rmp_src。ユーザーから新しい HTML ブロックをもらう）
import datetime, glob, io, json, os, re, shutil, subprocess, sys, urllib.request, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(HERE, "generic_src")
STATE = "/tmp/update_all_state.json"
REVIEW = "/tmp/update_review"
CACHES = ["/tmp/pmda_handling_cache", "/tmp/pmda_limits_cache", "/tmp/pmda_if_cache", "/tmp/pmda_renal_cache", "/tmp/mhlw_newdrug_cache"]
UA = {"User-Agent": "PharmaCalc/1.0"}
JST = datetime.timezone(datetime.timedelta(hours=9))

args = sys.argv[1:]
state = json.load(open(STATE)) if os.path.exists(STATE) else {"done": []}


def log(*a):
    print(datetime.datetime.now(JST).strftime("%H:%M:%S"), *a, flush=True)


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()


def run(*cmd):
    log("実行", " ".join(cmd))
    subprocess.run([sys.executable, *cmd], cwd=ROOT, check=True)


# ---- 元データ ----
def src_yakka():
    """厚労省の薬価基準の一覧（内用・注射・外用・後発医薬品に関する情報）。年度ごとのページの新しい適用日の物"""
    today = datetime.date.today()
    fy = today.year if today.month >= 4 else today.year - 1
    links = []
    for y in (fy, fy - 1):
        try:
            html = get(f"https://www.mhlw.go.jp/topics/{y}/04/tp{y}0401-01.html").decode("utf-8", "ignore")
        except Exception as e:
            log("薬価基準のページが開けない", y, e)
            continue
        links = re.findall(r'href="(/topics/\d{4}/04/xls/tp(\d{8})-01_0(\d)\.xlsx)"', html)
        if links:
            break
    if not links:
        log("薬価基準：新しい一覧が見つからないので今の物を使う")
        return
    newest = max(d for _, d, k in links if k == "1")
    cur = re.findall(r"tp(\d{8})-01_01_", " ".join(os.listdir(SRC)))
    if cur and max(cur) >= newest:
        log("薬価基準：今の一覧（%s 適用）が最新" % max(cur))
        return
    names = {"1": "内用薬", "2": "注射薬", "3": "外用薬", "5": "後発医薬品に関する情報"}
    got = {}
    for k in "1235":
        cand = sorted([(d, u) for u, d, kk in links if kk == k and d <= newest], reverse=True)
        if not cand:
            log("薬価基準：", names[k], "が無いので今の物を使う")
            return
        d, u = cand[0]
        got[k] = (f"tp{d}-01_0{k}_{names[k]}.xlsx", get("https://www.mhlw.go.jp" + u))
    for f in glob.glob(os.path.join(SRC, "tp*-01_0[1235]_*.xlsx")):
        os.remove(f)
    for name, data in got.values():
        open(os.path.join(SRC, name), "wb").write(data)
    log("薬価基準：%s 適用の一覧に置き替えた" % newest)


def src_master():
    """診療報酬情報提供サービスの医薬品マスター（y.zip。中の csv の名前の日付で保存する）"""
    data = get("https://shinryohoshu.mhlw.go.jp/shinryohoshu/downloadMenu/yFile")
    z = zipfile.ZipFile(io.BytesIO(data))
    m = re.search(r"y_(\d{8})\.csv", " ".join(z.namelist()))
    name = f"y_{m.group(1)}.zip" if m else "y_%s.zip" % datetime.date.today().strftime("%Y%m%d")
    if os.path.exists(os.path.join(SRC, name)):
        log("医薬品マスター：今の物（%s）が最新" % name)
        return
    for f in glob.glob(os.path.join(SRC, "y_*.zip")):
        os.remove(f)
    open(os.path.join(SRC, name), "wb").write(data)
    log("医薬品マスター：%s に置き替えた" % name)


def clear_caches():
    if "--keep-cache" in args:
        log("キャッシュは消さない（--keep-cache）")
        return
    for c in CACHES:
        shutil.rmtree(c, ignore_errors=True)
    log("PMDA・厚労省のキャッシュを消した（すべて取り直す）")


# ---- 目で確かめる物 ----
def review_blank_before():
    state["blank_old"] = json.load(open(os.path.join(HERE, "blank.json")))


def review_sheets():
    """新しく無字とされた錠剤と、識別コードが画像だけの新しい製品の図を /tmp/update_review/ に並べる"""
    from PIL import Image, ImageDraw, ImageFont

    shutil.rmtree(REVIEW, ignore_errors=True)
    os.makedirs(REVIEW)
    info = json.load(open(os.path.join(ROOT, "data", "info.json"), encoding="utf-8"))["items"]
    names = json.load(open(os.path.join(ROOT, "data", "otc.json"), encoding="utf-8"))["names"]
    ns = {"__file__": os.path.join(HERE, "make_blank.py")}
    exec(open(os.path.join(HERE, "make_blank.py"), encoding="utf-8").read().split("blank = []")[0], ns)
    font = ImageFont.load_default()
    for fp in ("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", "/usr/share/fonts/truetype/fonts-japanese-gothic.ttf", "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"):
        if os.path.exists(fp):
            font = ImageFont.truetype(fp, 14)
            break

    def sheet(rows, path):
        if not rows:
            return
        sh = Image.new("RGB", (900, 70 * len(rows)), "white")
        dr = ImageDraw.Draw(sh)
        for i, (label, ims) in enumerate(rows):
            dr.text((4, i * 70 + 4), label, fill="red", font=font)
            x = 4
            for b in ims:
                im = Image.open(io.BytesIO(b)).convert("RGBA")
                bg = Image.new("RGBA", im.size, "white")
                bg.alpha_composite(im)
                im = bg.convert("RGB")
                t = 44 / im.height
                im = im.resize((max(1, int(im.width * t)), 44))
                sh.paste(im.crop((0, 0, min(im.width, 280), 44)), (x, i * 70 + 24))
                x += min(im.width, 280) + 8
        sh.save(path)

    # 1) 新しく無字とされた錠剤（文字・記号が見えたら make_blank.py の EXCLUDE に足す）
    new_blank = sorted(set(json.load(open(os.path.join(HERE, "blank.json")))) - set(state.get("blank_old", [])))
    rows = [(f"{yj} {names.get(yj, '')}", ns["images"](info[yj]["f"]) or []) for yj in new_blank if info.get(yj, {}).get("f")]
    for k in range(0, len(rows), 25):
        sheet(rows[k : k + 25], os.path.join(REVIEW, f"blank_{k // 25}.png"))
    # 2) 識別コードが画像だけの新しい製品（画像を読んで tools/idcode_img.json に足す）
    idimg = json.load(open(os.path.join(HERE, "idcode_img.json"), encoding="utf-8"))
    out = {}
    for d in ("/tmp/pmda_handling_cache", "/tmp/pmda_limits_cache"):
        for f in glob.glob(os.path.join(d, "*.zip")):
            try:
                z = zipfile.ZipFile(f)
                s = z.read([n for n in z.namelist() if n.endswith(".xml")][0]).decode("utf-8", "ignore")
            except Exception:
                continue
            brands = {m.group(1): m.group(2) for m in re.finditer(r'<DetailBrandName id="([^"]+)">.*?<YJCode>([0-9A-Z]{12})</YJCode>', s, re.S)}
            for m in re.finditer(r'<PropertyForBrand ref="([^"]+)">(.*?)</PropertyForBrand>', s, re.S):
                yj = brands.get(m.group(1))
                if not yj or yj in idimg or yj in out or info.get(yj, {}).get("i") or yj not in info:
                    continue
                g = []
                for c in re.findall(r"<IdCode[^>]*>(.*?)</IdCode>", m.group(2), re.S):
                    g += re.findall(r'gfname="([^"]+)"', c)
                ims = [z.read(n) for n in z.namelist() for x in g if n.endswith(x)]
                if ims:
                    out[yj] = ims
    rows = [(f"{yj} {names.get(yj, '')}", ims) for yj, ims in sorted(out.items())]
    for k in range(0, len(rows), 25):
        sheet(rows[k : k + 25], os.path.join(REVIEW, f"idcode_{k // 25}.png"))
    json.dump({"new_blank": new_blank, "new_idcode_img": sorted(out)}, open(os.path.join(REVIEW, "review.json"), "w"), ensure_ascii=False, indent=1)
    log("目で確かめる物：新しい無字 %d 件、画像だけの識別コード %d 件（%s）" % (len(new_blank), len(out), REVIEW))


def stamp():
    p = os.path.join(ROOT, "data", "updated.json")
    d = json.load(open(p, encoding="utf-8"))
    d["date"] = datetime.datetime.now(JST).strftime("%Y-%m-%d")
    json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    open(p, "a").write("\n")
    log("データ更新日を", d["date"], "にした")


STEPS = [
    ("yakka", src_yakka),
    ("master", src_master),
    ("cache", clear_caches),
    ("otc", lambda: run("tools/make_otc.py")),
    ("generic", lambda: run("tools/make_generic.py")),
    ("gediff", lambda: run("tools/make_gediff.py")),
    ("handling", lambda: run("tools/make_handling.py", "fetch")),
    ("limits", lambda: run("tools/make_limits.py")),
    ("if", lambda: run("tools/make_if.py", "fetch")),
    ("label", lambda: run("tools/make_label.py", "fetch")),
    ("info1", lambda: run("tools/make_info.py")),
    ("blank_old", review_blank_before),
    ("blank", lambda: run("tools/make_blank.py")),
    ("info2", lambda: run("tools/make_info.py")),
    ("lot", lambda: run("tools/make_lot.py")),
    ("warfarin", lambda: run("tools/make_warfarin.py")),
    ("newdrug", lambda: run("tools/make_newdrug.py")),
    ("renal", lambda: None if "--skip-renal" in args else run("tools/fetch_renal_all.py")),
    ("review", review_sheets),
    ("stamp", stamp),
]

start = args[args.index("--from") + 1] if "--from" in args else None
if start:
    names = [n for n, _ in STEPS]
    state["done"] = names[: names.index(start)]
for name, fn in STEPS:
    if name in state["done"]:
        continue
    log("==", name)
    fn()
    state["done"].append(name)
    json.dump(state, open(STATE, "w"), ensure_ascii=False)
log("すべて終わった。目で確かめる物は", REVIEW, "／ 終わったら", STATE, "を消す")
