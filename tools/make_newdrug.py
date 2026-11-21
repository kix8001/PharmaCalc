# 新医薬品の処方日数制限（いわゆる「14日ルール」）のデータ data/newdrug.json を作る。
#
# 新医薬品は、薬価基準に収載された月の翌月の初日から1年間は、1回14日分までしか投薬できない
# （掲示事項等告示 第十 二（一））。ただし中医協で「例外的な取扱い」（30日・制限なしなど）とされた薬がある。
#
# 元のデータ（厚労省 中医協 総会の資料。www.mhlw.go.jp）：
#   ・「医薬品の新規薬価収載（等）について」の PDF の「新医薬品一覧表（令和○年○月○日収載予定）」→ 品目名と収載日
#   ・「…１４日ルールの例外的な取扱い…」の PDF →「○○」について … 例外的に、「処方日数制限を１４日間ではなく３０日間として…」
#   品目名は tools/generic_src の薬価基準収載品目リスト（内用・注射・外用）の品名と突き合わせて YJ コードにする。
# 解除日＝収載日の翌月の初日から1年後（例：令和8年11月13日収載 → 令和9年12月1日から長期処方できる）。
# 解除から6か月までの品目も「解除済み」として載せる（画面では制限の一覧の下に出す）。
#
# items：YJ → m 品名・d 収載日・u 解除日（この日から長期処方できる）・n 上限の日数（0＝例外で制限なし）
# 使い方：python3 tools/make_newdrug.py（PDF は /tmp/mhlw_newdrug_cache にためる）
import datetime, glob, json, os, re, subprocess, unicodedata

import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "data", "newdrug.json")
SRC = os.path.join(HERE, "generic_src")
CACHE = "/tmp/mhlw_newdrug_cache"
INDEX = "https://www.mhlw.go.jp/stf/shingi/shingi-chuo_128154.html"
TODAY = datetime.date.today()
# この日より前に解除された品目は載せない
KEEP_FROM = TODAY - datetime.timedelta(days=183)


def get(url, path=None):
    if path and os.path.exists(path) and os.path.getsize(path) > 0:
        return open(path, "rb").read()
    b = subprocess.run(["curl", "-sL", "-m", "90", url], capture_output=True).stdout
    if path:
        open(path, "wb").write(b)
    return b


def norm(s):
    s = unicodedata.normalize("NFKC", str(s))
    return re.sub(r"[\s　]", "", s).replace("µ", "μ")


def pdftext(path, layout=False, page=None):
    cmd = ["pdftotext"] + (["-layout"] if layout else []) + (["-f", str(page), "-l", str(page)] if page else []) + [path, "-"]
    return subprocess.run(cmd, capture_output=True).stdout.decode("utf-8", "ignore")


def wareki(s):
    """「令和８年１１月１３日」→ date"""
    s = unicodedata.normalize("NFKC", s)
    m = re.search(r"令和(\d+|元)年(\d+)月(\d+)日", s)
    if not m:
        return None
    y = 2018 + (1 if m.group(1) == "元" else int(m.group(1)))
    return datetime.date(y, int(m.group(2)), int(m.group(3)))


def lift_date(d):
    """解除日：収載日の翌月の初日から1年 → その次の日（翌月の初日の1年後）"""
    y, m = (d.year, d.month + 1) if d.month < 12 else (d.year + 1, 1)
    return datetime.date(y + 1, m, 1)


os.makedirs(CACHE, exist_ok=True)

# 1. 中医協 総会の回の一覧から、最近（解除がまだ・解除から半年以内になりうる、2年前まで）の回の資料のページ
idx = get(INDEX).decode("utf-8", "ignore")
pages = []
for row in re.findall(r"<tr.*?</tr>", idx, re.S):
    t = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", row))
    m = re.search(r"第(\d+)回 (\d{4})年(\d+)月(\d+)日", t)
    if not m:
        continue
    d = datetime.date(int(m.group(2)), int(m.group(3)), int(m.group(4)))
    if (TODAY - d).days > 730:
        continue
    for u in re.findall(r'href="([^"]+newpage[^"]+)"', row):
        pages.append((m.group(1), u))

lists, rules = [], []
for no, u in pages:
    h = get(u, os.path.join(CACHE, f"{no}_{os.path.basename(u)}")).decode("utf-8", "ignore")
    for href, title in re.findall(r'href="([^"]+\.pdf)"[^>]*>([^<]*)', h):
        url = "https://www.mhlw.go.jp" + href if href.startswith("/") else href
        path = os.path.join(CACHE, f"{no}_{os.path.basename(href)}")
        if re.search(r"新規薬価収載", title):
            get(url, path)
            lists.append(path)
        elif re.search(r"１４日ルール|14日ルール|処方日数", title):
            get(url, path)
            rules.append(path)
