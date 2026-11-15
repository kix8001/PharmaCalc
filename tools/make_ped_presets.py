# 小児用量の初期登録データ（ped_presets.json）を作るスクリプト。
# 値は PMDA の電子添文（2026年11月取得）の用法及び用量と照合済み。小児用量の記載が無い薬・取得できなかった薬は basis="memo"。
# 変更したら `python3 tools/make_ped_presets.py` を実行して data/ped_presets.json を作り直す（iOS・Android 共通）。
import json, os

V = 5  # 初期登録の版。増やすと、既存ユーザーにも足りない薬が名前で追加される

def B(below, mn, mx=None, times=None, perKg=False, perDose=False):
    """below 歳（体重別なら kg）未満の用量。perKg=体重1kgあたり、perDose=1回量（既定は1日量）。1歳未満は小数（6か月=0.5）"""
    d = {"below": below, "min": mn, "max": mx if mx is not None else mn}
    if times: d["times"] = times
    if perKg: d["perKg"] = True
    if perDose: d["perDose"] = True
    return d

def drug(cat, name, ing, form, conc, basis, **kw):
    d = {"category": cat, "name": name, "ingredient": ing, "form": form, "conc": conc, "basis": basis}
    d.update(kw)
    return d

AB, AV, AL, CO, BR, GI, AN, OT, SU, TB, NA, EY, TO = (
    "抗菌薬", "抗ウイルス薬", "抗アレルギー・抗ヒスタミン", "鎮咳・去痰", "気管支拡張", "消化器", "解熱鎮痛",
    "その他の内服", "坐剤・貼付", "錠剤・カプセル", "点鼻", "点眼", "外用")
MEMO = "添付文書で用量を確認して、編集から登録してください"
ADULT = "添付文書の用量は成人のみ（小児用量の記載なし）。"
APAP = "投与間隔は4〜6時間以上。1日総量60mg/kgまで（成人量を超えない）"
TIPEPIDINE = [B(1, 5, 20), B(3, 10, 25), B(6, 15, 40)]
CIT = 60 / 66.5  # ヒベンズ酸塩→クエン酸塩
TIPE_NOTE = "用量はチペピジンクエン酸塩として（製剤の%はヒベンズ酸塩）。6歳以上は添付文書で確認"
TRANEXAMIC = [B(2, 75, 200), B(4, 150, 350), B(7, 250, 650), B(15, 400, 1000), B(200, 750, 2000)]
AMPC = dict(minPerKg=20, maxPerKg=40, times=3, maxDailyPerKg=90, note="1日3〜4回。1日最大90mg/kg")
EM = dict(minPerKg=25, maxPerKg=50, times=4, note="力価。1日4〜6回に分ける")
CAM = dict(minPerKg=10, maxPerKg=15, times=2, maxDailyMg=400, note="1日2〜3回に分ける。レジオネラ肺炎は15mg/kg/日。小児の1日量は成人量（400mg）まで")
KETO = dict(minPerKg=0.06, maxPerKg=0.06, times=2, note="朝食後と就寝前。年齢別の標準1日量：6か月〜3歳未満0.8mg、3〜7歳未満1.2mg、7歳以上2.0mg")
MEQ = dict(minPerKg=0.06, maxPerKg=0.06, times=2, note="アレルギー性鼻炎・じん麻疹・皮膚のかゆみ：1回0.06mg/kgを1日2回。気管支喘息は1回0.12mg/kg")
HYDROXYZINE = dict(minPerKg=1, maxPerKg=2, times=3, note="ヒドロキシジンパモ酸塩として。1日2〜3回")
TULO = dict(minPerKg=0.04, maxPerKg=0.04, times=2, note="1日2回。標準1日量：0.5〜3歳未満0.25〜0.5mg、3〜9歳未満0.5〜1mg、9〜15歳1〜2mg")
PROCA = dict(amountUnit="μg", bands=[B(6, 1.25, times=2, perKg=True, perDose=True), B(200, 25, times=2, perDose=True)],
             times=2, maxDoseMg=25, note="6歳未満：1回1.25μg/kgを1日2〜3回。6歳以上：1回25μgを1日1〜2回")
TRANILAST = dict(minPerKg=5, maxPerKg=5, times=3)
PEMI = [B(1, 0), B(5, 5), B(11, 10), B(200, 20)]
THEO = dict(bands=[B(6, 0), B(16, 4, 5, times=2, perKg=True, perDose=True)], times=2, maxDoseMg=200,
            note="添付文書：小児1回100〜200mgを1日2回。6〜15歳は1回4〜5mg/kgを1日2回で開始（添付文書が参考に挙げるガイドライン）。6歳未満はガイドラインで確認。血中濃度に注意")

