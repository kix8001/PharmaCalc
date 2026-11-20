# 調剤・保管の注意（粉砕・分割・一包化・遮光・温度・湿気）のデータ data/handling.json を作る。
#
# 元データ：PMDA の電子添文 XML（内用薬・外用薬の全製品。薬価基準の一覧 tools/generic_src/ の YJ 先頭7桁ごとに
# GeneralList/{YJ7} を開き、載っている添付文書の XML をすべて読む）
# 読む項目：貯法（StorageMethod）、14. 適用上の注意、20. 取扱い上の注意、7. 用法及び用量に関連する注意、性状（割線）、販売名（徐放・腸溶）
# 判定は「添付文書にこう書いてある」という目印だけ。文言はそのまま q に入れて画面に出す。
#
# 使い方：python3 tools/make_handling.py fetch （取得。数時間かかる。キャッシュは /tmp/pmda_handling_cache）
#         python3 tools/make_handling.py      （キャッシュから data/handling.json を作る）
import glob, io, json, os, re, subprocess, sys, time, unicodedata, zipfile
import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "data", "handling.json")
CACHE = "/tmp/pmda_handling_cache"
OLD_CACHE = "/tmp/pmda_limits_cache"
os.makedirs(CACHE, exist_ok=True)


def get(url, name, fetch=True):
    for d in (CACHE, OLD_CACHE):
        f = os.path.join(d, name)
        if os.path.exists(f) and os.path.getsize(f) > 0:
            return open(f, "rb").read()
    if not fetch:
        return b""
    f = os.path.join(CACHE, name)
    time.sleep(0.3)
    r = subprocess.run(["curl", "-sS", "--max-time", "60", "-A", "PharmaCalc/1.0", "-o", f, url])
    if r.returncode != 0 and os.path.exists(f):
        os.remove(f)
    return open(f, "rb").read() if os.path.exists(f) else b""


def yj7s():
    s = set()
    for f in glob.glob(os.path.join(HERE, "generic_src", "tp*_0[13]_*.xlsx")):
        ws = openpyxl.load_workbook(f, read_only=True).worksheets[0]
        for r in list(ws.iter_rows(values_only=True))[1:]:
            if r[1]:
                s.add(str(r[1]).strip()[:7])
    return sorted(s)


def doc_ids(yj7, fetch):
    gl = get("https://www.pmda.go.jp/PmdaSearch/iyakuDetail/GeneralList/" + yj7, yj7 + ".html", fetch).decode("utf-8", "ignore")
    # 注射剤（YJ 5桁目が 4〜6）は除く
    return sorted(i for i in set(re.findall(r"\d{6}_\d{7}[0-9A-Z]\d{4}_\d_\d+", gl)) if not "4" <= i.split("_")[1][4] <= "6")


def xml_of(i, fetch):
    raw = get("https://www.pmda.go.jp/PmdaSearch/iyakuDetail/ResultDataSetXML/" + i, i + ".zip", fetch)
    try:
        z = zipfile.ZipFile(io.BytesIO(raw))
        return z.read([n for n in z.namelist() if n.endswith(".xml")][0]).decode("utf-8")
    except Exception:
        return ""


def text(x):
    x = re.sub(r"<Header(?:\s[^>]*)?>(.*?)</Header>", r"\1。", x, flags=re.S)
    x = re.sub(r"<[^>]+>", " ", x)
    x = unicodedata.normalize("NFKC", x)
    return re.sub(r"\s+", " ", x).strip()


def section(s, tag):
    return " ".join(text(m) for m in re.findall(rf"<{tag}(?:\s[^>]*)?>(.*?)</{tag}>", s, re.S))


def sentences(t):
    return [x.strip(" 。") for x in re.split(r"(?<=。)|(?<=\))\s(?=\d+\.\d)", t) if x.strip(" 。")]


NEG = r"(しない|避け|ないよう|ないこと|せず|ずに|不可|控え)"
RULES = {
    # 粉砕・かみ砕き
    "crush": re.compile(r"(粉砕|砕|すりつぶ|噛|かみ砕|かまず|かまない|かんだり|かんで|咀嚼|潰|つぶし|つぶさ)"),
    # 分割
    "split": re.compile(r"(割ら|割っ|割る|分割し(?!て投与)|半割)"),
    # 一包化・分包・PTP から出す
    "pack": re.compile(r"(分包|一包化|無包装|直前に[^。]{0,20}取り出|取り出[^。]{0,20}直前|取り出した後|取り出したまま)"),
}
LIGHT = re.compile(r"(遮光|光を避け|光により|光で|曝光|光に)")
MOIST = re.compile(r"(吸湿|湿気|湿度|防湿|乾燥剤)")
TEMP = re.compile(r"(2\s*[〜~～-]\s*8|冷所|冷蔵|凍結|℃以下|°C以下|25℃|30℃|冷暗所|1\s*[〜~～-]\s*30)")


