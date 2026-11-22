import changelog from './changelog.json'
import type { VNode } from 'preact'
import type { LucideIcon } from 'lucide-preact'
import { useEffect, useState } from 'preact/hooks'
import {
  ArrowLeftRight,
  Baby,
  Cake,
  Calculator,
  Calendar,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  BadgePercent,
  BadgeJapaneseYen,
  FileHeart,
  Hourglass,
  CirclePlus,
  CircleMinus,
  ClipboardList,
  Clock,
  Droplet,
  Droplets,
  FileText,
  FlaskConical,
  Info,
  JapaneseYen,
  ListChecks,
  MinusCircle,
  PersonStanding,
  Pill,
  RefreshCw,
  Scale,
  ScanBarcode,
  ScanLine,
  Search,
  SquareDivide,
  Sunrise,
  Syringe,
  TestTubes,
  UserPlus,
  Utensils,
  Wind,
  Activity,
  Brain,
  CalendarCheck,
  ClipboardCheck,
  Heart,
  HeartPulse,
  Siren,
  NotebookPen,
} from 'lucide-preact'
import { ButtonRow, ClearCtx, LabeledRow, Page, Section, openExternal, toast } from './ui/components'
import { clearPatient } from './core/patient'
import { Stack, useNav } from './ui/nav'
import { matchesSearch } from './core/format'
import { persistedStore, useStore } from './core/store'
import { BodyPage, RenalPage } from './calc/renal'
import { AgePage, CyclePage, EndDatePage, NextVisitPage, ValidityPage } from './calc/days'
import { RemainingPage, UnevenPage } from './calc/quantity'
import { PediatricPage, PowderPage, WeightDosePage } from './calc/dose'
import { DripPage, GammaPage } from './calc/injection'
import { OpioidPage, SteroidPage } from './calc/convert'
import { DilutionPage, NutritionPage, OxygenPage, PCAPage } from './calc/homecare'
import { FeePage, LabPage } from './calc/labfee'
import { RemainderPage } from './calc/remainder'
import { PedDosePage } from './ped/pedViews'
import { RenalDrugsPage } from './renal/renalDrugs'
import { HistoryPage, ScanPage } from './barcode/scan'
import { PillCountPage } from './pill/pillView'
import { OtcPage, SenteiPage } from './otc/otcViews'
import { LimitsPage } from './limits/limits'
import { NewDrugPage } from './newdrug/newdrug'
import { WarfarinPage } from './warfarin/warfarin'
import { InstallBanner, InstallInfo } from './ui/install'
import { AnticholinergicPage, Chads2Page, Cha2ds2VascPage, FastPage, HasBledPage, JcsPage, NaranjoPage, NyhaPage } from './calc/scales'
import { RmpPage } from './rmp/rmp'
import { IdentPage } from './barcode/ident'
import { PMDA } from './barcode/gs1'

/** 計算の分類（タイルの色） */
const groups = [
  { id: 'renal', name: '腎機能・体格・検査値', color: '#1d6ff2' },
  { id: 'days', name: '日数・日付', color: '#e8730c' },
  { id: 'quantity', name: '数量・残薬', color: '#1f9d4a' },
  { id: 'dose', name: '用量', color: '#9b4dd6' },
  { id: 'injection', name: '注射・点滴', color: '#e0306b' },
  { id: 'convert', name: '換算', color: '#5150d8' },
  { id: 'homeCare', name: '在宅', color: '#8f6b45' },
  { id: 'insurance', name: '保険・負担金', color: '#1592b8' },
  { id: 'scale', name: 'スケール・スコア', color: '#5b6b82' },
  { id: 'tools', name: 'バーコード・その他', color: '#0e7c86' },
] as const
type GroupId = (typeof groups)[number]['id']
const groupColor = (g: GroupId) => groups.find((x) => x.id === g)!.color

interface CalcItem {
  id: string
  title: string
  short: string
  subtitle: string
  keywords: string
  icon: LucideIcon
  group: GroupId
  page: () => VNode
  /** クリアボタン：'local' はその画面の入力だけ、'patient' は患者情報（共通）も消す。無ければボタンを出さない */
  clear?: 'local' | 'patient'
}

