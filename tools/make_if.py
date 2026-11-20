# インタビューフォーム（IF）から、粉砕・簡易懸濁・無包装の安定性の記載を抜き出して data/if.json を作る。
#
# IF の PDF は www.info.pmda.go.jp にある。リンクは make_handling.py が取った GeneralList の HTML から拾う
# （/tmp/pmda_handling_cache/{YJ7}.html。先に python3 tools/make_handling.py fetch を流しておく）。
# PDF は1つずつ落として pdftotext で文字にし、抜き出した結果だけを /tmp/pmda_if_cache/*.json に残す（PDF は消す）。
#
# 抜き出す項目（新しい記載要領の IF）
#   ⅩⅢ．備考 1．（1）粉砕／（2）崩壊・懸濁性及び経管投与チューブの通過性
#   Ⅳ．6．製剤の各種条件下における安定性 のうち、無包装・開放・分包などの試験の行
# 古い IF でこの見出しが無いときは「粉砕」を含む段落を拾う。
#
# 使い方：python3 tools/make_if.py fetch （取得。数時間）／ python3 tools/make_if.py （キャッシュから作る）
import glob, json, os, re, subprocess, sys, tempfile, time, unicodedata
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "data", "if.json")
GL = ["/tmp/pmda_handling_cache", "/tmp/pmda_limits_cache"]
CACHE = "/tmp/pmda_if_cache"
os.makedirs(CACHE, exist_ok=True)

NONE = re.compile(r"^(該当資料なし|該当しない|該当なし|なし|記載なし|資料なし)[。．]?$")


def norm(s):
    s = unicodedata.normalize("NFKC", s)
    s = re.sub(r"[ \t　]+", " ", s)
    return s


def if_links():
    """製品の YJ → IF の URL（注射剤は除く）"""
    out = {}
    for d in GL:
        for f in glob.glob(os.path.join(d, "*.html")):
            h = open(f, encoding="utf-8", errors="ignore").read()
            for u in re.findall(r"https://www\.info\.pmda\.go\.jp/go/interview/[0-9]/[^'\"]+?\.pdf", h):
                m = re.search(r"_(\d{7}[0-9A-Z]\d{4})_", u)
                if m and not "4" <= m.group(1)[4] <= "6":
                    out.setdefault(m.group(1), u)
    return out


def clip(s, n):
    s = s.strip()
    return s if len(s) <= n else s[: n - 1] + "…"


def heading(t, pat):
    """見出しの位置（目次の行＝点線やページ番号で終わる行は飛ばす）"""
    for m in re.finditer(pat, t):
        line = t[m.end(): t.find("\n", m.end()) if t.find("\n", m.end()) >= 0 else len(t)]
        nxt = t[m.end(): m.end() + 80]
        if re.search(r"(\.{3,}|…{2,}|·{3,}|・{3,})", line + nxt.split("\n")[1] if "\n" in nxt else line):
            continue
        return m
    return None


def block(t, start, ends, n):
    m = heading(t, start)
    if not m:
        return ""
    rest = t[m.end():]
    e = min([x.start() for x in (re.search(p, rest) for p in ends) if x] + [len(rest)])
    s = re.sub(r"\n\s*-\s*\d+\s*-\s*\n|\n\s*－\d+－\s*\n", "\n", rest[:e])
    s = re.sub(r"\s*\n\s*", " ", s).strip()
    s = re.sub(r"\s*-\s*\d+\s*-\s*[A-Z0-9-]*", " ", s).strip()
    return "" if NONE.match(s) else clip(s, n)


def extract(txt, lay):
    t = norm(txt)
    crush = block(t, r"[（(]?1[）)]\s*粉砕", [r"[（(]?2[）)]\s*(崩壊|経管)", r"\n\s*2\s*[.．]\s*その他"], 400)
    susp = block(t, r"[（(]?2[）)]\s*(崩壊・懸濁性|経管)[^\n]*", [r"\n\s*2\s*[.．]\s*その他", r"\n\s*製造販売"], 300)
    if not crush and "粉砕" in t and not re.search(r"[（(]1[）)]\s*粉砕", t):
        # 古い IF：「粉砕」を含む段落
        m = re.search(r"[^\n]*粉砕[^\n]*(\n[^\n]+){0,4}", t)
        if m:
            crush = clip(re.sub(r"\s*\n\s*", " ", m.group(0)), 500)
    # 無包装状態の安定性（一包化の判断材料）。表は文字にすると崩れるので、見出しの下の文をそのまま短く
    stab = block(t, r"無包装(状態)?(で|に)?(おける|の)?安定性[^\n]*", [r"\n\s*[(（]\d+[)）]\s*\S", r"\n\s*\d+\s*[.．]\s*\S", r"\n\s*[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]"], 300)
    bad = lambda v: not v or len(re.sub(r"[.．·・…\s\d]", "", v)) < 4
    return {k: v for k, v in (("c", crush), ("k", susp), ("s", stab)) if not bad(v)}


def one(u):
    name = os.path.basename(u).replace(".pdf", "")
    cf = os.path.join(CACHE, name + ".json")
    if os.path.exists(cf):
        return json.load(open(cf))
    with tempfile.TemporaryDirectory() as td:
        pdf = os.path.join(td, "a.pdf")
        time.sleep(0.3)
        r = subprocess.run(["curl", "-sSL", "--max-time", "120", "-A", "PharmaCalc/1.0", "-o", pdf, u])
        if r.returncode != 0 or not os.path.exists(pdf) or os.path.getsize(pdf) < 1000:
            return None
        try:
            txt = subprocess.run(["pdftotext", pdf, "-"], capture_output=True, timeout=120).stdout.decode("utf-8", "ignore")
            lay = subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True, timeout=120).stdout.decode("utf-8", "ignore")
        except Exception:
            return None
    rec = extract(txt, lay)
    json.dump(rec, open(cf, "w", encoding="utf-8"), ensure_ascii=False)
    return rec


def main():
    links = if_links()
    urls = sorted(set(links.values()))
    print("製品", len(links), "IF", len(urls), flush=True)
    if len(sys.argv) > 1 and sys.argv[1] == "fetch":
        with ThreadPoolExecutor(6) as ex:
            for n, _ in enumerate(ex.map(one, urls)):
                if n % 200 == 0:
                    print(n, "/", len(urls), flush=True)
    docs, idx, by_yj = [], {}, {}
    for yj, u in sorted(links.items()):
        cf = os.path.join(CACHE, os.path.basename(u).replace(".pdf", "") + ".json")
        if not os.path.exists(cf):
            continue
        rec = json.load(open(cf))
        rec["u"] = u.replace("https://www.info.pmda.go.jp/go/interview/", "")
        key = json.dumps(rec, ensure_ascii=False, sort_keys=True)
        if key not in idx:
            idx[key] = len(docs)
            docs.append(rec)
        by_yj[yj] = idx[key]
    out = {"source": "PMDA 掲載のインタビューフォーム（" + time.strftime("%Y年%m月%d日") + "取得）", "base": "https://www.info.pmda.go.jp/go/interview/", "docs": docs, "yj": by_yj}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    n = lambda k: sum(1 for d in docs if k in d)
    print("製品", len(by_yj), "IF", len(docs), "粉砕", n("c"), "懸濁", n("k"), "無包装", n("s"), os.path.getsize(OUT) // 1024, "KB")


if __name__ == "__main__":
    main()
