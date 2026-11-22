# 無字の錠剤（刻印・印字の無い錠剤・カプセル）の一覧 tools/blank.json を作る。
# 添付文書の性状の錠剤の図（表・裏。make_info.py の f）を画像で調べ、どの図の内側にも文字・記号が無い物を「無字」とする（割線は除く）。
# 図が写真・判定できない物は入れない。元の図は make_handling.py のキャッシュ（/tmp/pmda_handling_cache）の zip の中。
# 使い方：python3 tools/make_blank.py（numpy・scipy・Pillow が要る）→ python3 tools/make_info.py
import json, os, re, sys, zipfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from blank_figure import score

HERE = os.path.dirname(os.path.abspath(__file__))
info = json.load(open(os.path.join(HERE, "..", "data", "info.json"), encoding="utf-8"))["items"]
names = json.load(open(os.path.join(HERE, "..", "data", "otc.json"), encoding="utf-8"))["names"]
CACHES = ["/tmp/pmda_handling_cache", "/tmp/pmda_limits_cache"]
# 図を目で見て、文字・記号があったのに無字と判定された物（2026年11月に全136件を確認）
EXCLUDE = {
    "1149117F1144",  # トアラセット配合錠「杏林」（トアラセット 杏林）
    "1190017M2040",  # プレガバリンカプセル75mg「トーワ」
    "2149118F1038",  # イルアミクス配合錠LD「DSPB」
    "2499016F1020",  # イセルティ錠100mg
    "3999013F1380",  # エパルレスタット錠50mg「杏林」（PH 357）
    "3999041X1026",  # カーバグル分散錠200mg
    "6179003M2028",  # クレセンバカプセル40mg（CR40）
}


def zpath(doc):
    for c in CACHES:
        p = f"{c}/{doc}.zip"
        if os.path.exists(p) and zipfile.is_zipfile(p):
            return p


def images(f):
    p = zpath(f[0])
    if not p:
        return None
    z = zipfile.ZipFile(p)
    names = z.namelist()
    stem = lambda x: os.path.splitext(os.path.basename(x))[0]
    out = []
    for n in f[1:3]:  # 表・裏（横は除く）
        g = n[1:] if n.startswith("!") else f"{f[0]}_{n}"
        c = [x for x in names if stem(x) in (g, n.lstrip("!")) or stem(x).endswith("_" + n.lstrip("!"))]
        if c:
            out.append(z.read(c[0]))
    return out


blank = []
for yj, it in sorted(info.items()):
    f = it.get("f")
    if not f or len(f) < 2:
        continue
    # 錠剤・カプセルだけ（坐剤などは除く）
    if yj in EXCLUDE or not re.search(r"錠|カプセル", names.get(yj, "")):
        continue
    ims = images(f)
    if not ims:
        continue
    s = [score(b) for b in ims]
    if all(x is not None and x < 0.003 for x in s):
        blank.append(yj)
json.dump(blank, open(os.path.join(HERE, "blank.json"), "w"), ensure_ascii=False, indent=0)
print("無字", len(blank))