print("新規収載の資料", len(lists), "例外の資料", len(rules))

# 2. 薬価基準の品名 → YJ
names, ynm = {}, {}
for f in sorted(glob.glob(os.path.join(SRC, "tp*_0[123]_*.xlsx"))):
    ws = openpyxl.load_workbook(f, read_only=True, data_only=True).worksheets[0]
    for r in ws.iter_rows(values_only=True):
        if r and r[1] and re.fullmatch(r"[0-9A-Z]{12}", str(r[1])) and r[7]:
            names.setdefault(norm(r[7]), []).append(str(r[1]))
            ynm[str(r[1])] = re.sub(r"\s+", " ", unicodedata.normalize("NFKC", str(r[7]))).strip()
by_len = sorted(names, key=len, reverse=True)

# 3. 新医薬品一覧表：ページごとに収載日と、表の1列目（銘柄名）
items = {}  # yj -> [収載日, 名前]
unmatched = []
for path in lists:
    last_d = None
    n = int(re.search(r"Pages:\s+(\d+)", subprocess.run(["pdfinfo", path], capture_output=True).stdout.decode()).group(1))
    for pg in range(1, n + 1):
        t = pdftext(path, True, pg)
        flat = norm(t)
        if "銘柄名" not in flat:
            continue
        m = re.search(r"新医薬品一覧表[（(](令和[^）)]*?)収載予定", flat)
        d = wareki(m.group(1)) if m else None
        if not d:
            # 表の続きのページ：前のページの日付
            d = last_d
        last_d = d
        if not d:
            continue
        toks, prev = [], None
        for line in t.splitlines():
            if not line.strip() or "銘柄名" in line:
                continue
            mm = re.match(r"^\s{0,3}(\d{1,3})?\s{0,3}(\S+)(?: (\S+))?", line)
            if not mm:
                continue
            tok = norm(mm.group(2))
            # 名前の中に空白が1つ入っていることがある（「…オートインジェク ター」）
            if mm.group(3) and tok not in names and norm(tok + mm.group(3)) in names:
                tok = norm(tok + mm.group(3))
            # 行の頭が名前の続き（「ター」など）なら前の名前につなぐ
            if prev and not mm.group(1) and len(tok) <= 4 and not re.search(r"\d", tok):
                toks[-1] = toks[-1] + tok
                continue
            toks.append(tok)
            prev = tok
        for tok in toks:
            if len(tok) < 4 or not re.search(r"[錠剤注液散粒ルムプ用]", tok):
                continue
            hit = names.get(tok)
            if not hit and len(tok) >= 8:
                hit = [y for k in by_len if k.startswith(tok) for y in names[k]]
            if not hit:
                unmatched.append((d.isoformat(), tok))
                continue
            for y in hit:
                if y not in items or items[y][0] < d:
                    items[y] = [d, tok]

# 4. 例外的な取扱い：「○○（及び○○）」について … 例外的に、「処方日数制限を１４日間ではなく３０日間…」／「…制限は設けない…」
special = {}  # 名前（norm）-> 日数（0＝制限なし）
for path in rules:
    s = norm(pdftext(path))
    for m in re.finditer(r"[2-9][.．]「([^」]{2,80})」について(.{0,400}?)例外的に、?「([^」]+)」", s):
        rule = m.group(3)
        days = 0 if "設けない" in rule else int(unicodedata.normalize("NFKC", re.search(r"ではなく(\S+?)日間", rule).group(1)))
        for nm in re.split(r"及び|、", m.group(1)):
            special[norm(nm)] = days
print("例外", special)

out = {}
for y, (d, tok) in items.items():
    days = 14
    for nm, dd in special.items():
        if tok.startswith(nm) or nm.startswith(tok) or nm in tok:
            days = dd
    u = lift_date(d)
    if u < KEEP_FROM:
        continue
    out[y] = {"m": ynm.get(y, tok), "d": d.isoformat(), "u": u.isoformat(), "n": days}

data = {
    "source": "厚生労働省 中央社会保険医療協議会 総会の資料（新医薬品一覧表・14日ルールの例外的な取扱い）、%s 時点" % TODAY.isoformat(),
    "items": dict(sorted(out.items())),
}
with open(OUT, "w", encoding="utf-8") as fp:
    json.dump(data, fp, ensure_ascii=False, separators=(",", ":"))
print("品目", len(out), "（制限中", sum(1 for v in out.values() if v["u"] > TODAY.isoformat()), "）", "突き合わせできなかった名前", len(unmatched))
for d, t in unmatched:
    print("  ?", d, t)