/** 電卓の一覧（ホーム画面・検索・タイルで共通。iOS の CalcItem と同じ並び） */
const items: CalcItem[] = [
  { id: 'renal', title: '腎機能（CCr・eGFR）', short: '腎機能', subtitle: 'Cockcroft-Gault・日本人eGFR・シスタチンC', keywords: 'ccr egfr クレアチニン 腎 シスタチン', icon: Droplet, group: 'renal', page: () => <RenalPage /> },
  { id: 'renalDrugs', title: '腎機能で注意する薬（添付文書）', short: '腎機能と薬', subtitle: 'CCr・eGFRで減量・禁忌がある薬と添付文書の記載', keywords: '腎 ccr egfr 減量 禁忌 用量調節 添付文書 透析', icon: ListChecks, group: 'renal', page: () => <RenalDrugsPage /> },
  { id: 'body', title: 'BMI・理想体重・体表面積', short: 'BMI', subtitle: 'BMI・理想体重、体表面積（DuBois・藤本・Mosteller）', keywords: 'bsa bmi ibw 体重 身長', icon: PersonStanding, group: 'renal', page: () => <BodyPage /> },
  { id: 'lab', title: 'Child-Pugh・補正Ca', short: 'Child-Pugh', subtitle: '肝機能の重症度・アルブミン補正', keywords: 'カルシウム ca アルブミン 肝 child pugh 検査', icon: TestTubes, group: 'renal', page: () => <LabPage /> },
  { id: 'endDate', title: '服用終了日', short: '服用終了日', subtitle: '開始日＋処方日数 → 最終服用日', keywords: '日数 日付 カレンダー', icon: Calendar, group: 'days', page: () => <EndDatePage /> },
  { id: 'nextVisit', title: '次回受診までの日数', short: '次回受診', subtitle: '受診日までに必要な日数・錠数', keywords: '日数 日付 カレンダー', icon: CalendarClock, group: 'days', page: () => <NextVisitPage /> },
  { id: 'validity', title: '処方箋の有効期限', short: '処方箋期限', subtitle: '交付日を含めて4日', keywords: '処方せん 期限 4日', icon: FileText, group: 'days', page: () => <ValidityPage /> },
  { id: 'cycle', title: '休薬期間のある処方', short: '休薬サイクル', subtitle: '3週投与1週休薬など', keywords: '休薬 クール 抗がん剤', icon: RefreshCw, group: 'days', page: () => <CyclePage /> },
  { id: 'age', title: '年齢・月齢', short: '年齢・月齢', subtitle: '生年月日から年齢・月齢・日齢', keywords: '誕生日 月齢', icon: Cake, group: 'days', page: () => <AgePage /> },
  { id: 'pillCount', title: '錠剤カウント（カメラ）', short: '錠剤カウント', subtitle: 'バラ錠を撮影して数える', keywords: 'カウント 数える 写真 撮影 バラ 監査', icon: ScanLine, group: 'quantity', page: () => <PillCountPage /> },
  { id: 'remainder', title: '余り電卓', short: '余り電卓', subtitle: '割り算のあまり・シート＋バラを大きなキーで', keywords: '余り あまり 割り算 電卓 シート バラ', icon: SquareDivide, group: 'quantity', page: () => <RemainderPage /> },
  { id: 'remaining', title: '残薬調整', short: '残薬調整', subtitle: '残薬を差し引いた処方日数・数量', keywords: '残薬 余り 調整', icon: MinusCircle, group: 'quantity', page: () => <RemainingPage /> },
  { id: 'uneven', title: '不均等投与の総数', short: '不均等投与', subtitle: '朝2・夕1など', keywords: '朝 昼 夕 寝る前', icon: Sunrise, group: 'quantity', page: () => <UnevenPage /> },
  { id: 'powder', title: '散剤の換算（mg ⇄ g）', short: '散剤換算', subtitle: '成分量 ⇄ 製剤量、1包あたり', keywords: '散 力価 % 包', icon: Scale, group: 'dose', page: () => <PowderPage /> },
  { id: 'pediatric', title: '小児薬用量（成人量から）', short: '小児薬用量', subtitle: 'Augsberger・von Harnack・Young', keywords: '小児 子供 こども', icon: Baby, group: 'dose', page: () => <PediatricPage /> },
  {
    id: 'pedDrugs',
    title: '小児用量（薬剤別）',
    short: '小児用量',
    subtitle: '年齢・体重から主な小児薬の用量を一覧（薬は登録できる）',
    keywords: '小児 子供 こども ムコダイン ムコソルバン トランサミン カロナール 抗生剤 シロップ ds 散',
    icon: ClipboardList,
    group: 'dose',
    page: () => <PedDosePage />,
  },
  { id: 'weightDose', title: '体重あたりの用量', short: '体重あたり', subtitle: 'mg/kg/日 → 1回量', keywords: 'mg/kg', icon: UserPlus, group: 'dose', page: () => <WeightDosePage /> },
  { id: 'drip', title: '点滴の滴下速度', short: '点滴速度', subtitle: 'mL/h・滴/分', keywords: '輸液 滴下', icon: Droplets, group: 'injection', page: () => <DripPage /> },
  { id: 'gamma', title: 'γ計算（μg/kg/min）', short: 'γ計算', subtitle: 'γ ⇄ mL/h', keywords: 'ガンマ 持続 シリンジ', icon: Syringe, group: 'injection', page: () => <GammaPage /> },
  { id: 'opioid', title: 'オピオイド換算', short: 'オピオイド', subtitle: '経口モルヒネ換算・切り替え・レスキュー量', keywords: '麻薬 オピオイド モルヒネ オキシコドン フェンタニル レスキュー がん 緩和 在宅', icon: ArrowLeftRight, group: 'convert', page: () => <OpioidPage /> },
  { id: 'steroid', title: 'ステロイド換算', short: 'ステロイド', subtitle: 'プレドニゾロン換算', keywords: 'ステロイド プレドニゾロン デキサメタゾン 換算', icon: Pill, group: 'convert', page: () => <SteroidPage /> },
  { id: 'pca', title: '持続皮下注・PCA', short: 'PCA', subtitle: '流量・早送り量・薬液が何日もつか', keywords: 'pca 持続皮下 シリンジ ポンプ 在宅 緩和 早送り', icon: Syringe, group: 'homeCare', page: () => <PCAPage /> },
  { id: 'nutrition', title: '栄養・輸液（必要量・NPC/N）', short: '栄養・輸液', subtitle: '必要エネルギー・水分・たんぱく、輸液のカロリー', keywords: '栄養 カロリー 輸液 tpn 経腸 harris benedict 水分 npc 在宅', icon: Utensils, group: 'homeCare', page: () => <NutritionPage /> },
  { id: 'oxygen', title: '酸素ボンベの残り時間', short: '酸素ボンベ', subtitle: '在宅酸素の残量と使える時間', keywords: '酸素 ボンベ hot 在宅 同調器', icon: Wind, group: 'homeCare', page: () => <OxygenPage /> },
  { id: 'dilution', title: '消毒液の希釈', short: '消毒液', subtitle: '次亜塩素酸ナトリウムなどの作り方', keywords: '消毒 次亜塩素酸 ハイター ノロ 希釈 ppm 在宅', icon: FlaskConical, group: 'homeCare', page: () => <DilutionPage /> },
  {
    id: 'otc',
    title: 'OTC類似薬チェック',
    short: 'OTC類似薬',
    subtitle: 'バーコードや名前で、薬剤費の4分の1の別途の負担の対象かを調べる',
    keywords: 'otc 類似薬 一部保険外療養 特別の料金 4分の1 バーコード 対象 判定',
    icon: BadgePercent,
    group: 'insurance',
    page: () => <OtcPage />,
  },
  {
    id: 'sentei',
    title: '選定療養チェック',
    short: '選定療養',
    subtitle: 'バーコードや名前で、長期収載品の選定療養（価格差の2分の1）の対象かを調べる',
    keywords: '選定療養 長期収載品 先発品 後発品 ジェネリック 患者希望 特別の料金 2分の1 バーコード 対象 判定',
    icon: BadgeJapaneseYen,
    group: 'insurance',
    page: () => <SenteiPage />,
  },
  {
    id: 'limits',
    title: '投与日数制限チェック',
    short: '日数制限',
    subtitle: 'バーコードや名前で、向精神薬・麻薬などの1回の投与日数の上限（14・30・90日）と、同じ適応症で上限のない薬を調べる',
    keywords: '投与日数 処方日数 日数制限 14日 30日 90日 向精神薬 麻薬 睡眠薬 眠剤 抗不安薬 てんかん 告示 バーコード',
    icon: Hourglass,
    group: 'insurance',
    page: () => <LimitsPage />,
  },
  {
    id: 'newDrug',
    title: '新薬の処方日数制限',
    short: '新薬14日',
    subtitle: '新医薬品は薬価収載の翌月から1年は14日分まで。制限中の薬と解除日の一覧',
    keywords: '新薬 新医薬品 14日 14日ルール 処方日数 投与日数 長期処方 解除 解禁 薬価収載',
    icon: CalendarCheck,
    group: 'insurance',
    page: () => <NewDrugPage />,
  },
  { id: 'fee', title: '薬剤料・窓口負担', short: '負担金', subtitle: '薬価から点数（五捨五超入）と窓口負担', keywords: '点数 薬価 負担 窓口 お金 五捨五超入 保険', icon: JapaneseYen, group: 'insurance', page: () => <FeePage /> },
  {
    id: 'warfarin',
    title: 'ワルファリン（ワーファリン手帳）',
    short: 'ワルファリン',
    subtitle: 'PT-INR の目標域と判定・相互作用（添付文書）・食事と生活・服薬指導のチェック',
    keywords: 'ワルファリン ワーファリン warfarin pt-inr inr 抗凝固 相互作用 併用禁忌 併用注意 納豆 ビタミンk 手帳 出血',
    icon: NotebookPen,
    group: 'scale',
    page: () => <WarfarinPage />,
  },
  { id: 'jcs', title: 'JCS（ジャパン・コーマ・スケール）', short: 'JCS', subtitle: '意識レベル 0〜300、R・I・A', keywords: 'jcs 意識 意識障害 昏睡 3-3-9 スケール', icon: Brain, group: 'scale', page: () => <JcsPage /> },
  { id: 'nyha', title: 'NYHA心機能分類', short: 'NYHA', subtitle: '心不全の自覚症状 I〜IV度', keywords: 'nyha 心不全 心機能 分類 スケール', icon: HeartPulse, group: 'scale', page: () => <NyhaPage /> },
  { id: 'chads2', title: 'CHADS2スコア', short: 'CHADS2', subtitle: '心房細動の脳梗塞のリスク', keywords: 'chads2 心房細動 af 脳梗塞 抗凝固 doac ワルファリン スコア', icon: Activity, group: 'scale', page: () => <Chads2Page /> },
  { id: 'vasc', title: 'CHA2DS2-VAScスコア', short: 'CHA2DS2-VASc', subtitle: '心房細動の脳梗塞のリスク（性別・血管疾患も）', keywords: 'cha2ds2-vasc chads vasc 心房細動 af 脳梗塞 抗凝固 スコア', icon: Heart, group: 'scale', page: () => <Cha2ds2VascPage /> },
  { id: 'hasbled', title: 'HAS-BLEDスコア', short: 'HAS-BLED', subtitle: '抗凝固療法中の出血のリスク', keywords: 'has-bled hasbled 出血 抗凝固 doac ワルファリン スコア', icon: Droplets, group: 'scale', page: () => <HasBledPage /> },
  { id: 'anticholinergic', title: '日本版抗コリン薬リスクスケール', short: '抗コリン', subtitle: '158薬物のスコア（1〜3）と服用中の薬の合計', keywords: '抗コリン 抗コリン薬 リスクスケール 老年薬学会 高齢者 認知機能 せん妄 ポリファーマシー スコア', icon: Pill, group: 'scale', page: () => <AnticholinergicPage /> },
  { id: 'naranjo', title: 'Naranjo評価スケール', short: 'Naranjo', subtitle: '副作用と薬の因果関係（10問）', keywords: 'naranjo ナランホ 副作用 因果関係 有害事象 スケール', icon: ClipboardCheck, group: 'scale', page: () => <NaranjoPage /> },
  { id: 'fast', title: 'FAST（脳卒中のサイン）', short: 'FAST', subtitle: '顔・腕・言葉・時間（脳卒中を疑うサイン）', keywords: 'fast 脳卒中 脳梗塞 救急 119 befast', icon: Siren, group: 'scale', page: () => <FastPage /> },
  {
    id: 'rmp',
    title: '患者向けRMP資材',
    short: 'RMP資材',
    subtitle: 'バーコードや名前で、RMP（医薬品リスク管理計画）の患者向け資材（PDF）を探す',
    keywords: 'rmp リスク管理計画 患者向け資材 資材 pdf 冊子 カード 指導箋 安全性 バーコード',
    icon: FileHeart,
    group: 'tools',
    page: () => <RmpPage />,
  },
  {
    id: 'ident',
    title: '刻印・外観で探す',
    short: '刻印検索',
    subtitle: '錠剤の刻印（識別コード）・色・形から、何の薬か探す（錠剤の鑑別）',
    keywords: '刻印 識別コード 鑑別 錠剤鑑別 持参薬 色 形 外観 印字 カプセル',
    icon: Search,
    group: 'tools',
    page: () => <IdentPage />,
  },
]
const byId = new Map(items.map((c) => [c.id, c]))

