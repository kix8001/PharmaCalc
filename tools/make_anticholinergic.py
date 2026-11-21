# 日本版抗コリン薬リスクスケール（日本老年薬学会、第2版 2024年5月）のデータ data/anticholinergic.json を作る。
# 元：厚労省 第18回高齢者医薬品適正使用検討会 資料4-2（https://www.mhlw.go.jp/content/11125000/001266083.pdf）の
#     「4.4 日本版抗コリン薬リスクスケール」の表（薬効群・薬効群中分類・薬物・スコア・一般用医薬品の印）。158薬物。
# 使い方：python3 tools/make_anticholinergic.py
import json, os, re, subprocess, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "data", "anticholinergic.json")
URL = "https://www.mhlw.go.jp/content/11125000/001266083.pdf"
PDF = "/tmp/mhlw_newdrug_cache/001266083.pdf"

if not os.path.exists(PDF):
    os.makedirs(os.path.dirname(PDF), exist_ok=True)
    subprocess.run(["curl", "-sL", "-m", "90", "-o", PDF, URL], check=True)
t = subprocess.run(["pdftotext", "-layout", PDF, "-"], capture_output=True).stdout.decode("utf-8", "ignore")
t = t[t.index("4.4   日本版抗コリン薬リスクスケール") if "4.4   日本版抗コリン薬リスクスケール" in t else t.index("4.4") :]
t = t[: t.index("表 2 抗コリン薬リスクスケールの一覧")]

RE = re.compile(r"^\s*(\S+)\s{2,}(.+?)\s{2,}(\S+(?: \S+)?)\s{2,}([123])\s*([◯◎○〇])?\s*$")
nf = lambda x: unicodedata.normalize("NFKC", x).strip()
rows, cols = [], None
for line in t.splitlines():
    m = RE.match(line)
    if not m:
        # 前の行の続き（セルの中で折り返した文字）：列の位置で薬効群・中分類・薬物に足す
        if rows and cols and line.strip() and not re.search(r"スコア|一般用医薬品|品のみ", line):
            parts = [line[cols[0] : cols[1]], line[cols[1] : cols[2]], line[cols[2] : cols[3]]]
            for k, v in zip("gcn", parts):
                if v.strip():
                    rows[-1][k] += ("・" if k == "g" else "") + nf(v)
        else:
            cols = None if not line.strip() else cols
        continue
    group, sub, drug, score, mark = m.groups()
    cols = [0, m.start(2), m.start(3), m.start(4)]
    rows.append(
        {
            "g": nf(group),
            "c": nf(sub),
            "n": nf(drug),
            "s": int(score),
            # o: 1＝一般用医薬品だけ、2＝一般用医薬品と医療用医薬品、なし＝医療用医薬品だけ
            **({"o": 1 if mark in "◯○〇" else 2} if mark else {}),
        }
    )
from collections import Counter

print(len(rows), Counter(r["s"] for r in rows))
json.dump({"source": "日本老年薬学会「日本版抗コリン薬リスクスケール」第2版（2024年5月17日作成・5月22日追記）", "items": rows}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
