# 小児用量の初期登録データ（ped_presets.json）を作るスクリプト。
# 値は添付文書の小児用量をもとにした目安。数値に確信が持てない薬は basis="memo"（用量未登録）にしている。
# 変更したら `python3 tools/make_ped_presets.py` を実行して data/ped_presets.json を作り直す（iOS・Android 共通）。
import json, os

V = 2  # 初期登録の版。増やすと、既存ユーザーにも足りない薬が名前で追加される

def B(below, mn, mx=None, times=None):
    d = {"below": below, "min": mn, "max": mx if mx is not None else mn}
    if times: d["times"] = times
    return d

def drug(cat, name, ing, form, conc, basis, **kw):
    d = {"category": cat, "name": name, "ingredient": ing, "form": form, "conc": conc, "basis": basis}
    d.update(kw)
    return d

AB, AV, AL, CO, BR, GI, AN, OT, SU, TB, NA, EY, TO = (
    "抗菌薬", "抗ウイルス薬", "抗アレルギー・抗ヒスタミン", "鎮咳・去痰", "気管支拡張", "消化器", "解熱鎮痛",
    "その他の内服", "坐剤・貼付", "錠剤・カプセル", "点鼻", "点眼", "外用")
MEMO = "添付文書で用量を確認して、編集から登録してください"
APAP = "投与間隔は4〜6時間以上。1日総量60mg/kgまで（成人量を超えない）"
TIPEPIDINE = [B(1, 5, 20), B(3, 10, 25), B(6, 15, 40)]
TRANEXAMIC = [B(2, 75, 200), B(4, 150, 350), B(7, 250, 650), B(15, 400, 1000), B(200, 750, 2000)]
AMPC = dict(minPerKg=20, maxPerKg=40, times=3, maxDailyPerKg=90, note="1日3〜4回。1日最大90mg/kg")
EM = dict(minPerKg=25, maxPerKg=50, times=4, note="力価。1日4〜6回に分ける")
CAM = dict(minPerKg=10, maxPerKg=15, times=2, note="1日2〜3回に分ける")
KETO = dict(minPerKg=0.06, maxPerKg=0.06, times=2, note="朝食後と就寝前")
MEQ = dict(minPerKg=0.06, maxPerKg=0.06, times=2, note="1回0.06mg/kgを1日2回")
HYDROXYZINE = dict(minPerKg=1, maxPerKg=2, times=3, note="ヒドロキシジンパモ酸塩として。1日2〜3回")
TULO = dict(minPerKg=0.04, maxPerKg=0.04, times=2, note="1日2回")
PROCA = dict(amountUnit="μg", minPerKg=1.25, maxPerKg=1.25, times=2, maxDoseMg=25,
             note="6歳未満：1回1.25μg/kgを1日2〜3回。6歳以上：1回25μgを1日1〜2回")
TRANILAST = dict(minPerKg=5, maxPerKg=5, times=3)
PEMI = [B(1, 0), B(5, 5), B(11, 10), B(200, 20)]
THEO = dict(minPerKg=8, maxPerKg=10, times=2, note="1回4〜5mg/kgを1日2回（6か月以上）。血中濃度に注意")

