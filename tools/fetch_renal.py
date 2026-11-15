# 腎機能で用量調節・禁忌がある薬の一覧（data/renal_drugs.json）を PMDA の電子添文から作るスクリプト。
# 添付文書の「禁忌」「用法及び用量」「用法及び用量に関連する注意」「9.2 腎機能障害患者」のうち、
# クレアチニン・CCr・eGFR などの数値の基準を含む項目だけを、文言を変えずに抜き出す。
# 用量の決まりが無く、薬物動態（16.6）にだけ CCr などが書かれている薬も（参考）として載せる。
# 使い方：python3 tools/fetch_renal.py   （www.pmda.go.jp に接続できる環境で。1秒に1回だけ問い合わせる）
import json, os, re, sys, time, html, zipfile, subprocess, urllib.parse, tempfile, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "data", "renal_drugs.json")
CACHE = os.path.join(tempfile.gettempdir(), "pmda_renal_cache")
os.makedirs(CACHE, exist_ok=True)
COOKIE = os.path.join(CACHE, "cookie")

# （分類, 検索する販売名）。調剤薬局・在宅でよく使う内服・外用薬
CANDIDATES = {
    "抗凝固薬": ["エリキュース", "リクシアナ", "イグザレルト", "プラザキサ"],
    "糖尿病薬": ["メトグルコ", "ジャヌビア", "グラクティブ", "エクア", "ネシーナ", "スイニー", "オングリザ", "ザファテック",
               "マリゼブ", "テネリア", "トラゼンタ", "フォシーガ", "ジャディアンス", "カナグル", "スーグラ", "ルセフィ", "デベルザ",
               "スターシス", "ファスティック", "グルファスト", "シュアポスト", "アマリール", "グリミクロン", "エクメット", "イニシンク",
               "メタクト", "リベルサス"],
    "鎮痛・神経障害性疼痛": ["リリカ", "タリージェ", "サインバルタ", "トラマール", "トラムセット", "ワントラム", "タペンタ",
                    "オキシコンチン", "MSコンチン", "ロキソニン", "セレコックス", "カロナール"],
    "抗ウイルス薬": ["バルトレックス", "ファムビル", "ゾビラックス", "タミフル", "パキロビッド", "ゾコーバ", "ラゲブリオ",
                "バラクルード", "ベムリディ", "ビリアード"],
    "抗菌薬・抗真菌薬": ["クラビット", "シプロキサン", "グレースビット", "ジェニナック", "オゼックス", "バクタ", "クラリス",
                   "ケフレックス", "ケフラール", "サワシリン", "オーグメンチン", "セフゾン", "フロモックス", "メイアクト", "ファロム",
                   "ジフルカン", "ラミシール"],
    "痛風・高尿酸血症": ["ザイロリック", "フェブリク", "ウリアデック", "コルヒチン"],
    "脂質異常症": ["クレストール", "リバロ", "ベザトール", "リピディル", "トライコア", "パルモディア"],
    "循環器": ["ジゴシン", "サンリズム", "シベノール", "リスモダン", "ソタコール", "タンボコール", "テノーミン", "セララ",
             "アルダクトン", "ミネブロ", "エンレスト", "ベリキューボ", "サムスカ", "シロスタゾール", "プレタール"],
    "胃腸薬": ["ガスター", "アシノン", "プロテカジン", "アルタット", "プリンペラン"],
    "骨粗鬆症": ["アクトネル", "ベネット", "フォサマック", "ボナロン", "ボノテオ", "リカルボン", "ボンビバ"],
    "泌尿器": ["ベシケア", "ベタニス", "ザルティア", "シアリス", "トビエース", "ウリトス", "ステーブラ", "バップフォー",
             "ミニリンメルト", "ユリーフ"],
    "精神・神経": ["リーマス", "ドグマチール", "インヴェガ", "リスパダール", "トレドミン", "イーケプラ", "ビムパット", "トピナ",
               "ガバペン", "ビ・シフロール", "ミラペックス", "シンメトレル", "メマリー", "レミニール", "ギャバロン", "テルネリン",
               "デパケン", "ラミクタール", "ルネスタ", "ベルソムラ"],
    "抗アレルギー薬": ["ジルテック", "ザイザル", "タリオン", "アレロック", "アレグラ", "ビラノア", "デザレックス", "ルパフィン"],
    "その他": ["リウマトレックス", "メトレート", "ダイアモックス", "ウラリット", "ネキシウム", "エベレンゾ", "ダーブロック",
             "リオナ", "ホスレノール", "フォスリボール", "カリメート", "ロケルマ", "ジャクスタピッド", "ゼチーア", "スピリーバ"],
}