presets = [
    # ---- 抗菌薬 ----
    drug(AB, "サワシリン細粒10%", "アモキシシリン", "powder", 100, "day", **AMPC),
    drug(AB, "ワイドシリン細粒10%", "アモキシシリン", "powder", 100, "day", **AMPC),
    drug(AB, "ワイドシリン細粒20%", "アモキシシリン", "powder", 200, "day", **AMPC),
    drug(AB, "クラバモックス小児用配合ドライシロップ", "アモキシシリン（＋クラブラン酸）", "powder", 594.06, "day",
         minPerKg=90, maxPerKg=90, times=2, note="アモキシシリンとして90mg/kg/日（クラブラン酸6.4mg/kg/日）を1日2回、12時間ごと食直前。分包の目安：6〜10kg 1.01g、11〜16kg 2.02g、17〜23kg 3.03g、24〜30kg 4.04g、31〜36kg 5.05g、37〜39kg 6.06g（1日量）"),
    drug(AB, "オラスポア小児用ドライシロップ10%", "セフロキサジン", "powder", 100, "day", minPerKg=30, maxPerKg=30, times=3),
    drug(AB, "ケフラール細粒小児用100mg", "セファクロル", "powder", 100, "day", minPerKg=20, maxPerKg=40, times=3),
    drug(AB, "ケフレックスシロップ用細粒100", "セファレキシン", "powder", 100, "day", minPerKg=25, maxPerKg=50, times=4,
         note="6時間ごと。重症では50〜100mg/kg/日"),
    drug(AB, "ケフレックスシロップ用細粒200", "セファレキシン", "powder", 200, "day", minPerKg=25, maxPerKg=50, times=4,
         note="6時間ごと。重症では50〜100mg/kg/日"),
    drug(AB, "セフゾン細粒小児用10%", "セフジニル", "powder", 100, "day", minPerKg=9, maxPerKg=18, times=3),
    drug(AB, "トミロン細粒小児用10%", "セフテラム ピボキシル", "powder", 100, "day", minPerKg=9, maxPerKg=18, times=3),
    drug(AB, "トミロン細粒小児用20%", "セフテラム ピボキシル", "powder", 200, "day", minPerKg=9, maxPerKg=18, times=3),
    drug(AB, "バナンドライシロップ5%", "セフポドキシム プロキセチル", "powder", 50, "dose", minPerKg=3, maxPerKg=3, times=2,
         note="1回3mg/kgを1日2〜3回。重症では1回4.5mg/kgを1日3回"),
    drug(AB, "フロモックス小児用細粒100mg", "セフカペン ピボキシル", "powder", 100, "dose", minPerKg=3, maxPerKg=3, times=3),
    drug(AB, "メイアクトMS小児用細粒10%", "セフジトレン ピボキシル", "powder", 100, "dose", minPerKg=3, maxPerKg=3, times=3,
         maxDoseMg=200, note="必要に応じて1回6mg/kgまで（1回200mgまで）"),
    drug(AB, "エリスロシンW顆粒20%", "エリスロマイシン", "powder", 200, "day", **EM),
    drug(AB, "エリスロシンドライシロップW20%", "エリスロマイシン", "powder", 200, "day", **EM),
    drug(AB, "エリスロシンドライシロップ10%", "エリスロマイシン", "powder", 100, "day", **EM),
    drug(AB, "クラリシッドドライシロップ10%", "クラリスロマイシン", "powder", 100, "day", **CAM),
    drug(AB, "クラリスドライシロップ10%", "クラリスロマイシン", "powder", 100, "day", **CAM),
    drug(AB, "ジスロマック細粒小児用10%", "アジスロマイシン", "powder", 100, "day", minPerKg=10, maxPerKg=10, times=1,
         maxDailyMg=500, note="1日1回3日間"),
    drug(AB, "ファロムドライシロップ小児用10%", "ファロペネム", "powder", 100, "dose", minPerKg=5, maxPerKg=5, times=3,
         maxDoseMg=300, note="増量は1回10mg/kgまで。年長児は成人上限（1回300mg・1日900mg）を超えない"),
    drug(AB, "オラペネム小児用細粒10%", "テビペネム ピボキシル", "powder", 100, "dose", minPerKg=4, maxPerKg=4, times=2,
         note="必要に応じて1回6mg/kgまで"),
    drug(AB, "ホスミシンドライシロップ400", "ホスホマイシン", "powder", 400, "day", minPerKg=40, maxPerKg=120, times=3,
         note="1日3〜4回に分ける"),
    drug(AB, "ホスミシンドライシロップ200", "ホスホマイシン", "powder", 200, "day", minPerKg=40, maxPerKg=120, times=3,
         note="1日3〜4回に分ける"),
    drug(AB, "オゼックス細粒小児用15%", "トスフロキサシン", "powder", 150, "dose", minPerKg=6, maxPerKg=6, times=2,
         maxDoseMg=180, maxDailyMg=360, note="1回180mg・1日360mgを超えない"),
    drug(AB, "ミノマイシン顆粒2%", "ミノサイクリン", "powder", 20, "day", minPerKg=2, maxPerKg=4, times=2,
         note="1日1〜2回。8歳未満は他剤を優先（歯の着色）"),
    # ---- 抗ウイルス薬 ----
    drug(AV, "アシクロビルドライシロップ80%", "アシクロビル", "powder", 800, "dose", minPerKg=20, maxPerKg=20, times=4,
         maxDoseMg=800, note="水痘：1回20mg/kgを1日4回（1回800mgまで）。単純疱疹は1回200mgまで"),
    drug(AV, "ゾビラックス顆粒40%", "アシクロビル", "powder", 400, "dose", minPerKg=20, maxPerKg=20, times=4,
         maxDoseMg=800, note="水痘：1回20mg/kgを1日4回（1回800mgまで）。単純疱疹は1回200mgまで"),
    drug(AV, "バルトレックス顆粒50%", "バラシクロビル", "powder", 500, "dose", minPerKg=25, maxPerKg=25, times=3,
         maxDoseMg=1000, note="水痘・帯状疱疹：1回25mg/kgを1日3回（1回1000mgまで）。単純疱疹は1日2回・1回500mgまで"),
    drug(AV, "タミフルドライシロップ3%", "オセルタミビル", "powder", 30, "age",
         bands=[B(1, 3, times=2, perKg=True, perDose=True), B(200, 2, times=2, perKg=True, perDose=True)], times=2,
         maxDoseMg=75, note="治療：1日2回5日間。新生児・乳児（1歳未満）は1回3mg/kg、幼小児は1回2mg/kg（1回75mgまで）。予防（幼小児）：1回2mg/kgを1日1回10日間"),
    drug(AV, "イナビル吸入粉末剤20mg", "ラニナミビル", "other", 20, "age", unit="容器",
         bands=[B(10, 20, times=1), B(200, 40, times=1)], times=1, note="単回吸入。10歳未満20mg（1容器）、10歳以上40mg（2容器）"),
    drug(AV, "リレンザ", "ザナミビル", "other", 5, "age", unit="ブリスター", bands=[B(200, 20, times=2)], times=2,
         note="1回10mg（2ブリスター）を1日2回、5日間吸入"),
    drug(AV, "ゾフルーザ（錠・顆粒）", "バロキサビル マルボキシル", "other", 0, "weight",
         bands=[B(10, 1, times=1, perKg=True), B(20, 10, times=1), B(40, 20, times=1), B(80, 40, times=1), B(500, 80, times=1)], times=1,
         note="単回。12歳未満：10kg未満は顆粒で1mg/kg、10〜20kg 10mg、20〜40kg 20mg、40kg以上 40mg。12歳以上：80kg未満40mg、80kg以上80mg。顆粒2%分包は1包0.5g＝10mg"),
    # ---- 抗アレルギー・抗ヒスタミン ----
    drug(AL, "アタラックスPドライシロップ2.5%", "ヒドロキシジン", "powder", 25, "day", **HYDROXYZINE),
    drug(AL, "アタラックスP散10%", "ヒドロキシジン", "powder", 100, "day", **HYDROXYZINE),
    drug(AL, "アタラックスPシロップ0.5%", "ヒドロキシジン", "syrup", 5, "day", **HYDROXYZINE),
    drug(AL, "アレロック顆粒0.5%", "オロパタジン", "powder", 5, "age", bands=[B(2, 0), B(7, 5), B(200, 10)], times=2,
         note="2〜7歳未満 1回2.5mg、7歳以上 1回5mg を1日2回"),
    drug(AL, "アレギサールドライシロップ0.5%", "ペミロラスト", "powder", 5, "age", bands=PEMI, times=2,
         note="気管支喘息：1〜5歳未満 1回2.5mg、5〜11歳未満 1回5mg、11歳以上 1回10mg を1日2回（1回0.2mg/kg）。アレルギー性鼻炎はその半量"),
    drug(AL, "ペミラストンドライシロップ0.5%", "ペミロラスト", "powder", 5, "age", bands=PEMI, times=2,
         note="気管支喘息：1〜5歳未満 1回2.5mg、5〜11歳未満 1回5mg、11歳以上 1回10mg を1日2回（1回0.2mg/kg）。アレルギー性鼻炎はその半量"),
    drug(AL, "フェキソフェナジンドライシロップ6%", "フェキソフェナジン", "powder", 60, "age",
         bands=[B(0.5, 0), B(2, 30), B(12, 60), B(200, 120)], times=2,
         note="6か月〜2歳未満 1回15mg、2〜12歳未満 1回30mg、12歳以上 1回60mg を1日2回"),
    drug(AL, "クラリチンドライシロップ1%", "ロラタジン", "powder", 10, "age", bands=[B(3, 0), B(7, 5, times=1), B(200, 10, times=1)],
         times=1, note="3〜7歳未満 5mg、7歳以上 10mg を1日1回食後"),
    drug(AL, "セチリジン塩酸塩DS1.25%", "セチリジン", "powder", 12.5, "age",
         bands=[B(2, 0), B(7, 5, times=2), B(15, 10, times=2), B(200, 10, times=1)], times=2,
         note="2〜7歳未満 1回2.5mg、7〜15歳未満 1回5mg を1日2回。15歳以上は成人量"),
    drug(AL, "レボセチリジン塩酸塩ドライシロップ0.5%", "レボセチリジン", "powder", 5, "age",
         bands=[B(0.5, 0), B(1, 1.25, times=1), B(7, 2.5, times=2), B(15, 5, times=2), B(200, 5, times=1)], times=2,
         note="6か月〜1歳未満 1回1.25mgを1日1回、1〜7歳未満 1回1.25mgを1日2回、7〜15歳未満 1回2.5mgを1日2回"),
    drug(AL, "ザイザルシロップ0.05%", "レボセチリジン", "syrup", 0.5, "age",
         bands=[B(0.5, 0), B(1, 1.25, times=1), B(7, 2.5, times=2), B(15, 5, times=2), B(200, 5, times=1)], times=2,
         note="6か月〜1歳未満 1回1.25mgを1日1回、1〜7歳未満 1回1.25mgを1日2回、7〜15歳未満 1回2.5mgを1日2回"),
    drug(AL, "キプレス細粒4mg", "モンテルカスト", "other", 4, "age", unit="包", bands=[B(1, 0), B(6, 4, times=1)], times=1,
         note="1〜6歳未満 4mgを1日1回就寝前。6歳以上はチュアブル錠5mg"),
    drug(AL, "オノンドライシロップ10%", "プランルカスト", "powder", 100, "day", minPerKg=7, maxPerKg=7, times=2,
         maxDailyMg=450, maxDailyPerKg=10, note="朝・夕食後。1日最高10mg/kg（成人量450mg/日を超えない）"),
    drug(AL, "ケトチフェンドライシロップ0.1%", "ケトチフェン", "powder", 1, "day", **KETO),
    drug(AL, "ザジテンシロップ0.02%（ジキリオンシロップ0.02%）", "ケトチフェン", "syrup", 0.2, "day", **KETO),
    drug(AL, "ゼスラン小児用細粒0.6%（ニポラジン小児用細粒0.6%）", "メキタジン", "powder", 6, "dose", **MEQ),
    drug(AL, "ゼスランシロップ0.03%（ニポラジンシロップ0.03%）", "メキタジン", "syrup", 0.3, "dose", **MEQ),
    drug(AL, "オキサトミドドライシロップ2%", "オキサトミド", "powder", 20, "dose", minPerKg=0.5, maxPerKg=0.5, times=2,
         note="1回0.5mg/kgを1日2回。1回最高0.75mg/kg"),
    drug(AL, "クレマスチンドライシロップ0.1%", "クレマスチン", "powder", 1, "memo", note=ADULT + "成人1日2mgを2回"),
    drug(AL, "ペリアクチン散1%", "シプロヘプタジン", "powder", 10, "memo", note=ADULT + "成人1回4mgを1日1〜3回"),
    drug(AL, "ペリアクチンシロップ0.04%", "シプロヘプタジン", "syrup", 0.4, "memo", note=ADULT + "成人1回4mgを1日1〜3回"),
    drug(AL, "ポララミンドライシロップ0.2%", "d-クロルフェニラミン", "powder", 2, "memo", note=ADULT + "成人1回2mgを1日1〜4回"),
    drug(AL, "ポララミンシロップ0.04%", "d-クロルフェニラミン", "syrup", 0.4, "memo", note=ADULT + "成人1回2mgを1日1〜4回"),
    drug(AL, "リザベン細粒10%", "トラニラスト", "powder", 100, "day", **TRANILAST),
    drug(AL, "リザベンドライシロップ5%", "トラニラスト", "powder", 50, "day", **TRANILAST),
    drug(AL, "リンデロン散0.1%", "ベタメタゾン", "powder", 1, "age", bands=[B(200, 0.15, 4)], times=2, note="小児：1日0.15〜4mgを1〜4回に分ける"),
    drug(AL, "リンデロンシロップ0.01%", "ベタメタゾン", "syrup", 0.1, "age", bands=[B(200, 0.15, 4)], times=2, note="小児：1日0.15〜4mgを1〜4回に分ける"),
    drug(AL, "デカドロンエリキシル0.01%", "デキサメタゾン", "syrup", 0.1, "memo", note=MEMO + "（エリキシルの添付文書を取得できなかった）"),
    drug(AL, "セレスタミン配合シロップ", "ベタメタゾン・d-クロルフェニラミン", "syrup", 0, "memo", note="小児：1回5mLを1日1〜4回。漫然と使わない"),
    # ---- 鎮咳・去痰 ----
    drug(CO, "アスベリンドライシロップ2%", "チペピジンクエン酸塩として", "powder", round(20 * CIT, 3), "age", bands=TIPEPIDINE, times=3, note=TIPE_NOTE),
    drug(CO, "アスベリン散10%", "チペピジンクエン酸塩として", "powder", round(100 * CIT, 3), "age", bands=TIPEPIDINE, times=3, note=TIPE_NOTE),
    drug(CO, "アスベリンシロップ0.5%", "チペピジンクエン酸塩として", "syrup", round(5 * CIT, 3), "age", bands=TIPEPIDINE, times=3, note=TIPE_NOTE),
    drug(CO, "アストミン散10%", "ジメモルファン", "powder", 100, "age", bands=[B(8, 0), B(15, 30)], times=3, note="8〜14歳：1回10mgを1日3回"),
    drug(CO, "アストミンシロップ0.25%", "ジメモルファン", "syrup", 2.5, "age", bands=[B(2, 7.5, 11.25), B(4, 12.5, 20), B(7, 20, 27.5), B(15, 30, 35)], times=3, note="1日量を3回に分ける"),
    drug(CO, "メジコン散10%", "デキストロメトルファン", "powder", 100, "memo", note=MEMO),
    drug(CO, "メジコン配合シロップ", "デキストロメトルファン配合", "syrup", 0, "age", amountUnit="mL",
         bands=[B(0.25, 0), B(8, 3, 8), B(15, 9, 16), B(200, 18, 24)], times=3,
         note="製剤量（mL）。3か月〜7歳 1日3〜8mL、8〜14歳 1日9〜16mL を3〜4回に分ける"),
    drug(CO, "フスコデ配合シロップ", "ジヒドロコデイン配合", "syrup", 0, "memo", note="12歳未満は禁忌。12歳以上15歳未満は成人量（1日10mLを3回）の2/3"),
    drug(CO, "ムコダイン細粒DS50%", "カルボシステイン", "powder", 500, "day", minPerKg=30, maxPerKg=30, times=3,
         note="1回10mg/kgを1日3回"),
    drug(CO, "ムコダインシロップ5%（カルボシステインシロップ5%）", "カルボシステイン", "syrup", 50, "day", minPerKg=30, maxPerKg=30,
         times=3, note="1回10mg/kgを1日3回"),
    drug(CO, "ムコソルバンドライシロップ1.5%", "アンブロキソール", "powder", 15, "day", minPerKg=0.9, maxPerKg=0.9, times=3),
    drug(CO, "ムコソルバンシロップ0.3%（プルスマリンAシロップ0.3%）", "アンブロキソール", "syrup", 3, "day",
         minPerKg=0.9, maxPerKg=0.9, times=3),
    drug(CO, "レフトーゼシロップ0.5%", "リゾチーム", "syrup", 5, "memo", note=MEMO + "（PMDAで添付文書が見つからない。販売終了の可能性）"),
    # ---- 気管支拡張 ----
    drug(BR, "テオドールドライシロップ20%", "テオフィリン", "powder", 200, "age", **THEO),
    drug(BR, "テオドールシロップ2%", "テオフィリン", "syrup", 20, "age", **THEO),
    drug(BR, "ベラチンドライシロップ小児用0.1%", "ツロブテロール", "powder", 1, "day", **TULO),
    drug(BR, "ホクナリンドライシロップ0.1%小児用", "ツロブテロール", "powder", 1, "day", **TULO),
    drug(BR, "メプチン顆粒0.01%", "プロカテロール", "powder", 100, "age", **PROCA),
    drug(BR, "メプチンドライシロップ0.005%", "プロカテロール", "powder", 50, "age", **PROCA),
    drug(BR, "メプチンシロップ5μg/mL", "プロカテロール", "syrup", 5, "age", **PROCA),
    drug(BR, "ベネトリンシロップ0.04%", "サルブタモール", "syrup", 0.4, "day", minPerKg=0.3, maxPerKg=0.3, times=3),
    drug(BR, "ベロテックシロップ0.05%", "フェノテロール", "syrup", 0.5, "day", minPerKg=0.375, maxPerKg=0.375, times=3),
    # ---- 消化器 ----
    drug(GI, "ナウゼリンドライシロップ1%", "ドンペリドン", "powder", 10, "age",
         bands=[B(6, 1, 2, perKg=True), B(200, 1, perKg=True)], times=3, maxDailyMg=30,
         note="1日1〜2mg/kgを3回、食前。1日30mgを超えない。6歳以上は1日最高1mg/kg"),
    drug(GI, "プリンペランシロップ0.1%", "メトクロプラミド", "syrup", 1, "day", minPerKg=0.38, maxPerKg=0.53, times=2,
         note="1日2〜3回、食前。錐体外路症状に注意"),
    drug(GI, "ロペラミド塩酸塩細粒小児用0.05%", "ロペラミド", "powder", 0.5, "age", bands=[B(0.5, 0), B(200, 0.02, 0.04, perKg=True)], times=2,
         note="1日2〜3回。6か月未満は禁忌、2歳未満は原則使わない"),
    drug(GI, "酸化マグネシウム原末", "酸化マグネシウム", "powder", 1000, "memo", note=ADULT + "緩下剤として成人1日2gを3回または就寝前1回"),
    drug(GI, "モビコール配合内用剤LD", "マクロゴール4000配合", "other", 0, "memo",
         note="1歳：初回LD1包を1日1回、最大1日LD2包。2〜7歳未満：初回LD1包を1日1回、最大1日LD4包（1回LD2包まで）。7〜12歳未満：初回LD2包（HD1包）を1日1回、最大1日LD4包。12歳以上：初回LD2包、最大1日LD6包（1回LD4包まで）。増量は2日以上あけて1日LD1包まで"),
    drug(GI, "モビコール配合内用剤HD", "マクロゴール4000配合", "other", 0, "memo", note="HD1包＝LD2包。1歳：初回LD1包を1日1回、最大1日LD2包。2〜7歳未満：初回LD1包を1日1回、最大1日LD4包（1回LD2包まで）。7〜12歳未満：初回LD2包（HD1包）を1日1回、最大1日LD4包。12歳以上：初回LD2包、最大1日LD6包（1回LD4包まで）。増量は2日以上あけて1日LD1包まで"),
    drug(GI, "セルベックス細粒10%", "テプレノン", "powder", 100, "memo", note=ADULT + "成人1日150mgを3回"),
    drug(GI, "タンニン酸アルブミン", "タンニン酸アルブミン", "powder", 1000, "memo", note=ADULT + "成人1日3〜4gを3〜4回"),
    drug(GI, "ミルラクト細粒50%", "β-ガラクトシダーゼ", "powder", 500, "memo", note="乳児の乳糖不耐：1回0.25〜0.5gを哺乳時に（50℃以上のお湯で溶かさない）"),
    drug(GI, "ラクスパン散1.8%", "ラクトミン", "powder", 0, "memo", note=MEMO + "（PMDAで添付文書が見つからない）"),
    drug(GI, "ラックビー微粒N", "ビフィズス菌", "powder", 0, "memo", note="添付文書の用量は成人のみ（成人1日3〜6g を3回）。小児は年齢・症状で適宜減量"),
    drug(GI, "ラックビーR散", "耐性乳酸菌", "powder", 0, "memo", note="添付文書の用量は成人のみ（成人1日3g を3回）。小児は年齢・症状で適宜減量"),
    drug(GI, "ビオフェルミン散剤", "ビフィズス菌", "powder", 0, "memo", note="添付文書の用量は成人のみ（成人1日3〜6g を3回）。小児は年齢・症状で適宜減量"),
    drug(GI, "ビオフェルミン配合散", "ラクトミン・糖化菌", "powder", 0, "memo", note="添付文書の用量は成人のみ（成人1日3〜9g を3回）。小児は年齢・症状で適宜減量"),
    drug(GI, "ビオフェルミンR散", "耐性乳酸菌", "powder", 0, "memo", note="添付文書の用量は成人のみ（成人1日3g を3回）。小児は年齢・症状で適宜減量"),
    drug(GI, "レベニンS散", "ビフィズス菌", "powder", 0, "memo", note="添付文書の用量は成人のみ（成人1日3g を3回）。小児は年齢・症状で適宜減量"),
    drug(GI, "レベニン散", "耐性乳酸菌", "powder", 0, "memo", note="添付文書の用量は成人のみ（成人1日3g を3回）。小児は年齢・症状で適宜減量"),
    drug(GI, "ロートエキス散10%", "ロートエキス", "powder", 100, "memo", note=ADULT + "成人1日20〜90mg（ロートエキスとして）を2〜3回"),
    # ---- 解熱鎮痛 ----
    drug(AN, "カロナール細粒20%", "アセトアミノフェン", "powder", 200, "dose", minPerKg=10, maxPerKg=15, times=4,
         maxDoseMg=1000, maxDailyMg=4000, maxDailyPerKg=60, note=APAP),
    drug(AN, "カロナール細粒50%", "アセトアミノフェン", "powder", 500, "dose", minPerKg=10, maxPerKg=15, times=4,
         maxDoseMg=1000, maxDailyMg=4000, maxDailyPerKg=60, note=APAP),
    drug(AN, "ピリナジン末・カロナール原末", "アセトアミノフェン", "powder", 1000, "dose", minPerKg=10, maxPerKg=15, times=4,
         maxDoseMg=1000, maxDailyMg=4000, maxDailyPerKg=60, note=APAP),
    drug(AN, "カロナールシロップ2%", "アセトアミノフェン", "syrup", 20, "dose", minPerKg=10, maxPerKg=15, times=4,
         maxDoseMg=1000, maxDailyMg=4000, maxDailyPerKg=60, note=APAP),
    drug(AN, "ポンタールシロップ3.25%", "メフェナム酸", "syrup", 32.5, "dose", minPerKg=6.5, maxPerKg=6.5, times=2,
         note="解熱は1回6.5mg/kg、原則1日2回まで"),
    drug(AN, "幼児用PL配合顆粒", "製剤量", "other", 0, "age", amountUnit="g", bands=[B(2, 0), B(5, 4), B(9, 8), B(12, 12)], times=4, note="2〜4歳 1回1g、5〜8歳 1回2g、9〜11歳 1回3g を1日4回"),
    # ---- その他の内服 ----
    drug(OT, "トランサミン散50%", "トラネキサム酸", "powder", 500, "memo", note=ADULT + "成人1日750〜2000mgを3〜4回。小児の年齢別用量はシロップの添付文書にある"),
    drug(OT, "トランサミンシロップ5%", "トラネキサム酸", "syrup", 50, "age", bands=TRANEXAMIC, times=3, note="1日量を3〜4回に分ける"),
    drug(OT, "コンバントリンドライシロップ100", "ピランテル", "powder", 100, "dose", minPerKg=10, maxPerKg=10, times=1,
         note="蟯虫：1回10mg/kgを1回だけ"),
    drug(OT, "チラーヂンS散0.01%", "レボチロキシン", "powder", 100, "dose", amountUnit="μg", minPerKg=10, maxPerKg=10, times=1, note="乳幼児：1回10μg/kgを1日1回。未熟児は1回5μg/kgから始め8日目から10μg/kg"),
    drug(OT, "イーケプラドライシロップ50%", "レベチラセタム", "powder", 500, "age",
         bands=[B(round(1 / 12, 4), 0), B(0.5, 14, 42, perKg=True), B(200, 20, 60, perKg=True)], times=2,
         maxDailyMg=3000, note="部分発作：1〜6か月未満は1日14mg/kgから最高42mg/kg、6か月以上は1日20mg/kgから最高60mg/kg（1日2回）。強直間代発作は4歳以上。体重50kg以上は成人量（1日1000〜3000mg）"),
    drug(OT, "メラトベル顆粒小児用0.2%", "メラトニン", "powder", 2, "age", bands=[B(6, 0), B(16, 1, 4, times=1)], times=1,
         note="6〜15歳：1日1回1mgを就寝前から開始、最高4mg"),
    drug(OT, "ガバペンシロップ5%", "ガバペンチン", "syrup", 50, "age",
         bands=[B(3, 0), B(5, 40, perKg=True), B(13, 25, 35, perKg=True)], times=3, maxDailyPerKg=50,
         note="3〜12歳。1日目10mg/kg・2日目20mg/kgで増量。維持量は3〜4歳40mg/kg/日、5〜12歳25〜35mg/kg/日"),
    drug(OT, "ケイツーシロップ0.2%", "メナテトレノン", "syrup", 2, "memo", note="予防：出生後（哺乳確立後）・生後1週間（または退院時）・生後1か月に各1mL。治療：1日1回1mL（3mLまで）"),
    drug(OT, "セルシンシロップ0.1%", "ジアゼパム", "syrup", 1, "age", bands=[B(4, 1, 5), B(13, 2, 10)], times=3,
         note="3歳以下 1日1〜5mg、4〜12歳 1日2〜10mg を1日1〜4回"),
    drug(OT, "デパケンシロップ5%", "バルプロ酸ナトリウム", "syrup", 50, "memo", note="添付文書の用量は年齢の区別なし（1日400〜1200mgを2〜3回）。小児は体重・血中濃度で調整"),
    drug(OT, "ニフランシロップ", "", "syrup", 0, "memo", note="PMDAで該当する添付文書が見つからない（ニフランは点眼液）。名前を確認してください"),
    drug(OT, "ヘマンジオルシロップ0.375%", "プロプラノロール", "syrup", 3.75, "day", minPerKg=1, maxPerKg=3, times=2,
         note="1日1mg/kgから開始し、2mg/kg→維持3mg/kgに増量。1日2回（9時間以上あける）"),
    # ---- 坐剤・貼付 ----
    drug(SU, "アンヒバ坐剤（アルピニー坐剤）", "アセトアミノフェン", "other", 0, "dose", minPerKg=10, maxPerKg=15, times=4,
         maxDailyPerKg=60, note="規格50・100・200mg。" + APAP),
    drug(SU, "ナウゼリン坐剤", "ドンペリドン", "other", 0, "age", bands=[B(3, 20, 30), B(200, 60, 90)], times=2,
         note="3歳未満 1回10mg、3歳以上 1回30mg を1日2〜3回"),
    drug(SU, "ダイアップ坐剤", "ジアゼパム", "other", 0, "dose", minPerKg=0.4, maxPerKg=0.5, times=2, maxDailyPerKg=1,
         note="1回0.4〜0.5mg/kgを1日1〜2回。1日1mg/kgを超えない。規格4・6・10mg"),
    drug(SU, "ボルタレンサポ", "ジクロフェナク", "other", 0, "dose", minPerKg=0.5, maxPerKg=1, times=2,
         note="1回0.5〜1mg/kgを1日1〜2回。年齢別の目安（1回）：1〜3歳未満6.25mg、3〜6歳未満6.25〜12.5mg、6〜9歳未満12.5mg、9〜12歳未満12.5〜25mg。インフルエンザでは使わない"),
    drug(SU, "テレミンソフト坐剤", "ビサコジル", "other", 0, "memo", note="乳幼児：1回2mgを1日1〜2回"),
    drug(SU, "ホクナリンテープ", "ツロブテロール", "other", 0, "age", bands=[B(0.5, 0), B(3, 0.5, times=1), B(9, 1, times=1), B(200, 2, times=1)],
         times=1, note="0.5〜3歳未満0.5mg、3〜9歳未満1mg、9歳以上2mg を1日1回貼付"),
    # ---- 錠剤・カプセル ----
    drug(TB, "ジルテック錠", "セチリジン", "other", 0, "age", bands=[B(7, 0), B(15, 10, times=2), B(200, 10, times=1)], times=2,
         note="7〜15歳未満 1回5mgを1日2回。15歳以上は1回10mgを1日1回"),
    drug(TB, "アレグラ錠", "フェキソフェナジン", "other", 0, "age", bands=[B(7, 0), B(12, 60), B(200, 120)], times=2,
         note="7〜12歳未満 1回30mg、12歳以上 1回60mg を1日2回"),
    drug(TB, "アレロック錠", "オロパタジン", "other", 0, "age", bands=[B(7, 0), B(200, 10)], times=2, note="7歳以上 1回5mgを1日2回"),
    drug(TB, "クラリチン錠", "ロラタジン", "other", 0, "age", bands=[B(7, 0), B(200, 10, times=1)], times=1, note="7歳以上 10mgを1日1回"),
    drug(TB, "デザレックス錠", "デスロラタジン", "other", 0, "age", bands=[B(12, 0), B(200, 5, times=1)], times=1, note="12歳以上 5mgを1日1回"),
    drug(TB, "ルパフィン錠", "ルパタジン", "other", 0, "age", bands=[B(12, 0), B(200, 10, times=1)], times=1, note="12歳以上 10mgを1日1回"),
    drug(TB, "ザイザル錠", "レボセチリジン", "other", 0, "age", bands=[B(7, 0), B(15, 5, times=2), B(200, 5, times=1)], times=2,
         note="7〜15歳未満 1回2.5mgを1日2回。15歳以上は1回5mgを1日1回"),
    drug(TB, "エバステル錠", "エバスチン", "other", 0, "memo", note=MEMO + "（小児用量の記載が無いか確認）"),
    drug(TB, "アレジオン錠", "エピナスチン", "other", 0, "memo", note=MEMO + "（小児用量の記載が無いか確認）"),
    drug(TB, "オノンカプセル", "プランルカスト", "other", 0, "memo", note=MEMO + "（小児用量の記載が無いか確認）"),
    drug(TB, "シングレアチュアブル錠5mg", "モンテルカスト", "other", 0, "age", bands=[B(6, 0), B(15, 5, times=1)], times=1,
         note="6歳以上 5mgを1日1回就寝前"),
    drug(TB, "ネキシウムカプセル", "エソメプラゾール", "other", 0, "weight", bands=[B(20, 10, times=1), B(500, 10, 20, times=1)], times=1,
         note="1歳以上。体重20kg未満 1回10mg、20kg以上 1回10〜20mg を1日1回"),
    drug(TB, "オゼックス錠小児用60mg", "トスフロキサシン", "other", 60, "dose", unit="錠", minPerKg=6, maxPerKg=6, times=2, maxDoseMg=180, maxDailyMg=360, note="1回180mg・1日360mgを超えない。目安：15kg 1.5錠、20kg 2錠、25kg 2.5錠、30kg以上 3錠"),
    drug(TB, "ゾコーバ錠", "エンシトレルビル", "other", 0, "memo", note="1日1回5日間。12歳以上：1日目375mg、2〜5日目125mg。6〜12歳未満：40kg以上は同じ、30〜40kg 250mg→125mg、20〜30kg 150mg→75mg"),
    # ---- 点鼻 ----
    drug(NA, "フルチカゾン点鼻液25μg小児用", "フルチカゾン", "other", 0, "memo", note="1回各鼻腔に1噴霧を1日2回。1日最大8噴霧"),
    drug(NA, "アラミスト点鼻液", "フルチカゾンフランカルボン酸エステル", "other", 0, "memo", note="小児：1回各鼻腔に1噴霧を1日1回"),
    drug(NA, "ナゾネックス点鼻液", "モメタゾン", "other", 0, "memo", note="12歳未満：各鼻腔に1噴霧を1日1回。12歳以上：各鼻腔に2噴霧を1日1回"),
    drug(NA, "ザジテン点鼻液", "ケトチフェン", "other", 0, "memo", note="1回各鼻腔に1噴霧を1日4回"),
    drug(NA, "インタール点鼻液", "クロモグリク酸", "other", 0, "memo", note="1回各鼻腔に1噴霧を1日6回"),
    drug(NA, "リノコートパウダースプレー", "ベクロメタゾン", "other", 0, "memo", note="1回各鼻腔に1噴霧を1日2回（PMDAで添付文書が見つからない。販売終了の可能性）"),
    drug(NA, "エリザス点鼻粉末", "デキサメタゾンシペシル酸エステル", "other", 0, "memo", note=MEMO),
    # ---- 点眼 ----
    drug(EY, "フルメトロン点眼液", "フルオロメトロン", "other", 0, "memo", note="1回1〜2滴を1日2〜4回"),
    drug(EY, "レボカバスチン点眼液", "レボカバスチン", "other", 0, "memo", note="1回1〜2滴を1日4回（一覧の「レボカルニチン」はこれと判断しました）"),
    drug(EY, "パタノール点眼液", "オロパタジン", "other", 0, "memo", note="1回1〜2滴を1日4回"),
    drug(EY, "リザベン点眼液", "トラニラスト", "other", 0, "memo", note="1回1〜2滴を1日4回"),
    drug(EY, "インタール点眼液", "クロモグリク酸", "other", 0, "memo", note="1回1〜2滴を1日4回"),
    drug(EY, "アレジオン点眼液", "エピナスチン", "other", 0, "memo", note="1回1滴を1日4回"),
    drug(EY, "アレジオンLX点眼液", "エピナスチン", "other", 0, "memo", note="1回1滴を1日2回"),
    drug(EY, "ケタス点眼液", "イブジラスト", "other", 0, "memo", note="1回1〜2滴を1日4回"),
    drug(EY, "クラビット点眼液（タリビッド・オゼックス点眼液）", "ニューキノロン系", "other", 0, "memo", note="1回1滴を1日3回"),
    drug(EY, "アジマイシン点眼液", "アジスロマイシン", "other", 0, "memo",
         note="結膜炎（成人・7歳以上）：1回1滴を1日2回2日間、その後1日1回5日間"),
    # ---- 外用 ----
    drug(TO, "プロトピック軟膏0.03%小児用", "タクロリムス", "other", 0, "memo",
         note="2歳以上。1日1〜2回。1回の塗布量は5gまで、年齢で減らす（目安：2〜5歳（20kg未満）1g、6〜12歳（20〜50kg）2〜4g、13歳以上（50kg以上）5g）"),
    drug(TO, "コレクチム軟膏0.25%", "デルゴシチニブ", "other", 0, "memo", note="小児：1日2回。1回5gまで（体格に応じて減らす）"),
    drug(TO, "モイゼルト軟膏0.3%", "ジファミラスト", "other", 0, "memo", note="小児：1日2回適量。症状により1%を使う"),
]

