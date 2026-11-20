# ロット番号から使用期限を調べるためのデータ data/lot.json を作る。
#
# 手元に PTP シートしかないとき、ロット番号を手がかりに使用期限を調べる。ロットと期限の対応は公開されたデータが無いので、
# 製品ごとに「メーカーの使用期限検索のページ」→ 無ければ「問い合わせ先の電話番号」→ 無ければ「メールアドレス」を出す。
#
# 製造販売元・問い合わせ先：PMDA の電子添文 XML（26. 製造販売業者等 の「製造販売元」、24. 文献請求先及び問い合わせ先）。
#   make_handling.py のキャッシュ（今の添付文書＝GeneralList に載っている番号の物）を使う
# 使用期限検索のページ：下の LOT_SITES（各社の医療関係者向けサイト。2026年11月に検索して確かめた物）。会社名の一部で照合する
#
# 使い方：python3 tools/make_lot.py
import glob, json, os, re, unicodedata, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "data", "lot.json")
CACHES = ["/tmp/pmda_handling_cache", "/tmp/pmda_limits_cache"]

# 会社名に含まれる文字 → 使用期限検索のページ
LOT_SITES = [
    ("エーザイ", "https://medical.eisai.jp/search-lot"),
    ("ノバルティス", "https://lotsearch.novartis.co.jp/"),
    ("塩野義", "https://expiration-search.shionogi.co.jp/"),
    ("日本新薬", "https://med.nippon-shinyaku.co.jp/product/expiration/"),
    ("第一三共エスファ", "https://med.daiichisankyo-ep.co.jp/products/kigen.php?certification=1"),
    ("三和化学", "https://med.skk-net.com/supplies/expirations/index.html"),
    ("田辺", "https://medical.tanabe-pharma.com/di/termssearch/"),
    ("興和", "https://medical.kowa.co.jp/product/lot_search"),
    ("アステラス", "https://amn.astellas.jp/common/expiration-search"),
    ("旭化成ファーマ", "https://akp-pharma-digital.com/products/shiyokigen"),
    ("全星薬品", "https://zensei-med.jp/lot_search/"),
    ("Meiji Seika", "https://meiji-medical-net.com/product/lotsearch"),
    ("丸石製薬", "https://www.maruishi-pharm.co.jp/medical/expiration/"),
    ("扶桑薬品", "https://www.fuso-pharm.co.jp/med/ph/expiration/"),
    ("ニプロESファーマ", "https://www.nipro-es-pharma.co.jp/product/di/termssearch.php"),
]


def text(x):
    x = re.sub(r"<\?enter\?>", "\n", x)
    x = re.sub(r"<[^>]+>", "", x)
    return unicodedata.normalize("NFKC", x).strip()


def phones(t):
    """問い合わせ先の文から電話番号（FAX の番号は除く）。「（0120）517-215」「0120‒381‒999」なども"""
    t = re.sub(r"[‐‑‒–—―−ー－]", "-", t)
    t = re.sub(r"[(（]\s*(0\d{1,4})\s*[)）]\s*", r"\1-", t)
    # FAX の番号を消す（同じ行に TEL と FAX があることも多い）
    t = re.sub(r"(FAX|Fax|fax|ファックス|ファクス)\s*[:：]?\s*[\d\- ]+", " ", t)
    out = []
    for m in re.finditer(r"(?<!\d)(0\d{1,4})-?(\d{1,4})-(\d{3,4})(?!\d)", t):
        n = m.group(0)
        if n not in out:
            out.append(n)
    return out[:2]


current = set()
for d in CACHES:
    for f in glob.glob(os.path.join(d, "*.html")):
        current.update(re.findall(r"\d{6}_\d{7}[0-9A-Z]\d{4}_\d_\d+", open(f, encoding="utf-8", errors="ignore").read()))

companies, cidx, by_yj = [], {}, {}
seen = set()
for d in CACHES:
    for f in glob.glob(os.path.join(d, "*.zip")):
        doc = os.path.basename(f)[:-4]
        if doc not in current or doc in seen:
            continue
        seen.add(doc)
        try:
            z = zipfile.ZipFile(f)
            s = z.read([n for n in z.namelist() if n.endswith(".xml")][0]).decode("utf-8", "ignore")
        except Exception:
            continue
        maker = ""
        for m in re.finditer(r"<Manufacturer>(.*?)</Manufacturer>", s, re.S):
            kind = text(re.search(r"<TypeOfIndustry>(.*?)</TypeOfIndustry>", m.group(1), re.S).group(1)) if re.search(r"<TypeOfIndustry>", m.group(1)) else ""
            name = text(re.search(r"<Name>(.*?)</Name>", m.group(1), re.S).group(1)) if re.search(r"<Name>", m.group(1)) else ""
            if "製造販売" in kind and name:
                maker = name
                break
        desk, tel, mail = "", [], ""
        a = re.search(r"<AddresseeOfLiteratureRequest[^>]*>(.*?)</AddresseeOfLiteratureRequest>", s, re.S)
        if a:
            inq = re.search(r"<AddresseeOfInquiry>(.*?)</AddresseeOfInquiry>", a.group(1), re.S)
            desk = text(inq.group(1)) if inq else ""
            ci = " \n".join(text(x) for x in re.findall(r"<ContactInformation>(.*?)</ContactInformation>", a.group(1), re.S))
            tel = phones(ci)
            em = re.search(r"[\w.+-]+@[\w-]+(\.[\w-]+)+", text(a.group(1)))
            mail = em.group(0) if em else ""
        if not maker and not desk:
            continue
        site = next((u for k, u in LOT_SITES if k in maker or k in desk), "")
        clean = lambda x: re.sub(r"^製造販売(業者|元)\s*", "", re.sub(r"\s*\n\s*", " ", x)).strip()
        rec = {"n": clean(maker or desk), "d": clean(desk), "t": tel, "m": mail, "u": site}
        key = json.dumps(rec, ensure_ascii=False, sort_keys=True)
        if key not in cidx:
            cidx[key] = len(companies)
            companies.append({k: v for k, v in rec.items() if v})
        for yj in re.findall(r"<YJCode>([0-9A-Z]{12})</YJCode>", s):
            by_yj.setdefault(yj, cidx[key])

out = {
    "source": "製造販売元・問い合わせ先：PMDA 医療用医薬品の電子添文。使用期限検索：各社の医療関係者向けサイト（2026年11月）",
    "companies": companies,
    "yj": by_yj,
}
with open(OUT, "w", encoding="utf-8") as fp:
    json.dump(out, fp, ensure_ascii=False, separators=(",", ":"))
n = lambda k: sum(1 for y, i in by_yj.items() if k in companies[i])
print("製品", len(by_yj), "会社（問い合わせ先）", len(companies), "検索ページ", n("u"), "電話", n("t"), "メール", n("m"), os.path.getsize(OUT) // 1024, "KB")