KEY = re.compile(r"クレアチニン|CLcr|CLCR|Ccr|CCr|CCR|eGFR|GFR|mL/min|mL/分|ｍL/min")


def run_curl(cmd):
    # 接続が切れることがあるので数回やり直す
    for i in range(4):
        time.sleep(1.0 + i * 5)
        if subprocess.run(cmd).returncode == 0:
            return
    raise RuntimeError("PMDA に接続できません: " + " ".join(cmd[-3:]))


def curl(args, out):
    run_curl(["curl", "-sS", "-b", COOKIE, "-c", COOKIE, "-o", out] + args)
    return open(out, encoding="utf-8", errors="ignore").read()


def form_data(page, **over):
    form = page[page.index('<form id="iyakuSearchForm"'):]
    form = form[:form.index("</form>")]
    data = []
    for m in re.finditer(r"<input([^>]*)>", form):
        a = m.group(1)
        g = lambda k: (re.search(k + r'="([^"]*)"', a) or [None, None])[1]
        name, typ, val = g("name"), (g("type") or "text").lower(), g("value") or ""
        if not name or typ in ("submit", "button", "image", "reset"):
            continue
        if typ in ("checkbox", "radio") and "checked" not in a:
            continue
        data.append((name, html.unescape(val)))
    for m in re.finditer(r'<select[^>]*name="([^"]+)"[^>]*>(.*?)</select>', form, re.S):
        opts = re.findall(r"<option([^>]*)>", m.group(2))
        sel = [o for o in opts if "selected" in o] or opts[:1]
        v = re.search(r'value="([^"]*)"', sel[0]) if sel else None
        data.append((m.group(1), html.unescape(v.group(1)) if v else ""))
    data = [(k, over.pop(k, v)) for k, v in data] + list(over.items())
    return urllib.parse.urlencode(data)


SEARCH_PAGE = None


def search(word):
    global SEARCH_PAGE
    f = os.path.join(CACHE, "s_" + re.sub(r"[^\w]", "_", word) + ".html")
    if os.path.exists(f):
        return open(f, encoding="utf-8", errors="ignore").read()
    if SEARCH_PAGE is None:
        SEARCH_PAGE = curl(["https://www.pmda.go.jp/PmdaSearch/iyakuSearch/"], os.path.join(CACHE, "search.html"))
    body = form_data(SEARCH_PAGE, nameWord=word, ListRows="100", **{"dispColumnsList[0]": "1", "btnA": "検索"})
    bf = os.path.join(CACHE, "body.txt")
    open(bf, "w").write(body)
    return curl(["-X", "POST", "https://www.pmda.go.jp/PmdaSearch/iyakuSearch", "--data", "@" + bf], f)


def rows(page):
    out = []
    for m in re.finditer(r"<tr class='TrColor0\d'>(.*?)</tr>", page, re.S):
        tds = re.findall(r"<td>(.*?)</td>", m.group(1), re.S)
        code = re.search(r'detailDisp\("PmdaSearch", "([^"]+)"\)', m.group(1))
        if len(tds) < 2 or not code:
            continue
        generic = html.unescape(re.sub(r"<[^>]+>", "", tds[0])).strip()
        names = html.unescape(re.sub(r"<[^>]+>", "", tds[1])).strip()
        out.append((generic, names, code.group(1)))
    return out


def xml(code):
    f = os.path.join(CACHE, "x_" + code + ".zip")
    if not os.path.exists(f):
        run_curl(["curl", "-sS", "-o", f, "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/ResultDataSetXML/" + code])
    z = zipfile.ZipFile(f)
    return z.read([n for n in z.namelist() if n.endswith(".xml")][0]).decode("utf-8")


def _plain(x):
    x = re.sub(r"<\?enter\?>", "／", x)
    x = re.sub(r"<[^>]+>", "", x)
    return html.unescape(x).strip()