# PMDA の一般名ごとの一覧（GeneralList）を開くための YJ コード先頭7桁（2026年11月に PMDA で照合）
PMDA = {
 "サワシリン細粒10%": "6131001",
 "ワイドシリン細粒10%": "6131001",
 "ワイドシリン細粒20%": "6131001",
 "クラバモックス小児用配合ドライシロップ": "6139100",
 "オラスポア小児用ドライシロップ10%": "6132006",
 "ケフラール細粒小児用100mg": "6132005",
 "ケフレックスシロップ用細粒100": "6132002",
 "ケフレックスシロップ用細粒200": "6132002",
 "セフゾン細粒小児用10%": "6132013",
 "トミロン細粒小児用10%": "6132009",
 "トミロン細粒小児用20%": "6132009",
 "バナンドライシロップ5%": "6132011",
 "フロモックス小児用細粒100mg": "6132016",
 "メイアクトMS小児用細粒10%": "6132015",
 "エリスロシンW顆粒20%": "6141001",
 "エリスロシンドライシロップW20%": "6141001",
 "エリスロシンドライシロップ10%": "6141001",
 "クラリシッドドライシロップ10%": "6149003",
 "クラリスドライシロップ10%": "6149003",
 "ジスロマック細粒小児用10%": "6149004",
 "ファロムドライシロップ小児用10%": "6139001",
 "オラペネム小児用細粒10%": "6139002",
 "ホスミシンドライシロップ400": "6135001",
 "ホスミシンドライシロップ200": "6135001",
 "オゼックス細粒小児用15%": "6241010",
 "ミノマイシン顆粒2%": "6152005",
 "アシクロビルドライシロップ80%": "6250002",
 "ゾビラックス顆粒40%": "6250002",
 "バルトレックス顆粒50%": "6250019",
 "タミフルドライシロップ3%": "6250021",
 "イナビル吸入粉末剤20mg": "6250703",
 "リレンザ": "6250702",
 "ゾフルーザ（錠・顆粒）": "6250047",
 "アレロック顆粒0.5%": "4490025",
 "ペミラストンドライシロップ0.5%": "4490011",
 "フェキソフェナジンドライシロップ6%": "4490023",
 "クラリチンドライシロップ1%": "4490027",
 "セチリジン塩酸塩DS1.25%": "4490020",
 "レボセチリジン塩酸塩ドライシロップ0.5%": "4490028",
 "ザイザルシロップ0.05%": "4490028",
 "キプレス細粒4mg": "4490026",
 "オノンドライシロップ10%": "4490017",
 "ケトチフェンドライシロップ0.1%": "4490003",
 "ザジテンシロップ0.02%（ジキリオンシロップ0.02%）": "4490003",
 "ゼスラン小児用細粒0.6%（ニポラジン小児用細粒0.6%）": "4413004",
 "ゼスランシロップ0.03%（ニポラジンシロップ0.03%）": "4413004",
 "オキサトミドドライシロップ2%": "4490005",
 "クレマスチンドライシロップ0.1%": "4419008",
 "ペリアクチン散1%": "4419005",
 "ペリアクチンシロップ0.04%": "4419005",
 "ポララミンドライシロップ0.2%": "4419002",
 "ポララミンシロップ0.04%": "4419002",
 "リザベン細粒10%": "4490002",
 "リザベンドライシロップ5%": "4490002",
 "リンデロン散0.1%": "2454004",
 "リンデロンシロップ0.01%": "2454004",
 "セレスタミン配合シロップ": "2459100",
 "アスベリンドライシロップ2%": "2249003",
 "アスベリン散10%": "2249003",
 "アスベリンシロップ0.5%": "2249003",
 "アストミン散10%": "2229001",
 "アストミンシロップ0.25%": "2229001",
 "メジコン散10%": "2223001",
 "メジコン配合シロップ": "2249106",
 "フスコデ配合シロップ": "2229101",
 "ムコダイン細粒DS50%": "2233002",
 "ムコダインシロップ5%（カルボシステインシロップ5%）": "2233002",
 "ムコソルバンドライシロップ1.5%": "2239001",
 "ムコソルバンシロップ0.3%（プルスマリンAシロップ0.3%）": "2239001",
 "テオドールドライシロップ20%": "2251001",
 "テオドールシロップ2%": "2251001",
 "ホクナリンドライシロップ0.1%小児用": "2259002",
 "メプチン顆粒0.01%": "2259004",
 "メプチンドライシロップ0.005%": "2259004",
 "メプチンシロップ5μg/mL": "2259004",
 "ベネトリンシロップ0.04%": "2254001",
 "ナウゼリンドライシロップ1%": "2399005",
 "プリンペランシロップ0.1%": "2399004",
 "ロペラミド塩酸塩細粒小児用0.05%": "2319001",
 "酸化マグネシウム原末": "2344002",
 "モビコール配合内用剤LD": "2359110",
 "モビコール配合内用剤HD": "2359110",
 "セルベックス細粒10%": "2329012",
 "タンニン酸アルブミン": "2312001",
 "ミルラクト細粒50%": "2339004",
 "ラックビー微粒N": "2316014",
 "ラックビーR散": "2316019",
 "ビオフェルミン散剤": "2316020",
 "ビオフェルミン配合散": "2316012",
 "ビオフェルミンR散": "2316004",
 "レベニンS散": "2316016",
 "レベニン散": "2316016",
 "ロートエキス散10%": "1249351",
 "カロナール細粒20%": "1141007",
 "カロナール細粒50%": "1141007",
 "カロナールシロップ2%": "1141007",
 "ポンタールシロップ3.25%": "1141005",
 "幼児用PL配合顆粒": "1180108",
 "トランサミン散50%": "3327002",
 "トランサミンシロップ5%": "3327002",
 "コンバントリンドライシロップ100": "6429001",
 "チラーヂンS散0.01%": "2431004",
 "イーケプラドライシロップ50%": "1139010",
 "メラトベル顆粒小児用0.2%": "1190028",
 "ガバペンシロップ5%": "1139007",
 "ケイツーシロップ0.2%": "3160002",
 "セルシンシロップ0.1%": "1124017",
 "デパケンシロップ5%": "1139004",
 "ヘマンジオルシロップ0.375%": "2900003",
 "アンヒバ坐剤（アルピニー坐剤）": "1141700",
 "ナウゼリン坐剤": "2399714",
 "ダイアップ坐剤": "1124701",
 "ボルタレンサポ": "1147700",
 "テレミンソフト坐剤": "2359700",
 "ホクナリンテープ": "2259707",
 "ジルテック錠": "4490020",
 "アレグラ錠": "4490023",
 "アレロック錠": "4490025",
 "クラリチン錠": "4490027",
 "デザレックス錠": "4490032",
 "ルパフィン錠": "4490034",
 "ザイザル錠": "4490028",
 "エバステル錠": "4490019",
 "アレジオン錠": "4490014",
 "オノンカプセル": "4490017",
 "シングレアチュアブル錠5mg": "4490026",
 "ネキシウムカプセル": "2329029",
 "ゾコーバ錠": "6250052",
 "フルチカゾン点鼻液25μg小児用": "1329707",
 "アラミスト点鼻液": "1329711",
 "ナゾネックス点鼻液": "1329710",
 "ザジテン点鼻液": "1329705",
 "エリザス点鼻粉末": "1329712",
 "フルメトロン点眼液": "1315704",
 "レボカバスチン点眼液": "1319746",
 "パタノール点眼液": "1319752",
 "リザベン点眼液": "1319736",
 "アレジオン点眼液": "1319762",
 "アレジオンLX点眼液": "1319762",
 "ケタス点眼液": "1319741",
 "クラビット点眼液（タリビッド・オゼックス点眼液）": "1319742",
 "アジマイシン点眼液": "1317714",
 "プロトピック軟膏0.03%小児用": "2699709",
 "コレクチム軟膏0.25%": "2699714",
 "モイゼルト軟膏0.3%": "2699715",
 "オゼックス錠小児用60mg": "6241010"
}
# ---- 適応症で小児用量が違う薬は、適応症ごとに別の行にする（2026年11月 PMDA の電子添文と照合） ----
ACV_HI = dict(basis="dose", minPerKg=20, maxPerKg=20, times=4, maxDoseMg=800)
ACV_LO = dict(basis="dose", minPerKg=20, maxPerKg=20, times=4, maxDoseMg=200)
VACV_HSV = dict(basis="weight", bands=[B(10, 25, times=3, perKg=True, perDose=True), B(500, 25, times=2, perKg=True, perDose=True)],
                times=2, maxDoseMg=500)
