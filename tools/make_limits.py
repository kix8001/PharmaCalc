# 投与日数の上限（向精神薬・麻薬など）の判定データ data/limits.json を作る。
#
# 元データ
#  - 掲示事項等告示（平成18年厚生労働省告示第107号）第十 二「投薬期間に上限が設けられている医薬品」
#      https://www.mhlw.go.jp/web/t_doc?dataId=84aa7837&dataType=0&pageNo=1 （下の LIST_30・LIST_90 はここの文言どおり）
#  - PMDA の電子添文（XML）：規制区分（麻薬・向精神薬など）、一般名、効能・効果
#  - 製品の一覧（YJコード→販売名）は data/otc.json の names（MEDIS の HOTコードマスター）を使う
#
# 規制区分の番号（PMDA の XML）：2 劇薬、3 麻薬、4 第一種向精神薬、5 第二種向精神薬、6 第三種向精神薬、
#   7 覚醒剤、8 覚醒剤原料、9 習慣性医薬品、12 処方箋医薬品（ほかは使わない）
# YJコードの5桁目：0〜3 内用薬、4〜6 注射薬、7〜9 外用薬
#
# 使い方：python3 tools/make_limits.py （www.pmda.go.jp に接続できる環境で。1秒に1回だけ問い合わせる。20分ほど）
import io, json, os, re, subprocess, sys, tempfile, time, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "data", "limits.json")
CACHE = os.path.join(tempfile.gettempdir(), "pmda_limits_cache")
os.makedirs(CACHE, exist_ok=True)

# 調べる薬効分類（YJコードの先頭2桁）：中枢神経・末梢神経・呼吸器・アルカロイド系麻薬・非アルカロイド系麻薬
CLASSES = ("11", "12", "22", "81", "82")

# ---- 告示の文言（第十 二 (二)・(三)）----
LIST_30 = {
    "内用": ["アルプラゾラム", "エスタゾラム", "エチゾラム", "オキシコドン塩酸塩", "オキシコドン塩酸塩水和物", "オキサゾラム", "クアゼパム",
            "クロキサゾラム", "クロチアゼパム", "クロルジアゼポキシド", "コデインリン酸塩", "ジヒドロコデインリン酸塩", "ゾピクロン",
            "ゾルピデム酒石酸塩", "タペンタドール", "トリアゾラム", "ニメタゼパム", "ハロキサゾラム", "ヒドロモルフォン", "プラゼパム",
            "フルジアゼパム", "フルニトラゼパム", "フルラゼパム塩酸塩", "ブロチゾラム", "ブロマゼパム", "ペモリン", "メダゼパム",
            "メチルフェニデート塩酸塩", "モダフィニル", "モルヒネ塩酸塩", "モルヒネ硫酸塩", "リスデキサンフェタミンメシル酸塩",
            "ロフラゼプ酸エチル", "ロラゼパム", "ロルメタゼパム"],
    "外用": ["フェンタニル", "フェンタニルクエン酸塩", "モルヒネ塩酸塩"],
    "注射": ["フェンタニルクエン酸塩", "ブプレノルフィン塩酸塩", "モルヒネ塩酸塩"],
}
COMBO_30 = [("メペンゾラート", "フェノバルビタール"), ("プロキシフィリン", "エフェドリン")]  # 内服の配合剤
LIST_90 = ["ジアゼパム", "ニトラゼパム", "フェノバルビタール", "クロナゼパム", "クロバザム"]  # 内服薬
COMBO_90 = [("フェニトイン", "フェノバルビタール")]

REG = {"3": "麻薬", "4": "第一種向精神薬", "5": "第二種向精神薬", "6": "第三種向精神薬", "7": "覚醒剤", "8": "覚醒剤原料"}

# 同じ適応症の「日数制限のない薬」を探すときの、効能・効果の見出し語（効能・効果にこの語を含む薬どうしを同じ適応症とみなす）
INDICATIONS = [
    ("不眠症", ["不眠症"]),
    ("不安・緊張・抑うつ（神経症・心身症）", ["神経症における不安", "心身症", "不安・緊張", "不安障害", "社会不安障害", "パニック障害"]),
    ("てんかん", ["てんかん"]),
    ("注意欠陥・多動性障害（AD/HD）", ["注意欠陥", "注意欠如"]),
    ("ナルコレプシー・過眠", ["ナルコレプシー", "過眠"]),
    ("疼痛（がん疼痛など）", ["疼痛", "鎮痛"]),
    ("咳", ["鎮咳", "咳嗽"]),
]