def to_text(frag):
    t = re.sub(r'<Lang[^>]*xml:lang="en"[^>]*>.*?</Lang>', "", frag, flags=re.S)
    t = re.sub(r"<HeaderRef[^>]*/>", "", t)
    t = re.sub(r"\s+", " ", t)
    # 表は1行ずつ「セル ｜ セル」にする
    def table(m):
        lines = []
        for row in re.findall(r"<SimpTblRow\b.*?</SimpTblRow>", m.group(0)):
            cells = [re.sub(r"\s+", " ", _plain(c)) for c in re.findall(r"<SimpTblCell\b.*?</SimpTblCell>", row)]
            lines.append(" ｜ ".join(cells))
        return "\n" + "\n".join(lines) + "\n"
    t = re.sub(r"<SimpleTable\b.*?</SimpleTable>", table, t)
    t = re.sub(r"</Header>|</Detail>|</Item>", "\n", t)
    t = re.sub(r"<\?enter\?>", "\n", t)
    t = re.sub(r"<[^>]+>", "", t)
    t = html.unescape(t)
    lines = [re.sub(r"[ \t\u3000]+", " ", l).strip() for l in t.split("\n")]
    t = "\n".join(l for l in lines if l and l not in (",", "、"))
    t = re.sub(r"(\s*,)+$", "", t, flags=re.M)
    return t.strip()


def items(seg):
    # 一番外側の <Item> ごとに分ける（入れ子は親にまとめる）
    out, depth, start = [], 0, None
    for m in re.finditer(r"<Item\b[^>]*?(/?)>|</Item>", seg):
        if m.group(0).startswith("</"):
            depth -= 1
            if depth == 0 and start is not None:
                out.append(seg[start:m.end()])
                start = None
        elif m.group(1) != "/":
            if depth == 0:
                start = m.start()
            depth += 1
    return out or [seg]


SECTIONS = [("ContraIndications", "禁忌"), ("EfficacyRelatedPrecautions", "効能又は効果に関連する注意"),
            ("InfoDoseAdmin", "用法及び用量"),
            ("InfoPrecautionsDosage", "用法及び用量に関連する注意"), ("ImportantPrecautions", "重要な基本的注意"),
            ("PatientsWithRenalImpairment", "9.2 腎機能障害患者"),
            ("SpecificPopulation", "（参考）16.6 薬物動態")]


def extract(s):
    found = []
    for tag, label in SECTIONS:
        m = re.search(r"<%s\b.*?</%s>" % (tag, tag), s, re.S)
        if not m:
            continue
        for it in items(m.group(0)):
            t = to_text(it)
            if KEY.search(unicodedata.normalize("NFKC", t)):
                found.append({"section": label, "text": t})
    return found


def norm(x):
    return unicodedata.normalize("NFKC", x).lower()


def main():
    result, missing, none = [], [], []
    for cat, words in CANDIDATES.items():
        for w in words:
            rs = rows(search(w))
            # 内服・外用（YJコード8桁目が A＝注射は除く）で、販売名に検索語を含むもの
            rs = [r for r in rs if norm(w) in norm(r[1]) and len(r[2].split("_")) > 1
                  and len(r[2].split("_")[1]) > 7 and r[2].split("_")[1][7] != "A"]
            if not rs:
                missing.append(w)
                continue
            # 規格・会社違いで記載が違うことがあるので、候補を見比べて腎機能の記載が一番多いものを使う
            best = None
            for generic, names, code in rs[:4]:
                e = extract(xml(code))
                score = sum(len(x["text"]) for x in e)
                if best is None or score > best[0]:
                    best = (score, generic, names, code, e)
            _, generic, names, code, ex = best
            if not ex:
                none.append(w)
                continue
            yj = code.split("_")[1]
            result.append({"category": cat, "name": w, "products": names, "generic": generic, "pmda": yj[:7], "excerpts": ex})
            print(w, "→", names[:40], len(ex), flush=True)
    out = {"source": "PMDA 電子添文（2026年11月取得）", "drugs": result}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print("掲載", len(result), "／見つからない", missing, "／腎機能の数値の記載なし", none)


if __name__ == "__main__":
    main()
