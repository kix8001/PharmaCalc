# スキャンの結果に出す添付文書の項目（警告・禁忌・効能又は効果・効能関連注意・用法及び用量・用法用量関連注意・併用禁忌）の
# データ web/public/label/{YJ先頭4桁}.json を作る。
#
# 元：PMDA の電子添文 XML（make_handling.py のキャッシュ /tmp/pmda_handling_cache。今の添付文書＝GeneralList に載っている番号の物だけ）。
#   1. 警告 Warnings／2. 禁忌 ContraIndications／4. 効能又は効果 IndicationsOrEfficacy／5. 効能又は効果に関連する注意 EfficacyRelatedPrecautions
#   6. 用法及び用量 InfoDoseAdmin／7. 用法及び用量に関連する注意 InfoPrecautionsDosage／10.1 併用禁忌 ContraIndicatedCombinations
#   を文言どおり文字にする（項目は「・」、表は「｜」区切り、併用禁忌は薬剤名・臨床症状・措置方法・機序の順）。
# ファイルは YJ コードの先頭4桁（薬効分類）ごとに分ける：{"yj": {YJ12: 添付文書番号}, "docs": {番号: {w, c, i, ip, d, dp, x}}}。
# 全部で数十 MB あるので、サービスワーカーは先に保存しない（開いたときに取って保存する。vite.config.ts）。
# 使い方：python3 tools/make_label.py fetch（足りない GeneralList・XML を PMDA から取る。6本並行）／fetch なしはキャッシュだけで作る
import glob, json, os, re, shutil, subprocess, unicodedata, zipfile

import openpyxl
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "web", "public", "label")
CACHE = "/tmp/pmda_handling_cache"

SECTIONS = {
    "w": "Warnings",
    "c": "ContraIndications",
    "i": "IndicationsOrEfficacy",
    "ip": "EfficacyRelatedPrecautions",
    "d": "InfoDoseAdmin",
    "dp": "InfoPrecautionsDosage",
    "x": "ContraIndicatedCombinations",
    # 9.2 腎機能障害患者・9.3 肝機能障害患者
    "r": "PatientsWithRenalImpairment",
    "h": "PatientsWithHepaticImpairment",
}


def local(tag):
    return tag.split("}")[-1]


def norm(s):
    s = unicodedata.normalize("NFKC", s)
    s = re.sub(r"[ \t　]+", " ", s)
    return re.sub(r" *\n *", "\n", s).strip()


def para(el):
    """Detail などの中の文：<?enter?> は改行、HeaderRef（「○○参照」の番号）は省く"""
    out = []

    def walk(e):
        if e.text:
            out.append(e.text)
        for c in e:
            t = local(c.tag)
            if t.endswith("Ref"):
                out.append("\x00")
            elif t == "Sup":
                # 上付きの数字は上付きの文字に（m2 → m²）
                out.append("".join(c.itertext()).translate(str.maketrans("0123456789+-", "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻")))
            elif t == "Sub":
                out.append("".join(c.itertext()))
            else:
                walk(c)
            if c.tail:
                out.append(c.tail)

    walk(el)
    x = "".join(out)
    # 参照の番号（HeaderRef）は省くので、その間の「,」「、」や「[○○参照]」の括弧も一緒に消す
    R = r"\x00(?:[\s,，、及びとおよ]*\x00)*"
    x = re.sub(r"[\[［(（]\s*" + R + r"\s*(?:参照)?\s*[\]］)）]", "", x)
    x = re.sub(R + r"\s*参照", "", x)
    x = re.sub(r"[\s,，、]*" + R + r"[\s,，]*", "", x)
    return norm(x.replace("\x00", ""))