// 入力のある画面にクリアボタンをつける。患者情報（共通）を入れる画面は、患者情報も消す
const patientScreens = ['renal', 'body', 'pediatric', 'pedDrugs', 'weightDose', 'gamma', 'nutrition']
const noClear = ['renalDrugs', 'pillCount', 'remainder', 'otc', 'sentei', 'limits', 'rmp', 'ident', 'newDrug', 'nyha', 'fast']
for (const c of items) if (!noClear.includes(c.id)) c.clear = patientScreens.includes(c.id) ? 'patient' : 'local'

/** 電卓の画面を開く。クリアを押したら、その画面を最初の状態から作り直す */
function CalcScreen({ c }: { c: CalcItem }) {
  const [k, setK] = useState(0)
  const clear = () => {
    if (c.clear === 'patient') clearPatient()
    setK((x) => x + 1)
    toast(c.clear === 'patient' ? '入力と患者情報をクリアしました' : '入力をクリアしました')
  }
  return (
    <ClearCtx.Provider value={c.clear ? clear : null}>
      <div key={k} style={{ display: 'contents' }}>
        {c.page()}
      </div>
    </ClearCtx.Provider>
  )
}
const open = (nav: { push: (n: VNode) => void }, c: CalcItem) => nav.push(<CalcScreen c={c} />)