presets = [
    # ---- 抗菌薬 ----
    drug(AB, "サワシリン細粒10%", "アモキシシリン", "powder", 100, "day", **AMPC),
    drug(AB, "ワイドシリン細粒10%", "アモキシシリン", "powder", 100, "day", **AMPC),
    drug(AB, "ワイドシリン細粒20%", "アモキシシリン", "powder", 200, "day", **AMPC),
    drug(AB, "クラバモックス小児用配合ドライシロップ", "アモキシシリン（＋クラブラン酸）", "powder", 594.06, "day",
         minPerKg=90, maxPerKg=90, times=2, note="アモキシシリンとして90mg/kg/日（クラブラン酸6.4mg/kg/日）を1日2回、12時間ごと食直前。製剤1.01gにアモキシシリン600mg"),
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
         note="必要に応じて1回10mg/kgまで"),
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
    drug(AV, "タミフルドライシロップ3%", "オセルタミビル", "powder", 30, "dose", minPerKg=2, maxPerKg=2, times=2,
         maxDoseMg=75, note="治療は1日2回5日間、予防は1日1回"),
    drug(AV, "イナビル吸入粉末剤20mg", "ラニナミビル", "other", 20, "age", unit="容器",
         bands=[B(10, 20, times=1), B(200, 40, times=1)], times=1, note="単回吸入。10歳未満20mg（1容器）、10歳以上40mg（2容器）"),
    drug(AV, "リレンザ", "ザナミビル", "other", 5, "age", unit="ブリスター", bands=[B(200, 20, times=2)], times=2,
         note="1回10mg（2ブリスター）を1日2回、5日間吸入"),
    drug(AV, "ゾフルーザ（錠・顆粒）", "バロキサビル マルボキシル", "other", 0, "weight",
         bands=[B(10, 0), B(20, 10, times=1), B(40, 20, times=1), B(80, 40, times=1), B(500, 80, times=1)], times=1,
         note="単回。12歳未満は体重10kg以上で 10〜20kg 10mg、20〜40kg 20mg、40kg以上 40mg。12歳以上は40kg以上で40mg、80kg以上80mg。顆粒2%分包は1包0.5g＝10mg"),
    # ---- 抗アレルギー・抗ヒスタミン ----
    drug(AL, "アタラックスPドライシロップ2.5%", "ヒドロキシジン", "powder", 25, "day", **HYDROXYZINE),
    drug(AL, "アタラックスP散10%", "ヒドロキシジン", "powder", 100, "day", **HYDROXYZINE),
    drug(AL, "アタラックスPシロップ0.5%", "ヒドロキシジン", "syrup", 5, "day", **HYDROXYZINE),
    drug(AL, "アレロック顆粒0.5%", "オロパタジン", "powder", 5, "age", bands=[B(2, 0), B(7, 5), B(200, 10)], times=2,
         note="2〜7歳未満 1回2.5mg、7歳以上 1回5mg を1日2回"),
    drug(AL, "アレギサールドライシロップ0.5%", "ペミロラスト", "powder", 5, "age", bands=PEMI, times=2,
         note="1〜5歳未満 1回2.5mg、5〜11歳未満 1回5mg、11歳以上 1回10mg を1日2回"),
    drug(AL, "ペミラストンドライシロップ0.5%", "ペミロラスト", "powder", 5, "age", bands=PEMI, times=2,
         note="1〜5歳未満 1回2.5mg、5〜11歳未満 1回5mg、11歳以上 1回10mg を1日2回"),
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
    drug(AL, "ゼスラン小児用細粒0.6%（ニポラジン小児用細粒0.6%）", "メキタジン", "powder", 6, "day", **MEQ),
    drug(AL, "ゼスランシロップ0.03%（ニポラジンシロップ0.03%）", "メキタジン", "syrup", 0.3, "day", **MEQ),
    drug(AL, "オキサトミドドライシロップ2%", "オキサトミド", "powder", 20, "dose", minPerKg=0.5, maxPerKg=0.5, times=2,
         note="1回0.5mg/kgを1日2回。1回最高0.75mg/kg"),
    drug(AL, "クレマスチンドライシロップ0.1%", "クレマスチン", "powder", 1, "memo", note=MEMO),
    drug(AL, "ペリアクチン散1%", "シプロヘプタジン", "powder", 10, "memo", note=MEMO),
    drug(AL, "ペリアクチンシロップ0.04%", "シプロヘプタジン", "syrup", 0.4, "memo", note=MEMO),
    drug(AL, "ポララミンドライシロップ0.2%", "d-クロルフェニラミン", "powder", 2, "memo", note=MEMO),
    drug(AL, "ポララミンシロップ0.04%", "d-クロルフェニラミン", "syrup", 0.4, "memo", note=MEMO),
    drug(AL, "リザベン細粒10%", "トラニラスト", "powder", 100, "day", **TRANILAST),
    drug(AL, "リザベンドライシロップ5%", "トラニラスト", "powder", 50, "day", **TRANILAST),
    drug(AL, "リンデロン散0.1%", "ベタメタゾン", "powder", 1, "memo", note=MEMO),
    drug(AL, "リンデロンシロップ0.01%", "ベタメタゾン", "syrup", 0.1, "memo", note=MEMO),
    drug(AL, "デカドロンエリキシル0.01%", "デキサメタゾン", "syrup", 0.1, "memo", note=MEMO),
    drug(AL, "セレスタミン配合シロップ", "ベタメタゾン・d-クロルフェニラミン", "syrup", 0, "memo", note=MEMO),
    # ---- 鎮咳・去痰 ----
    drug(CO, "アスベリンドライシロップ2%", "チペピジンヒベンズ酸塩", "powder", 20, "age", bands=TIPEPIDINE, times=3),
    drug(CO, "アスベリン散10%", "チペピジンヒベンズ酸塩", "powder", 100, "age", bands=TIPEPIDINE, times=3),
    drug(CO, "アスベリンシロップ0.5%", "チペピジンヒベンズ酸塩", "syrup", 5, "age", bands=TIPEPIDINE, times=3),
    drug(CO, "アストミン散10%", "ジメモルファン", "powder", 100, "memo", note=MEMO),
    drug(CO, "アストミンシロップ0.25%", "ジメモルファン", "syrup", 2.5, "memo", note=MEMO),
    drug(CO, "メジコン散10%", "デキストロメトルファン", "powder", 100, "memo", note=MEMO),
    drug(CO, "メジコン配合シロップ", "デキストロメトルファン配合", "syrup", 0, "memo", note=MEMO),
    drug(CO, "フスコデ配合シロップ", "ジヒドロコデイン配合", "syrup", 0, "memo", note="12歳未満には使わない（コデイン類）。" + MEMO),
    drug(CO, "ムコダイン細粒DS50%", "カルボシステイン", "powder", 500, "day", minPerKg=30, maxPerKg=30, times=3,
         note="1回10mg/kgを1日3回"),
    drug(CO, "ムコダインシロップ5%（カルボシステインシロップ5%）", "カルボシステイン", "syrup", 50, "day", minPerKg=30, maxPerKg=30,
         times=3, note="1回10mg/kgを1日3回"),
    drug(CO, "ムコソルバンドライシロップ1.5%", "アンブロキソール", "powder", 15, "day", minPerKg=0.9, maxPerKg=0.9, times=3),
    drug(CO, "ムコソルバンシロップ0.3%（プルスマリンAシロップ0.3%）", "アンブロキソール", "syrup", 3, "day",
         minPerKg=0.9, maxPerKg=0.9, times=3),
    drug(CO, "レフトーゼシロップ0.5%", "リゾチーム", "syrup", 5, "memo", note=MEMO),
    # ---- 気管支拡張 ----
    drug(BR, "テオドールドライシロップ20%", "テオフィリン", "powder", 200, "day", **THEO),
    drug(BR, "テオドールシロップ2%", "テオフィリン", "syrup", 20, "day", **THEO),
    drug(BR, "ベラチンドライシロップ小児用0.1%", "ツロブテロール", "powder", 1, "day", **TULO),
    drug(BR, "ホクナリンドライシロップ0.1%小児用", "ツロブテロール", "powder", 1, "day", **TULO),
    drug(BR, "メプチン顆粒0.01%", "プロカテロール", "powder", 100, "dose", **PROCA),
    drug(BR, "メプチンドライシロップ0.005%", "プロカテロール", "powder", 50, "dose", **PROCA),
    drug(BR, "メプチンシロップ5μg/mL", "プロカテロール", "syrup", 5, "dose", **PROCA),
    drug(BR, "ベネトリンシロップ0.04%", "サルブタモール", "syrup", 0.4, "day", minPerKg=0.3, maxPerKg=0.3, times=3),
    drug(BR, "ベロテックシロップ0.05%", "フェノテロール", "syrup", 0.5, "day", minPerKg=0.375, maxPerKg=0.375, times=3),
    # ---- 消化器 ----
    drug(GI, "ナウゼリンドライシロップ1%", "ドンペリドン", "powder", 10, "day", minPerKg=1, maxPerKg=2, times=3, maxDailyMg=30,
         note="食前。1日30mgを超えない。6歳以上は1日最高1mg/kg"),
    drug(GI, "プリンペランシロップ0.1%", "メトクロプラミド", "syrup", 1, "day", minPerKg=0.5, maxPerKg=0.7, times=2,
         note="1日2〜3回。錐体外路症状に注意"),
    drug(GI, "ロペラミド塩酸塩細粒小児用0.05%", "ロペラミド", "powder", 0.5, "day", minPerKg=0.02, maxPerKg=0.04, times=2,
         note="1日2〜3回。6か月未満は禁忌、2歳未満は原則使わない"),
    drug(GI, "酸化マグネシウム原末", "酸化マグネシウム", "powder", 1000, "memo", note=MEMO),
    drug(GI, "モビコール配合内用剤LD", "マクロゴール4000配合", "other", 0, "memo",
         note="2歳以上。年齢で開始量が違う（2〜7歳未満は1回1包、7〜12歳未満は1回2包、12歳以上は1回2包から）。" + MEMO),
    drug(GI, "モビコール配合内用剤HD", "マクロゴール4000配合", "other", 0, "memo", note="LDの4倍量の分包。" + MEMO),
    drug(GI, "セルベックス細粒10%", "テプレノン", "powder", 100, "memo", note=MEMO),
    drug(GI, "タンニン酸アルブミン", "タンニン酸アルブミン", "powder", 1000, "memo", note=MEMO),
    drug(GI, "ミルラクト細粒50%", "β-ガラクトシダーゼ", "powder", 500, "memo", note=MEMO),
    drug(GI, "ラクスパン散1.8%", "ラクトミン", "powder", 0, "memo", note=MEMO),
    drug(GI, "ラックビー微粒N", "ビフィズス菌", "powder", 0, "memo", note=MEMO),
    drug(GI, "ラックビーR散", "耐性乳酸菌", "powder", 0, "memo", note=MEMO),
    drug(GI, "ビオフェルミン散剤", "ビフィズス菌", "powder", 0, "memo", note=MEMO),
    drug(GI, "ビオフェルミン配合散", "ラクトミン・糖化菌", "powder", 0, "memo", note=MEMO),
    drug(GI, "ビオフェルミンR散", "耐性乳酸菌", "powder", 0, "memo", note=MEMO),
    drug(GI, "レベニンS散", "ビフィズス菌", "powder", 0, "memo", note=MEMO),
    drug(GI, "レベニン散", "耐性乳酸菌", "powder", 0, "memo", note=MEMO),
    drug(GI, "ロートエキス散10%", "ロートエキス", "powder", 100, "memo", note=MEMO),
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
    drug(AN, "幼児用PL配合顆粒", "サリチルアミド・アセトアミノフェン配合", "other", 0, "memo", note=MEMO),
    # ---- その他の内服 ----
    drug(OT, "トランサミン散50%", "トラネキサム酸", "powder", 500, "memo", note="シロップの年齢別用量を参考にする場合も、" + MEMO),
    drug(OT, "トランサミンシロップ5%", "トラネキサム酸", "syrup", 50, "age", bands=TRANEXAMIC, times=3, note="1日量を3〜4回に分ける"),
    drug(OT, "コンバントリンドライシロップ100", "ピランテル", "powder", 100, "dose", minPerKg=10, maxPerKg=10, times=1,
         note="蟯虫：1回10mg/kgを1回だけ"),
    drug(OT, "チラーヂンS散0.01%", "レボチロキシン", "powder", 100, "memo", amountUnit="μg", note=MEMO),
    drug(OT, "イーケプラドライシロップ50%", "レベチラセタム", "powder", 500, "day", minPerKg=20, maxPerKg=60, times=2,
         maxDailyMg=3000, note="1日20mg/kgから開始し最高60mg/kg。体重50kg以上は成人量"),
    drug(OT, "メラトベル顆粒小児用0.2%", "メラトニン", "powder", 2, "age", bands=[B(6, 0), B(16, 1, 4, times=1)], times=1,
         note="6〜15歳：1日1回1mgを就寝前から開始、最高4mg"),
    drug(OT, "ガバペンシロップ5%", "ガバペンチン", "syrup", 50, "day", minPerKg=25, maxPerKg=35, times=3, maxDailyPerKg=50,
         note="3〜12歳。1日目10mg/kg・2日目20mg/kgで増量。維持量は3〜4歳40mg/kg/日、5〜12歳25〜35mg/kg/日"),
    drug(OT, "ケイツーシロップ0.2%", "メナテトレノン", "syrup", 2, "memo", note="新生児・乳児のビタミンK欠乏の予防。" + MEMO),
    drug(OT, "セルシンシロップ0.1%", "ジアゼパム", "syrup", 1, "age", bands=[B(4, 1, 5), B(13, 2, 10)], times=3,
         note="3歳以下 1日1〜5mg、4〜12歳 1日2〜10mg を1日1〜4回"),
    drug(OT, "デパケンシロップ5%", "バルプロ酸ナトリウム", "syrup", 50, "memo", note=MEMO),
    drug(OT, "ニフランシロップ", "", "syrup", 0, "memo", note=MEMO),
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
         note="1回0.5〜1mg/kgを1日1〜2回。規格12.5・25・50mg。インフルエンザでは使わない"),
    drug(SU, "テレミンソフト坐剤", "ビサコジル", "other", 0, "memo", note="乳幼児は2mg坐剤を1回1個、1日1〜2回。" + MEMO),
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
    drug(TB, "エバステル錠", "エバスチン", "other", 0, "memo", note=MEMO),
    drug(TB, "アレジオン錠", "エピナスチン", "other", 0, "memo", note=MEMO),
    drug(TB, "オノンカプセル", "プランルカスト", "other", 0, "memo", note=MEMO),
    drug(TB, "シングレアチュアブル錠5mg", "モンテルカスト", "other", 0, "age", bands=[B(6, 0), B(15, 5, times=1)], times=1,
         note="6歳以上 5mgを1日1回就寝前"),
    drug(TB, "ネキシウムカプセル", "エソメプラゾール", "other", 0, "weight", bands=[B(20, 10, times=1), B(500, 10, 20, times=1)], times=1,
         note="1歳以上。体重20kg未満 1回10mg、20kg以上 1回10〜20mg を1日1回"),
    drug(TB, "オゼックス錠小児用", "トスフロキサシン", "other", 0, "memo", note=MEMO),
    drug(TB, "ゾコーバ錠", "エンシトレルビル", "other", 0, "memo", note="12歳以上。1日目375mg、2〜5日目125mgを1日1回。" + MEMO),
    # ---- 点鼻 ----
    drug(NA, "フルチカゾン点鼻液25μg小児用", "フルチカゾン", "other", 0, "memo", note="1回各鼻腔に1噴霧を1日2回"),
    drug(NA, "アラミスト点鼻液", "フルチカゾンフランカルボン酸エステル", "other", 0, "memo", note="小児：1回各鼻腔に1噴霧を1日1回"),
    drug(NA, "ナゾネックス点鼻液", "モメタゾン", "other", 0, "memo", note="小児（3〜12歳未満）：1回各鼻腔に1噴霧を1日1回"),
    drug(NA, "ザジテン点鼻液", "ケトチフェン", "other", 0, "memo", note="1回各鼻腔に1噴霧を1日4回"),
    drug(NA, "インタール点鼻液", "クロモグリク酸", "other", 0, "memo", note="1回各鼻腔に1噴霧を1日6回"),
    drug(NA, "リノコートパウダースプレー", "ベクロメタゾン", "other", 0, "memo", note="1回各鼻腔に1噴霧を1日2回"),
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
         note="結膜炎：1回1滴を1日2回2日間、その後1日1回5日間"),
    # ---- 外用 ----
    drug(TO, "プロトピック軟膏0.03%小児用", "タクロリムス", "other", 0, "memo",
         note="2〜15歳。1日1〜2回。1回の塗布量の上限は体重で決まる（〜20kg 1g、20〜50kg 2〜4g、50kg以上 5g）"),
    drug(TO, "コレクチム軟膏0.25%", "デルゴシチニブ", "other", 0, "memo", note="小児：1日2回。1回5gまで（体格に応じて減らす）"),
    drug(TO, "モイゼルト軟膏0.3%", "ジファミラスト", "other", 0, "memo", note="小児：1日2回適量。症状により1%を使う"),
]

out = {"version": V, "drugs": presets}
here = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(here, "..", "data", "ped_presets.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
print(len(presets), "品目")