def render(el, depth, lines, in_item=False):
    t = local(el.tag)
    if t in ("Lang",):
        s = norm("".join(el.itertext()))
        if s:
            lines.append(("  " * depth) + s)
        return
    if t == "Detail":
        s = para(el)
        if s:
            for k, ln in enumerate(s.split("\n")):
                lines.append(("  " * depth) + ln)
        return
    if t == "Header":
        s = para(el)
        if s:
            lines.append(("  " * depth) + "■ " + s)
        return
    if t == "Item":
        start = len(lines)
        for c in el:
            render(c, depth, lines, True)
        # 見出し（■）で始まる項目には「・」を付けない
        if len(lines) > start and not lines[start].lstrip().startswith("■"):
            lines[start] = ("  " * depth) + "・" + lines[start].lstrip()
        return
    if t in ("OrderedList", "UnorderedList", "SimpleList"):
        # 項目の中の箇条書きだけ1段下げる
        for c in el:
            render(c, depth + (1 if in_item else 0), lines)
        return
    if t in ("TblBlock", "Table", "SimpleTable"):
        for row in el.iter():
            if local(row.tag) in ("TblRow", "Row", "tr"):
                cells = [norm(" ".join(x.itertext())) for x in row if local(x.tag) in ("TblCell", "Cell", "td", "th")]
                cells = [c for c in cells if c]
                if cells:
                    lines.append(("  " * depth) + " ｜ ".join(cells))
        return
    if t == "Drug":
        # 併用禁忌・併用注意の表の1行
        dn = el.find("./{*}DrugName")
        cs = el.find("./{*}ClinSymptomsAndMeasures")
        mr = el.find("./{*}MechanismAndRiskFactors")
        names = [para(x) for x in dn.iter() if local(x.tag) == "Detail"] if dn is not None else []
        lines.append(("  " * depth) + "◆ " + "・".join(n for n in names if n))
        if cs is not None and para(cs):
            lines.append(("  " * (depth + 1)) + "臨床症状・措置方法：" + para(cs).replace("\n", " "))
        if mr is not None and para(mr):
            lines.append(("  " * (depth + 1)) + "機序・危険因子：" + para(mr).replace("\n", " "))
        return
    if t in ("WidthDefinition", "Col", "HeaderRef"):
        return
    for c in el:
        render(c, depth, lines, in_item)


def section(root, name):
    els = [e for e in root.iter() if local(e.tag) == name]
    if not els:
        return ""
    lines = []
    for e in els:
        render(e, 0, lines)
    text = "\n".join(lines).strip()
    # 中身のない見出しだけ（「設定されていない」など）
    return text


CACHES = [CACHE, "/tmp/pmda_limits_cache"]
DOC_RE = r"\d{6}_\d{7}[0-9A-Z]\d{4}_[0-9A-Z]_\d+"


def cached(name):
    for d in CACHES:
        f = os.path.join(d, name)
        if os.path.exists(f) and os.path.getsize(f) > 0:
            return f
    return None


def fetch(url, name):
    f = os.path.join(CACHE, name)
    subprocess.run(["curl", "-sS", "--max-time", "60", "-A", "PharmaCalc/1.0", "-o", f, url])
    return f if os.path.exists(f) else None


def xml_of(path):
    try:
        z = zipfile.ZipFile(path)
        return z.read([n for n in z.namelist() if n.endswith(".xml")][0]).decode("utf-8", "ignore")
    except Exception:
        return ""


def yj7s():
    out = set()
    for f in glob.glob(os.path.join(HERE, "generic_src", "tp*_0[13]_*.xlsx")):
        for r in openpyxl.load_workbook(f, read_only=True).worksheets[0].iter_rows(values_only=True):
            if r and r[1] and re.fullmatch(r"[0-9A-Z]{12}", str(r[1])):
                out.add(str(r[1])[:7])
    return sorted(out)


def family_doc(fam_docs):
    """同じ製品の添付文書（版違い）のうち、XML がある最新の物。無ければ取りに行く（新しい版から）"""
    best, best_ym = None, ""
    order = sorted(fam_docs, key=lambda d: int(d.rsplit("_", 1)[1]), reverse=True)
    for d in order:
        f = cached(d + ".zip")
        if f is None and FETCH:
            f = fetch("https://www.pmda.go.jp/PmdaSearch/iyakuDetail/ResultDataSetXML/" + d, d + ".zip")
        x = xml_of(f) if f else ""
        if not x:
            continue
        ym = re.search(r'<PreparationOrRevision id="今回">\s*<YearMonth>([\d-]+)', x)
        ym = ym.group(1) if ym else "0"
        if ym > best_ym:
            best, best_ym = (d, x), ym
        if FETCH and f and best:
            break
    return best


import sys
from concurrent.futures import ThreadPoolExecutor

FETCH = "fetch" in sys.argv
families = {}  # (会社_YJ_n) -> docs
targets = yj7s()


def general_list(y7):
    f = cached(y7 + ".html")
    if f is None and FETCH:
        f = fetch("https://www.pmda.go.jp/PmdaSearch/iyakuDetail/GeneralList/" + y7, y7 + ".html")
    return open(f, encoding="utf-8", errors="ignore").read() if f else ""


with ThreadPoolExecutor(6) as ex:
    for y7, html in zip(targets, ex.map(general_list, targets)):
        for d in set(re.findall(DOC_RE, html)):
            if d.split("_")[1][:7] != y7:
                continue
            families.setdefault(d.rsplit("_", 1)[0], set()).add(d)