def extract(s):
    names = [text(m) for m in re.findall(r"<ApprovalBrandName>(.*?)</ApprovalBrandName>", s, re.S)]
    yjs = re.findall(r"<YJCode>([0-9A-Z]{12})</YJCode>", s)
    storage = section(s, "StorageMethod")
    app = section(s, "PrecautionsForApplication")
    hand = section(s, "PrecautionsForHandling")
    dose = section(s, "InfoPrecautionsDosage")
    prop = section(s, "Property")
    f, q = set(), []

    def add(flag, src, sent):
        f.add(flag)
        sent = re.sub(r"^[ ,、・]+", "", sent)[:220]
        if (src, sent) not in q:
            q.append((src, sent))

    for src, t in (("用法用量関連", dose), ("適用上の注意", app), ("取扱い上の注意", hand)):
        for x in sentences(t):
            for k, rx in RULES.items():
                # PTP シートの誤飲の注意は除く
                if re.search(r"PTPシートから取り出して服用", x) and not re.search(r"直前", x):
                    continue
                if rx.search(x) and (re.search(NEG, x) or k == "pack") and not (k == "split" and "投与" in x and "割ら" not in x):
                    add(k, src, x)
            if re.search(r"PTPシートから取り出して服用", x):
                continue
            if LIGHT.search(x):
                add("light", src, x)
            if MOIST.search(x):
                add("moist", src, x)
    st = "、".join(dict.fromkeys(x for x in re.split(r"[ 、]+", storage.strip(" 。")) if x))
    if st:
        if LIGHT.search(st):
            f.add("light")
        if TEMP.search(st) and not re.fullmatch(r"室温保存", st):
            f.add("temp")
        if MOIST.search(st):
            f.add("moist")
    nm = " ".join(names)
    if re.search(r"(徐放|L錠|LA|SR|CR|ER錠|デポ|持続|コンチン|ロング|TR錠|XR)", nm):
        f.add("sr")
    if re.search(r"腸溶", nm) or re.search(r"腸溶", prop):
        f.add("ec")
    score = bool(re.search(r"割線", prop))
    return yjs, names, {"st": st, "f": sorted(f), "q": q, "sc": 1 if score else 0}


def prefetch():
    """GeneralList と XML を並行して取得する（6本ずつ）"""
    from concurrent.futures import ThreadPoolExecutor

    ys = yj7s()
    with ThreadPoolExecutor(6) as ex:
        lists = list(ex.map(lambda y: doc_ids(y, True), ys))
        print("一覧おわり", sum(len(x) for x in lists), "文書", flush=True)
        ids = sorted({i for x in lists for i in x})
        for n, _ in enumerate(ex.map(lambda i: xml_of(i, True), ids)):
            if n % 500 == 0:
                print(n, "/", len(ids), flush=True)


def main():
    fetch = False
    if len(sys.argv) > 1 and sys.argv[1] == "fetch":
        prefetch()
    docs, by_yj, seen = [], {}, {}
    ys = yj7s()
    for n, y7 in enumerate(ys):
        if fetch and n % 50 == 0:
            print(n, "/", len(ys), y7, flush=True)
        for i in doc_ids(y7, fetch):
            s = xml_of(i, fetch)
            if not s:
                continue
            yjs, names, rec = extract(s)
            key = json.dumps(rec, ensure_ascii=False, sort_keys=True)
            if key not in seen:
                seen[key] = len(docs)
                docs.append(rec)
            for yj in set(yjs + [i.split("_")[1]]):
                by_yj.setdefault(yj, seen[key])
    if fetch:
        print("取得おわり")
    out = {
        "source": "PMDA 医療用医薬品の電子添文（XML）の貯法・適用上の注意・取扱い上の注意・用法及び用量に関連する注意・性状。" + time.strftime("%Y年%m月%d日") + "取得",
        "docs": [{k: v for k, v in d.items() if v} for d in docs],
        "yj": by_yj,
    }
    with open(OUT, "w", encoding="utf-8") as fp:
        json.dump(out, fp, ensure_ascii=False, separators=(",", ":"))
    import collections
    c = collections.Counter(fl for yj, i in by_yj.items() for fl in docs[i]["f"])
    print("製品", len(by_yj), "文書", len(docs), dict(c), os.path.getsize(OUT) // 1024, "KB")


if __name__ == "__main__":
    main()
