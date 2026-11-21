# ワルファリンの相互作用のデータ data/warfarin.json を作る。
#
# 元：PMDA の電子添文 XML（ワーファリン錠、YJ 3332001…。make_handling.py のキャッシュ /tmp/pmda_handling_cache を使う。
#     無ければ PMDA の GeneralList から取る）の 10.1 併用禁忌（ContraIndicatedCombination）と 10.2 併用注意（PrecautionsForCombination）。
#     表の1行（<Drug>）ごとに、薬の区分（いちばん上の名前）・薬剤名（下の名前）・臨床症状・措置方法・機序・危険因子を文言どおり入れる。
#     臨床症状の文に「増強」があれば e=1（作用が強くなる＝PT-INR が上がる）、「減弱」があれば e=-1、両方なら e=2、どちらも無ければ e=0。
# 使い方：python3 tools/make_warfarin.py
import glob, json, os, re, subprocess, unicodedata, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "data", "warfarin.json")
CACHE = "/tmp/pmda_handling_cache"
YJ7 = "3332001"


def text(x):
    x = re.sub(r"<\?enter\?>", "\n", x)
    x = re.sub(r"<HeaderRef[^>]*/>", "", x)
    x = re.sub(r"<[^>]+>", "", x)
    x = unicodedata.normalize("NFKC", x)
    return re.sub(r"[ \t]*\n[ \t]*", "\n", re.sub(r"[ \t]+", " ", x)).strip()


def load_xml():
    """ワーファリン錠（エーザイ）の添付文書 XML。キャッシュに無ければ取る"""
    for f in sorted(glob.glob(os.path.join(CACHE, f"*_{YJ7}*.zip"))):
        try:
            z = zipfile.ZipFile(f)
            s = z.read([n for n in z.namelist() if n.endswith(".xml")][0]).decode("utf-8", "ignore")
        except Exception:
            continue
        if "ワーファリン" in s and "<PrecautionsForCombination" in s:
            return s, os.path.basename(f)[:-4]
    html = subprocess.run(["curl", "-sL", "-m", "60", f"https://www.pmda.go.jp/PmdaSearch/iyakuDetail/GeneralList/{YJ7}"], capture_output=True).stdout.decode("utf-8", "ignore")
    for doc in re.findall(r"\d{6}_%s[0-9A-Z]\d{4}_\d_\d+" % YJ7, html):
        os.makedirs(CACHE, exist_ok=True)
        path = os.path.join(CACHE, doc + ".zip")
        subprocess.run(["curl", "-sL", "-m", "60", "-o", path, f"https://www.pmda.go.jp/PmdaSearch/iyakuDetail/ResultDataSetXML/{doc}"])
        try:
            z = zipfile.ZipFile(path)
            s = z.read([n for n in z.namelist() if n.endswith(".xml")][0]).decode("utf-8", "ignore")
        except Exception:
            continue
        if "ワーファリン" in s:
            return s, doc
    raise SystemExit("ワーファリンの添付文書が見つかりません")


def names(dn):
    """DrugName：いちばん上の名前（区分）と、その下の名前（入れ子の項目）"""
    top = re.match(r"\s*<Detail>(.*?)</Detail>", dn, re.S)
    head = text(top.group(1)) if top else ""
    rest = dn[top.end() :] if top else dn
    leaves = [text(x) for x in re.findall(r"<Detail>(.*?)</Detail>", rest, re.S)]
    return head, [x for x in leaves if x]


def rows(block):
    out = []
    for d in re.findall(r"<Drug>(.*?)</Drug>", block, re.S):
        dn = re.search(r"<DrugName>(.*?)</DrugName>", d, re.S)
        head, sub = names(dn.group(1)) if dn else ("", [])
        cs = re.search(r"<ClinSymptomsAndMeasures>(.*?)</ClinSymptomsAndMeasures>", d, re.S)
        mr = re.search(r"<MechanismAndRiskFactors>(.*?)</MechanismAndRiskFactors>", d, re.S)
        s = text(cs.group(1)) if cs else ""
        up, down = "増強" in s, "減弱" in s
        out.append({"h": head, "d": sub, "s": s, "m": text(mr.group(1)) if mr else "", "e": 2 if up and down else 1 if up else -1 if down else 0})
    return out


s, doc = load_xml()
contra = re.search(r"<ContraIndicatedCombination\b.*?</ContraIndicatedCombination>", s, re.S)
caution = re.search(r"<PrecautionsForCombination\b.*?</PrecautionsForCombination>", s, re.S)
rev = re.search(r'<PreparationOrRevision id="今回">\s*<YearMonth>([\d-]+)</YearMonth>\s*<Version>\s*<Lang[^>]*>(.*?)</Lang>', s, re.S)
data = {
    "source": "ワーファリン錠（エーザイ）電子添文 %s（%s）の 10. 相互作用" % (rev.group(1).replace("-", "年") + "月" if rev else "", text(rev.group(2)) if rev else ""),
    "doc": doc,
    "contra": rows(contra.group(0)) if contra else [],
    "caution": rows(caution.group(0)) if caution else [],
}
with open(OUT, "w", encoding="utf-8") as fp:
    json.dump(data, fp, ensure_ascii=False, separators=(",", ":"))
from collections import Counter

print(data["source"], "禁忌", len(data["contra"]), "注意", len(data["caution"]), Counter(r["e"] for r in data["caution"]), os.path.getsize(OUT) // 1024, "KB")
