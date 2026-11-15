# PMDA の全医薬品（注射剤を除く）から、腎機能に関する記載がある薬を集めて data/renal_drugs.json を作る。
# 薬効分類（3桁）ごとに全製品を一覧し、成分（YJコード先頭7桁）ごとに1製品（先発品を優先）の電子添文を読む。
# 抜き出しの規則は fetch_renal.py の extract() と同じ。1秒に1回だけ問い合わせるので、全部で1〜2時間かかる。
# 途中で止まっても、取得済みのものはキャッシュから読むので、もう一度実行すれば続きから進む。
import json, os, re, sys, html, importlib.util

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("fr", os.path.join(HERE, "fetch_renal.py"))
fr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fr)
OUT = os.path.join(HERE, "..", "data", "renal_drugs.json")


def categories(page):
    i = page.find('name="effectValue"')
    seg = page[i:page.find("</select>", i)]
    return [(v, html.unescape(t).strip()) for v, t in re.findall(r'<option[^>]*value="(\d{3})"[^>]*>([^<]*)', seg)]


def list_category(code):
    """薬効分類の全製品（一般名, 販売名, 添付文書コード）"""
    cache = os.path.join(fr.CACHE, "cat_%s.json" % code)
    if os.path.exists(cache):
        return json.load(open(cache))
    body = fr.form_data(fr.SEARCH_PAGE, nameWord="", effectValue=code, ListRows="100",
                        **{"dispColumnsList[0]": "1", "btnA": "検索"})
    bf = os.path.join(fr.CACHE, "body.txt")
    open(bf, "w").write(body)
    first = fr.curl(["-X", "POST", "https://www.pmda.go.jp/PmdaSearch/iyakuSearch", "--data", "@" + bf],
                    os.path.join(fr.CACHE, "cat_page.html"))
    rows = fr.rows(first)
    m = re.search(r"検索結果(\d+)件／全(\d+)ページ", first)
    pages = int(m.group(2)) if m else 1
    for p in range(2, pages + 1):
        body = fr.form_data(first, pages=str(p))
        open(bf, "w").write(body)
        out = os.path.join(fr.CACHE, "cat_more.json")
        fr.curl(["-X", "POST", "https://www.pmda.go.jp/PmdaSearch/iyakuSearch/PageChangeRequest/%d" % p,
                 "--data", "@" + bf], out)
        try:
            rows += fr.rows(json.load(open(out, encoding="utf-8"))["ResultList"])
        except Exception as e:
            print("  ページ取得失敗", code, p, e, flush=True)
    json.dump(rows, open(cache, "w"), ensure_ascii=False)
    return rows


def short_name(names):
    # 「ボルタレン錠25mg／ボルタレンSRカプセル37.5mg」→ 先頭の販売名から規格を除いたもの
    n = names.split("／")[0]
    n = re.sub(r"[0-9０-９.．]+(mg|μg|g|mL|%|％|単位).*$", "", n)
    return n.strip() or names.split("／")[0]


def main():
    fr.SEARCH_PAGE = fr.curl(["https://www.pmda.go.jp/PmdaSearch/iyakuSearch/"], os.path.join(fr.CACHE, "search.html"))
    cats = categories(fr.SEARCH_PAGE)
    print(len(cats), "分類", flush=True)
    groups = {}  # YJ7 → [分類名, 一般名, [(販売名, code)]]
    for code, cname in cats:
        rows = list_category(code)
        print(code, cname, len(rows), flush=True)
        for generic, names, doc in rows:
            parts = doc.split("_")
            if len(parts) < 2 or re.search(r"注|点滴|透析用|造影|診断|検査用", names):
                continue
            yj7 = parts[1][:7]
            g = groups.setdefault(yj7, [cname, generic, []])
            g[2].append((names, doc))
    print(len(groups), "成分", flush=True)
    result, done = [], 0
    for yj7, (cname, generic, prods) in groups.items():
        # 先発品（販売名に「」が無いもの）を優先して最大2製品
        prods.sort(key=lambda x: ("「" in x[0], len(x[0])))
        best = None
        for names, doc in prods[:2]:
            try:
                ex, num = fr.extract(fr.xml(doc))
            except Exception as e:
                print("  取得失敗", names, e, flush=True)
                continue
            # 先発品（先頭）に腎機能の記載があればそれを使い、無いときだけ次の製品を見る
            best = (names, doc, ex, num)
            if ex:
                break
        done += 1
        if done % 50 == 0:
            print("…", done, "／", len(groups), "成分", len(result), "件", flush=True)
        if not best or not best[2]:
            continue
        names, doc, ex, num = best
        d = {"category": cname, "name": short_name(names), "products": names, "generic": generic, "pmda": yj7, "excerpts": ex}
        # 同じ成分の先発品の販売名（検索用）
        brands = sorted({short_name(n) for n, _ in prods if "「" not in n} - {d["name"]})
        if brands:
            d["aliases"] = "／".join(brands)
        if not num:
            d["noNumbers"] = True
        result.append(d)
    result.sort(key=lambda d: (d["category"], d["name"]))
    out = {"source": "PMDA 電子添文（2026年11月取得・全医薬品から）", "drugs": result}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print("掲載", len(result), "件", flush=True)


if __name__ == "__main__":
    main()