/** ホームに並べるタイル（このブラウザに保存） */
const defaultTiles = ['pillCount', 'remainder', 'renal', 'body', 'endDate', 'nextVisit', 'limits', 'rmp', 'ident']
// 初期のホームの並びを変えたとき（版 2）は、一度だけ全員のホームをこの並びにする（ユーザーの指示）
try {
  if (localStorage.getItem('homeTilesVer') !== '2') {
    localStorage.setItem('homeTiles', JSON.stringify(defaultTiles))
    localStorage.setItem('homeTilesVer', '2')
  }
} catch {
  /* 保存できない端末は初期の並びのまま */
}
const tilesStore = persistedStore<string[]>('homeTiles', defaultTiles)

function TileIcon({ c, size }: { c: CalcItem; size: number }) {
  const I = c.icon
  return (
    <span class="tile-icon" style={{ background: groupColor(c.group), width: `${size}px`, height: `${size}px`, borderRadius: `${size * 0.25}px` }}>
      <I size={Math.round(size * 0.5)} color="#fff" strokeWidth={2.2} />
    </span>
  )
}

function HomePage() {
  const nav = useNav()
  const tiles = useStore(tilesStore).filter((id) => byId.has(id))
  const [query, setQuery] = useState('')
  const toggle = (id: string) => tilesStore.set((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]))

  const row = (c: CalcItem) => {
    const onHome = tiles.includes(c.id)
    return (
      <div class="row calc-row">
        <button class="calc-main" onClick={() => open(nav, c)}>
          <TileIcon c={c} size={30} />
          <span class="calc-text">
            <span>{c.title}</span>
            <span class="small sub">{c.subtitle}</span>
          </span>
        </button>
        <button class={'home-toggle ' + (onHome ? 'on' : '')} aria-label={onHome ? `${c.short}をホームから外す` : `${c.short}をホームに追加`} aria-pressed={onHome} onClick={() => toggle(c.id)}>
          {onHome ? <CircleMinus size={22} /> : <CirclePlus size={22} />}
        </button>
      </div>
    )
  }

  const filtered = items.filter((c) => matchesSearch(c.title + c.subtitle + c.keywords + c.short, query))
  return (
    <Page title="メドスキャン">
      <label class="search">
        <Search size={18} />
        <input type="search" placeholder="計算を探す" value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} />
      </label>
      {query.trim() === '' ? (
        <>
          <Section
            header={
              <>
                <span>ホーム</span>
                <button class="header-btn" onClick={() => nav.push(<TileEditPage />)}>
                  編集
                </button>
              </>
            }
            plain
          >
            {tiles.length === 0 ? (
              <div class="section-body">
                <ButtonRow icon={<CirclePlus size={20} />} onClick={() => nav.push(<TileEditPage />)}>
                  よく使う計算をホームに追加
                </ButtonRow>
              </div>
            ) : (
              <div class="tiles">
                {tiles.map((id) => {
                  const c = byId.get(id)!
                  return (
                    <button class="tile" onClick={() => open(nav, c)}>
                      <TileIcon c={c} size={56} />
                      <span class="tile-label">{c.short}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </Section>
          {groups.map((g) => (
            <Section header={g.name}>{items.filter((c) => c.group === g.id).map(row)}</Section>
          ))}
        </>
      ) : (
        <Section>{filtered.length ? filtered.map(row) : <div class="row sub">見つかりませんでした</div>}</Section>
      )}
    </Page>
  )
}

/** ホームのタイルを選ぶ・並べ替える */
function TileEditPage() {
  const tiles = useStore(tilesStore).filter((id) => byId.has(id))
  const move = (i: number, d: number) =>
    tilesStore.set((t) => {
      const a = [...t]
      const j = i + d
      if (j < 0 || j >= a.length) return a
      ;[a[i], a[j]] = [a[j], a[i]]
      return a
    })
  return (
    <Page title="ホームの編集">
      <Section header={`ホームに表示（${tiles.length}個）`} footer="▲▼で並べ替え、赤いボタンで外します。">
        {tiles.length === 0 && <div class="row sub">下の一覧から追加してください</div>}
        {tiles.map((id, i) => {
          const c = byId.get(id)!
          return (
            <div class="row edit-row">
              <button class="home-toggle on" aria-label={`${c.short}を外す`} onClick={() => tilesStore.set((t) => t.filter((x) => x !== id))}>
                <CircleMinus size={22} />
              </button>
              <TileIcon c={c} size={30} />
              <span class="calc-text">{c.title}</span>
              <button class="move" aria-label={`${c.short}を上へ`} disabled={i === 0} onClick={() => move(i, -1)}>
                <ChevronUp size={22} />
              </button>
              <button class="move" aria-label={`${c.short}を下へ`} disabled={i === tiles.length - 1} onClick={() => move(i, 1)}>
                <ChevronDown size={22} />
              </button>
            </div>
          )
        })}
      </Section>
      {groups.map((g) => {
        const rest = items.filter((c) => c.group === g.id && !tiles.includes(c.id))
        if (rest.length === 0) return null
        return (
          <Section header={g.name}>
            {rest.map((c) => (
              <button class="row edit-row" onClick={() => tilesStore.set((t) => [...t, c.id])}>
                <TileIcon c={c} size={30} />
                <span class="calc-text">{c.title}</span>
                <CirclePlus size={22} color="var(--green)" />
              </button>
            ))}
          </Section>
        )
      })}
      <Section>
        <ButtonRow onClick={() => tilesStore.set(defaultTiles)}>最初の並びに戻す</ButtonRow>
      </Section>
    </Page>
  )
}

/** アプリの再起動：新しい版があるか確かめてから読み込み直す（新しい版が入れば main.tsx の controllerchange でも読み込み直す） */
async function restartApp() {
  toast('再起動しています…')
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    await Promise.race([reg?.update(), new Promise((r) => setTimeout(r, 3000))])
    // 新しい版を入れている途中なら、入り終わるのを少し待つ
    if (reg?.installing) await new Promise((r) => setTimeout(r, 1500))
  } catch {
    /* 電波が無いときなどはそのまま読み込み直す */
  }
  location.reload()
}

function AboutPage() {
  return (
    <Page title="情報">
      <div class="about-logo">
        <img class="about-icon" src="./icon-192.png" alt="" />
        <img class="about-name" src="./logo.png" alt="メドスキャン" />
      </div>
      <Section>
        <LabeledRow label="バージョン" value={`${__APP_VERSION__}（Web版）`} />
      </Section>
      <Section footer="動きがおかしいときや、新しい版にしたいときに押してください。新しい版があれば入れてから起動し直します（入力中の内容は消えます）。">
        <ButtonRow icon={<RefreshCw size={20} />} onClick={restartApp}>
          アプリを再起動
        </ButtonRow>
      </Section>
      <Section header="クレジット">
        <LabeledRow label="開発" value="学術・社内広報室" />
      </Section>
      <Section header="更新の履歴" footer="新しい順。中を指で動かすと、前の版も見られます。">
        <div class="changelog">
          {changelog.map((c) => (
            <div class="changelog-row">
              <div class="changelog-v">
                <b>{c.v}</b>
                <span class="sub">{c.d.replace(/^(\d+)-(\d+)-(\d+)$/, (_, y, m, d) => `${y}年${Number(m)}月${Number(d)}日`)}</span>
              </div>
              <div class="changelog-t">{c.t}</div>
            </div>
          ))}
        </div>
      </Section>
      <Section header="ご注意">
        <div class="row small" style={{ display: 'block' }}>
          計算結果は業務の補助として使う目安です。投与量などは、添付文書・ガイドライン・医師の指示で必ず確認してください。計算の誤りによる結果について、作者は責任を負いません。
        </div>
      </Section>
      <Section header="個人情報">
        <div class="row small" style={{ display: 'block' }}>
          患者情報（年齢・体重・検査値など）は端末に保存せず、ページを閉じると消えます。計算はすべてこの端末の中で行い、患者情報をサーバーへ送ることはありません。バーコードの読み取り履歴・ホームの並び・登録した薬だけを、このブラウザの中に保存します。外部へは、添付文書を開くときにPMDAのサイトへGTINを送るだけです。
        </div>
      </Section>
      <Section header="添付文書">
        <div class="row small" style={{ display: 'block' }}>
          PTPシートや箱のGS1バーコードからGTINを読み取り、PMDA（医薬品医療機器総合機構）の電子添文ページを開きます。
        </div>
        <ButtonRow onClick={() => openExternal(PMDA.searchURL)}>PMDA 医療用医薬品 情報検索</ButtonRow>
      </Section>
      <Section header="ホーム画面に追加" footer="追加するとアプリのように1タップで開けて、電波が無いところでも使えます。">
        <InstallInfo />
      </Section>
    </Page>
  )
}

const tabs = [
  { id: 'calc', label: 'メインメニュー', icon: Calculator, root: () => <HomePage /> },
  { id: 'scan', label: '薬剤検索', icon: ScanBarcode, root: () => <ScanPage /> },
  { id: 'history', label: '履歴', icon: Clock, root: () => <HistoryPage /> },
  { id: 'about', label: '情報', icon: Info, root: () => <AboutPage /> },
]

export function App() {
  // カメラを使い直すために読み込み直したときは、薬剤検索の画面を開く（barcode/scan.tsx の resume）
  const [first] = useState(() => {
    try {
      const t = sessionStorage.getItem('reopenTab')
      sessionStorage.removeItem('reopenTab')
      return t || 'calc'
    } catch {
      return 'calc'
    }
  })
  const [tab, setTab] = useState(first)
  // バーコードのタブは開いたときに初めて作る（カメラをいきなり起動しないため）
  const [opened, setOpened] = useState<Set<string>>(new Set(['calc', first]))
  return (
    <div class="app">
      <div class="tab-content">
        {tabs.map((t) =>
          opened.has(t.id) ? (
            <div class="tab-pane" style={{ display: t.id === tab ? 'block' : 'none' }}>
              <Stack root={t.root()} active={t.id === tab} />
            </div>
          ) : null,
        )}
      </div>
      <InstallBanner />
      <nav class="tabbar" aria-label="タブ">
        {tabs.map((t) => {
          const I = t.icon
          return (
            <button
              class={t.id === tab ? 'on' : ''}
              aria-current={t.id === tab ? 'page' : undefined}
              onClick={() => {
                setOpened((o) => new Set(o).add(t.id))
                setTab(t.id)
              }}
            >
              <I size={24} />
              <span>{t.label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