def get(url, name):
    f = os.path.join(CACHE, name)
    if not os.path.exists(f):
        time.sleep(1)
        r = subprocess.run(["curl", "-sS", "--max-time", "60", "-A", "PharmaCalc/1.0", "-o", f, url])
        if r.returncode != 0 and os.path.exists(f):
            os.remove(f)
    return open(f, "rb").read() if os.path.exists(f) else b""


def text(x):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", x)).strip()


def insert(yj7):
    """その成分（YJの先頭7桁）の電子添文 XML を1つ読み、規制区分・一般名・効能・効果を返す"""
    gl = get("https://www.pmda.go.jp/PmdaSearch/iyakuDetail/GeneralList/" + yj7, yj7 + ".html").decode("utf-8", "ignore")
    ids = sorted(set(re.findall(r"\d{6}_\d{7}[0-9A-Z]\d{4}_\d_\d+", gl)), key=lambda i: (i.split("_")[1][:7] != yj7, i))
    for i in ids[:6]:
        raw = get("https://www.pmda.go.jp/PmdaSearch/iyakuDetail/ResultDataSetXML/" + i, i + ".zip")
        try:
            z = zipfile.ZipFile(io.BytesIO(raw))
            s = z.read([n for n in z.namelist() if n.endswith(".xml")][0]).decode("utf-8")
        except Exception:
            continue
        blk = re.search(r"<RegulatoryClassification>.*?</RegulatoryClassification>", s, re.S)
        codes = re.findall(r"<RegulatoryClassificationCode>(\d+)<", blk.group(0)) if blk else []
        gen = re.search(r"<GeneralName>(.*?)</GeneralName>", s, re.S)
        ind = re.search(r"<IndicationsOrEfficacy>(.*?)</IndicationsOrEfficacy>", s, re.S)
        g = text(gen.group(1)) if gen else ""
        g = re.sub(r"[（(][A-Za-z][^）)]*[）)]", "", g).strip()
        return {"codes": codes, "ing": g, "ind": text(ind.group(1)) if ind else ""}
    return None


def route(yj):
    d = int(yj[4])
    return "内用" if d <= 3 else ("注射" if d <= 6 else "外用")


def limit(info, yj7):
    """告示のどの区分か：(日数, 根拠)。上限なしは (0, "")"""
    reg = [REG[c] for c in info["codes"] if c in REG]
    if not reg:
        return 0, ""
    ing, r = info["ing"], route(yj7)
    if r == "内用":
        for a, b in COMBO_30:
            if a in ing and b in ing:
                return 30, "告示 第十 二 (二) イ（配合剤）"
        for a, b in COMBO_90:
            if a in ing and b in ing:
                return 90, "告示 第十 二 (三)（配合剤）"
    for x in LIST_30[r]:
        if x in ing:
            return 30, "告示 第十 二 (二) " + {"内用": "イ 内服薬", "外用": "ロ 外用薬", "注射": "ハ 注射薬"}[r]
    if r == "内用":
        for x in LIST_90:
            if x in ing and not any(y in ing and y != x for y in LIST_30["内用"]):
                return 90, "告示 第十 二 (三) 内服薬"
    if "麻薬" in reg or any("向精神薬" in x for x in reg):
        return 14, "告示 第十 二 (一) " + ("イ 麻薬" if "麻薬" in reg else "ロ 向精神薬")
    return 0, ""


def main():
    names = json.load(open(os.path.join(HERE, "..", "data", "otc.json"), encoding="utf-8"))["names"]
    yj7s = sorted({y[:7] for y in names if y.startswith(CLASSES)})
    print("調べる成分", len(yj7s), file=sys.stderr)
    groups = {}
    for n, y7 in enumerate(yj7s):
        info = insert(y7)
        if n % 50 == 0:
            print(n, y7, info and info["ing"], file=sys.stderr)
        if not info:
            continue
        days, basis = limit(info, y7)
        tags = [label for label, words in INDICATIONS if any(w in info["ind"] for w in words)]
        groups[y7] = {
            "ing": info["ing"], "route": route(y7), "reg": [REG[c] for c in info["codes"] if c in REG],
            "days": days, "basis": basis, "ind": tags,
        }
    out = {
        "source": "掲示事項等告示（平成18年厚生労働省告示第107号）第十 二、PMDA 電子添文（規制区分・効能・効果）",
        "made": time.strftime("%Y年%-m月%-d日"),
        "groups": groups,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    lim = {k: v for k, v in groups.items() if v["days"]}
    print("成分", len(groups), "上限あり", len(lim), "→", os.path.getsize(OUT) // 1024, "KB", file=sys.stderr)


if __name__ == "__main__":
    main()