print("YJ7", len(targets), "製品（添付文書の系列）", len(families))
with ThreadPoolExecutor(6) as ex:
    picked = [x for x in ex.map(family_doc, families.values()) if x]
print("XML がある添付文書", len(picked))

files = {}  # yj4 -> {"yj": {}, "docs": {}}
n_docs = 0
for doc, s in picked:
    s = s.replace("<?enter?>", "\n")
    try:
        root = ET.fromstring(s.encode("utf-8"))
    except ET.ParseError:
        continue
    yjs = sorted(set(re.findall(r"<YJCode>([0-9A-Z]{12})</YJCode>", s)))
    if not yjs:
        continue
    rec = {}
    for k, tag in SECTIONS.items():
        t = section(root, tag)
        if t:
            rec[k] = t
    if not rec:
        continue
    # 投与期間の規定（「8週間までの投与」「2週間投与後…継続の必要性を検討」「漫然と投与しない」など）。
    # 効能関連注意・用法用量・用法用量関連注意・重要な基本的注意（8.）の文から拾う。検査の間隔の文は除く
    bp = section(root, "ImportantPrecautions")
    durs, loose = [], []
    DUR = re.compile(r"([0-9０-９]+|一|二|三|四|六|十二)\s*(週間|日間|ヵ月|カ月|か月|ケ月|箇月|年間)")
    for src, name in (("ip", "効能又は効果に関連する注意"), ("d", "用法及び用量"), ("dp", "用法及び用量に関連する注意"), (None, "重要な基本的注意")):
        text = bp if src is None else rec.get(src, "")
        for sent in re.split(r"(?<=。)|\n", text):
            t = sent.strip().lstrip("・■ ").strip()
            if not t:
                continue
            if (
                DUR.search(t)
                and re.search(r"(まで|以内|を超え|超える|限度|目安|投与後|使用後|服用後|継続|延長|長期|再投与|投与期間|治療期間|使用期間|休薬)", t)
                and re.search(r"(投与|服用|使用|治療|内服)", t)
                and not re.search(r"(検査|測定|モニタ|観察を十分|ごとに|毎に|保存|貯法|有効期間|経過した|経過後|妊娠|授乳|避妊|後発|臨床試験|試験において|試験では|患者を対象|発現し|発現する|あらわれ|回復|軽快)", t)
            ):
                line = "【" + name + "】" + t
                if line not in durs:
                    durs.append(line)
            elif re.search(r"漫然", t):
                line = "【" + name + "】" + t
                if line not in loose:
                    loose.append(line)
    if durs:
        rec["t"] = "\n".join(durs)
    # 日数は書かれていないが「漫然と投与しない」とある物（一覧では「なし」の横に小さく出す）
    if loose:
        rec["tm"] = "\n".join(loose)
    # 警告・禁忌・用法用量・用法用量関連注意の中で腎機能・肝機能に触れた行（9.2・9.3 とは別に「ほかの項目」として出す）
    for key, rx in (("rx", r"(?<!副)腎|透析|クレアチニン|CCr|eGFR|Ccr"), ("hx", r"肝(?!炎ウイルス)|Child-Pugh")):
        hits = []
        for src, name in (("w", "警告"), ("c", "禁忌"), ("d", "用法及び用量"), ("dp", "用法及び用量に関連する注意")):
            for ln in rec.get(src, "").split("\n"):
                if re.search(rx, ln):
                    hits.append("【" + name + "】" + ln.strip().lstrip("・"))
        if hits:
            rec[key] = "\n".join(hits)
    n_docs += 1
    for y in yjs:
        bucket = files.setdefault(y[:4], {"yj": {}, "docs": {}})
        bucket["yj"].setdefault(y, doc)
        bucket["docs"][doc] = rec

if os.path.isdir(OUT):
    shutil.rmtree(OUT)
os.makedirs(OUT)
total = 0
for k, v in files.items():
    # 使われていない添付文書（YJ の割り当てが別の添付文書になった物）は除く
    used = set(v["yj"].values())
    v["docs"] = {d: r for d, r in v["docs"].items() if d in used}
    p = os.path.join(OUT, k + ".json")
    with open(p, "w", encoding="utf-8") as fp:
        json.dump(v, fp, ensure_ascii=False, separators=(",", ":"))
    total += os.path.getsize(p)
print("添付文書", n_docs, "ファイル", len(files), "合計", total // 1024 // 1024, "MB", "最大", max(os.path.getsize(os.path.join(OUT, x)) for x in os.listdir(OUT)) // 1024, "KB")