PEMI_RHINITIS = [B(1, 0), B(5, 2.5), B(11, 5), B(200, 10)]
CAM_GEN = dict(basis="day", minPerKg=10, maxPerKg=15, times=2, maxDailyMg=400)
SPLIT = {
    "ゾビラックス顆粒40%": [
        ("水痘・帯状疱疹", ACV_HI, "1回20mg/kgを1日4回（1回800mgまで）。水痘は皮疹出現後3日以内、帯状疱疹は5日以内に開始"),
        ("単純疱疹・性器ヘルペス再発抑制", ACV_LO, "1回20mg/kgを1日4回（1回200mgまで）。造血幹細胞移植時の単純疱疹の発症抑制も同じ"),
    ],
    "アシクロビルドライシロップ80%": [
        ("帯状疱疹", ACV_HI, "1回20mg/kgを1日4回（1回800mgまで）。この製剤の効能に水痘は無い（水痘はゾビラックス顆粒など）"),
        ("単純疱疹・性器ヘルペス再発抑制", ACV_LO, "1回20mg/kgを1日4回（1回200mgまで）。造血幹細胞移植時の単純疱疹の発症抑制も同じ"),
    ],
    "バルトレックス顆粒50%": [
        ("水痘・帯状疱疹", dict(basis="dose", minPerKg=25, maxPerKg=25, times=3, maxDoseMg=1000), "1回25mg/kgを1日3回（1回1000mgまで）"),
        ("単純疱疹", VACV_HSV, "1回25mg/kgを、体重10kg未満は1日3回、10kg以上は1日2回（1回500mgまで）。造血幹細胞移植時の発症抑制も同じ"),
        ("性器ヘルペス再発抑制", dict(basis="weight", bands=[B(40, 0), B(500, 500, times=1, perDose=True)], times=1),
         "体重40kg以上の小児：1回500mgを1日1回（HIV感染症の患者は1日2回）"),
    ],
    "タミフルドライシロップ3%": [
        ("治療", None, "1日2回5日間。新生児・乳児（1歳未満）は1回3mg/kg、幼小児は1回2mg/kg（1回75mgまで）"),
        ("予防", dict(basis="age", bands=[B(1, 0), B(200, 2, times=1, perKg=True, perDose=True)], times=1, maxDoseMg=75),
         "幼小児：1回2mg/kgを1日1回10日間（1回75mgまで）。接触後2日以内に開始。1歳未満の予防の用量は記載なし"),
    ],
    "リレンザ": [
        ("治療", dict(basis="age", bands=[B(200, 20, times=2)], times=2), "1回10mg（2ブリスター）を1日2回、5日間吸入"),
        ("予防", dict(basis="age", bands=[B(200, 10, times=1)], times=1), "1回10mg（2ブリスター）を1日1回、10日間吸入"),
    ],
    "アレギサールドライシロップ0.5%": [
        ("気管支喘息", dict(basis="age", bands=PEMI, times=2),
         "1回0.2mg/kgを1日2回。標準：1〜5歳未満 1回2.5mg、5〜11歳未満 1回5mg、11歳以上 1回10mg"),
        ("アレルギー性鼻炎", dict(basis="age", bands=PEMI_RHINITIS, times=2),
         "1回0.1mg/kgを1日2回。標準：1〜5歳未満 1回1.25mg、5〜11歳未満 1回2.5mg、11歳以上 1回5mg"),
    ],
    "ゼスラン小児用細粒0.6%（ニポラジン小児用細粒0.6%）": [
        ("気管支喘息", dict(basis="dose", minPerKg=0.12, maxPerKg=0.12, times=2), "1回0.12mg/kgを1日2回"),
        ("鼻炎・じん麻疹・皮膚のかゆみ", dict(basis="dose", minPerKg=0.06, maxPerKg=0.06, times=2), "1回0.06mg/kgを1日2回"),
    ],
    "クラリスドライシロップ10%": [
        ("一般感染症", CAM_GEN, "1日10〜15mg/kgを2〜3回に分ける。小児の1日量は成人量（400mg）まで"),
        ("レジオネラ肺炎", dict(CAM_GEN, minPerKg=15), "1日15mg/kgを2〜3回に分ける"),
        ("MAC症（エイズに伴う）", dict(basis="day", minPerKg=15, maxPerKg=15, times=2), "1日15mg/kgを2回に分ける"),
    ],
    "メイアクトMS小児用細粒10%": [
        ("肺炎・中耳炎・副鼻腔炎", dict(basis="dose", minPerKg=3, maxPerKg=6, times=3, maxDoseMg=200),
         "1回3mg/kgを1日3回食後。必要に応じて1回6mg/kgまで（1回200mg・1日600mgまで）"),
        ("上記以外", dict(basis="dose", minPerKg=3, maxPerKg=3, times=3, maxDoseMg=200), "1回3mg/kgを1日3回食後（1回200mgまで）"),
    ],
    "イーケプラドライシロップ50%": [
        ("部分発作", None, "1〜6か月未満は1日14mg/kgから最高42mg/kg、6か月以上は1日20mg/kgから最高60mg/kg（1日2回）。増量は2週間以上あける。体重50kg以上は成人量（1日1000〜3000mg）"),
        ("強直間代発作", dict(basis="age", bands=[B(4, 0), B(200, 20, 60, perKg=True)], times=2, maxDailyMg=3000),
         "4歳以上：1日20mg/kgから最高60mg/kg（1日2回）。他の抗てんかん薬と併用。体重50kg以上は成人量"),
    ],
}
SPLIT["ペミラストンドライシロップ0.5%"] = SPLIT["アレギサールドライシロップ0.5%"]
SPLIT["ゼスランシロップ0.03%（ニポラジンシロップ0.03%）"] = SPLIT["ゼスラン小児用細粒0.6%（ニポラジン小児用細粒0.6%）"]
SPLIT["クラリシッドドライシロップ10%"] = SPLIT["クラリスドライシロップ10%"]
DOSE_KEYS = ("basis", "minPerKg", "maxPerKg", "times", "maxDoseMg", "maxDailyMg", "maxDailyPerKg", "bands", "note")

expanded = []
for d in presets:
    if d["name"] not in SPLIT:
        expanded.append(d)
        continue
    for label, dose, note in SPLIT[d["name"]]:
        e = dict(d)
        if dose is not None:
            for k in DOSE_KEYS:
                e.pop(k, None)
            e.update(dose)
        e["name"] = "%s【%s】" % (d["name"], label)
        e["note"] = note
        expanded.append(e)
presets = expanded

for d in presets:
    base = d["name"].split("【")[0]
    if base in PMDA:
        d["pmda"] = PMDA[base]

# 名前を変えた・分けた初期登録の薬（アプリは保存データからこの名前の薬を消して、新しい初期登録に入れ替える）
out = {"version": V, "replaced": sorted(SPLIT), "drugs": presets}
here = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(here, "..", "data", "ped_presets.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
print(len(presets), "品目")
