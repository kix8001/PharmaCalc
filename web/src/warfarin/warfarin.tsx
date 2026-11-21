// ワルファリン（ワーファリン手帳）：PT-INR の目標域と判定・相互作用（添付文書の 10.1 併用禁忌・10.2 併用注意）・食事と生活・服薬指導のチェック
// 相互作用のデータは data/warfarin.json（tools/make_warfarin.py で PMDA の電子添文から作る）
import { useEffect, useState } from 'preact/hooks'
import { ChevronDown, ChevronUp, Search } from 'lucide-preact'
import { ButtonRow, NumField, Page, ResultRow, Section, SelectRow, Toggle, openExternal } from '../ui/components'
import { fmt, matchesSearch, parseNum } from '../core/format'

interface Row {
  /** 区分（いちばん上の名前）・薬剤名・臨床症状と措置・機序と危険因子 */
  h: string
  d: string[]
  s: string
  m: string
  /** 1：作用が強くなる（PT-INR↑・出血）、-1：弱くなる、2：両方、0：そのほか */
  e: number
}
interface WarfarinData {
  source: string
  doc: string
  contra: Row[]
  caution: Row[]
}
let pr: Promise<WarfarinData> | null = null
const load = () => (pr ??= import('../../../data/warfarin.json').then((m) => (m.default ?? m) as unknown as WarfarinData))

/** PT-INR の目標域（日本のガイドライン）。[キー, 名前, 下限, 上限, 根拠] */
const TARGETS: [string, string, number, number, string][] = [
  ['af', '心房細動（70歳未満）', 2.0, 3.0, '日本循環器学会／日本不整脈心電学会 2020年改訂版 不整脈薬物治療ガイドライン'],
  ['af70', '心房細動（70歳以上）', 1.6, 2.6, '日本循環器学会／日本不整脈心電学会 2020年改訂版 不整脈薬物治療ガイドライン'],
  ['vte', '深部静脈血栓症・肺塞栓症', 1.5, 2.5, '日本循環器学会 肺血栓塞栓症および深部静脈血栓症の診断、治療、予防に関するガイドライン（2017年改訂版）'],
  ['avr', '機械弁（大動脈弁・血栓塞栓症のリスクなし）', 2.0, 2.5, '日本循環器学会 2020年改訂版 弁膜症治療のガイドライン'],
  ['mvr', '機械弁（僧帽弁、またはリスクあり）', 2.0, 3.0, '日本循環器学会 2020年改訂版 弁膜症治療のガイドライン'],
  ['bio', '生体弁（術後3か月まで）', 2.0, 2.5, '日本循環器学会 2020年改訂版 弁膜症治療のガイドライン'],
  ['custom', '医師の指示（自分で入れる）', 0, 0, ''],
]

type Tab = 'inr' | 'drug' | 'life' | 'check'

export function WarfarinPage() {
  const [tab, setTab] = useState<Tab>('inr')
  return (
    <Page title="ワルファリン">
      <div class="row" style={{ background: 'transparent' }}>
        <div class="segmented" role="tablist" aria-label="ワルファリンの項目">
          {(
            [
              ['inr', 'PT-INR'],
              ['drug', '相互作用'],
              ['life', '食事・生活'],
              ['check', 'チェック'],
            ] as [Tab, string][]
          ).map(([k, l]) => (
            <button role="tab" aria-selected={tab === k} class={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {tab === 'inr' && <InrTab />}
      {tab === 'drug' && <DrugTab />}
      {tab === 'life' && <LifeTab />}
      {tab === 'check' && <CheckTab />}
    </Page>
  )
}

/* ───────── PT-INR ───────── */

function InrTab() {
  const [k, setK] = useState('af')
  const [inr, setInr] = useState('')
  const [lo, setLo] = useState('')
  const [hi, setHi] = useState('')
  const t = TARGETS.find((x) => x[0] === k)!
  const min = k === 'custom' ? parseNum(lo) : t[2]
  const max = k === 'custom' ? parseNum(hi) : t[3]
  const v = parseNum(inr)
  const ok = v != null && v > 0 && min != null && max != null && max > min
  return (
    <>
      <Section header="目標域" footer={t[4] ? `${t[4]}による目安。患者ごとの目標は医師の指示を優先します。` : '医師に指示された目標域を入れてください。'}>
        <SelectRow<string> label="対象" options={TARGETS.map((x) => [x[0], x[1]])} value={k} onChange={setK} />
        {k === 'custom' ? (
          <>
            <NumField title="下限" value={lo} onChange={setLo} />
            <NumField title="上限" value={hi} onChange={setHi} />
          </>
        ) : (
          <div class="row select-row">
            <span>PT-INR の目標域</span>
            <b>
              {fmt(t[2], 1)}〜{fmt(t[3], 1)}
            </b>
          </div>
        )}
      </Section>
      <Section header="今回の PT-INR">
        <NumField title="PT-INR" value={inr} onChange={setInr} placeholder="例：2.3" />
        {ok &&
          (v! < min! ? (
            <ResultRow title="判定" value="目標より低い" note="効きが弱い状態（血栓・塞栓のリスク）。飲み忘れ・ビタミンKの多い食品・併用薬の変化がないか確認し、医師に伝えます。" color="orange" />
          ) : v! > max! ? (
            <ResultRow
              title="判定"
              value="目標より高い"
              note={`効きすぎの状態（出血のリスク）。出血の症状がないか確認し、医師に伝えます。併用薬（抗菌薬・抗真菌薬など）・食事量の低下・体調の変化がないか確認。${v! >= 4 ? '値がかなり高いので、早めに医師へ。' : ''}`}
              color="red"
            />
          ) : (
            <ResultRow title="判定" value="目標域の中" note={`${fmt(min!, 1)}〜${fmt(max!, 1)} の中です。`} color="accent" />
          ))}
      </Section>
      <Section header="PT-INR が高いとき・出血したとき（参考）">
        <div class="row small" style={{ display: 'block' }}>
          出血が無く値が高いだけなら、医師の判断で休薬や減量をして測り直します。重い出血や緊急の手術では、ビタミンK（ケイツーN 静注など）や、プロトロンビン複合体（ケイセントラ）で効果を打ち消します。いずれも医師の判断で行います。
        </div>
        <div class="row small" style={{ display: 'block' }}>
          抜歯は、PT-INR が治療域（3.0以下が目安）ならワルファリンを続けたまま行うのが基本です（日本有病者歯科医療学会ほか「抗血栓療法患者の抜歯に関するガイドライン」）。自己判断で休薬しないよう伝えます。
        </div>
      </Section>
    </>
  )
}

/* ───────── 相互作用 ───────── */

const EFFECT: Record<number, [string, string]> = {
  1: ['作用↑', 'up'],
  [-1]: ['作用↓', 'down'],
  2: ['↑↓', 'both'],
  0: ['注意', 'other'],
}

function DrugTab() {
  const [d, setD] = useState<WarfarinData | null>(null)
  const [q, setQ] = useState('')
  const [f, setF] = useState<'all' | 'up' | 'down'>('all')
  useEffect(() => {
    load().then(setD)
  }, [])
  const hit = (r: Row) => (!q.trim() || matchesSearch(`${r.h} ${r.d.join(' ')} ${r.s}`, q)) && (f === 'all' || (f === 'up' ? r.e === 1 || r.e === 2 : r.e === -1 || r.e === 2))
  const contra = d ? d.contra.filter(hit) : []
  const caution = d ? d.caution.filter(hit) : []
  return (
    <>
      <label class="search">
        <Search size={18} />
        <input type="search" placeholder="薬の名前・薬効で探す（例：クラリス、アゾール、納豆）" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      </label>
      <Section>
        <div class="row">
          <div class="segmented" role="radiogroup" aria-label="作用">
            {(
              [
                ['all', 'すべて'],
                ['up', '作用が強くなる（INR↑）'],
                ['down', '弱くなる（INR↓）'],
              ] as ['all' | 'up' | 'down', string][]
            ).map(([k, l]) => (
              <button role="radio" aria-checked={f === k} class={f === k ? 'on' : ''} onClick={() => setF(k)}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </Section>
      {!d && (
        <Section>
          <div class="row sub">読み込んでいます…</div>
        </Section>
      )}
      {d && contra.length > 0 && (
        <Section header="併用禁忌（一緒に使わない）">
          {contra.map((r) => (
            <WRow key={r.h + r.d.join()} r={r} contra />
          ))}
        </Section>
      )}
      {d && (
        <Section
          header={`併用注意（${caution.length}件）`}
          footer={`${d.source}の文言どおり。押すと症状・措置と機序が開きます。製品名ではなく成分名・薬効で載っています。名前が無くても同じ系統の薬（「アゾール系」「マクロライド系」など）に当てはまることがあります。`}
        >
          {caution.length ? caution.map((r) => <WRow key={r.h + r.d.join()} r={r} />) : <div class="row sub">見つかりませんでした</div>}
        </Section>
      )}
      {d && (
        <Section>
          <ButtonRow onClick={() => openExternal(`https://www.pmda.go.jp/PmdaSearch/iyakuDetail/${d.doc}`)}>ワーファリンの添付文書を開く</ButtonRow>
        </Section>
      )}
    </>
  )
}

/** 表示する薬の名前：「(グラケー)」のような括弧だけの項目は前の名前につなぐ。前が無ければ区分の名前につなぐ */
function drugNames(r: Row): { main: string; sub: string } {
  const out: string[] = []
  let head = false
  for (const x of r.d) {
    if (/^[(（]/.test(x)) {
      if (out.length) out[out.length - 1] += x
      else {
        out.push(r.h + x)
        head = true
      }
    } else out.push(x)
  }
  if (!out.length) return { main: r.h, sub: '' }
  return { main: out.join('、'), sub: head ? '' : r.h }
}

function WRow({ r, contra }: { r: Row; contra?: boolean; key?: string }) {
  const [open, setOpen] = useState(false)
  const nm = drugNames(r)
  const [label, cls] = EFFECT[r.e]
  return (
    <div class={'row wf-row' + (contra ? ' contra' : '')}>
      <button class="wf-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span class={'wf-eff ' + (contra ? 'contra' : cls)}>{contra ? '禁忌' : label}</span>
        <span class="otc-main">
          <b>{nm.main}</b>
          {nm.sub && <span class="small sub">{nm.sub}</span>}
        </span>
        {open ? <ChevronUp size={18} class="sub" /> : <ChevronDown size={18} class="sub" />}
      </button>
      {open && (
        <div class="wf-body small">
          <div>
            <span class="sub">臨床症状・措置方法</span>
            <p>{r.s}</p>
          </div>
          {r.m && (
            <div>
              <span class="sub">機序・危険因子</span>
              <p>{r.m}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ───────── 食事・生活 ───────── */

function LifeTab() {
  return (
    <>
      <Section header="食べ物" footer="ビタミンKはワルファリンの効果を弱めます（添付文書の併用注意：納豆・クロレラ食品・青汁は避ける、そのほかのビタミンKを含む食品は一時的に大量に食べない）。">
        <div class="row wf-life">
          <span class="wf-eff contra">×</span>
          <span>
            <b>納豆・クロレラ・青汁</b>
            <span class="small sub" style={{ display: 'block' }}>
              食べない・飲まない（少しでも効果が弱くなる。納豆は腸の中でビタミンKが作られ続ける）
            </span>
          </span>
        </div>
        <div class="row wf-life">
          <span class="wf-eff down">△</span>
          <span>
            <b>緑黄色野菜（ほうれん草・ブロッコリー・小松菜など）・海藻</b>
            <span class="small sub" style={{ display: 'block' }}>
              毎日同じくらいの量なら食べてよい。急にたくさん食べない
            </span>
          </span>
        </div>
        <div class="row wf-life">
          <span class="wf-eff both">△</span>
          <span>
            <b>お酒</b>
            <span class="small sub" style={{ display: 'block' }}>
              控えめに。たくさん飲む・急に量が変わると、効き方が強くも弱くもなる
            </span>
          </span>
        </div>
        <div class="row wf-life">
          <span class="wf-eff down">×</span>
          <span>
            <b>セント・ジョーンズ・ワート（セイヨウオトギリソウ）のサプリ</b>
            <span class="small sub" style={{ display: 'block' }}>
              効果が弱くなる。サプリ・健康食品は飲む前に相談
            </span>
          </span>
        </div>
      </Section>
      <Section header="出血のサイン（あればすぐ連絡）">
        <div class="row small" style={{ display: 'block' }}>
          鼻血・歯ぐきの出血が止まりにくい、あざができやすい、赤い・茶色の尿、黒い便・血の混じった便、血を吐く、せきに血が混じる、月経の量が多い、急なひどい頭痛・手足のしびれ（頭の中の出血）
        </div>
      </Section>
      <Section header="生活">
        <div class="row small" style={{ display: 'block' }}>
          ・毎日同じ時間に飲む。PT-INR を決まった間隔で測る
          <br />
          ・飲み忘れ：気づいたのがその日のうちなら1回分を飲む。次の日に2回分を飲まない（医師の指示があればそれに従う）
          <br />
          ・ほかの病院・歯科・薬局では、ワルファリンを飲んでいることを伝える（お薬手帳・カードを見せる）
          <br />
          ・抜歯・手術・内視鏡の前は主治医に相談。自分の判断で休まない
          <br />
          ・新しい薬・市販薬（痛み止め・かぜ薬など）・サプリは相談してから
          <br />
          ・けが・転倒に気をつける（ひげそりは電気かみそり、やわらかい歯ブラシ）
          <br />
          ・妊娠の可能性があれば必ず相談（妊婦には使わない）
        </div>
      </Section>
    </>
  )
}

/* ───────── 指導チェック ───────── */

const CHECKS: [string, string][] = [
  ['dose', '今日の量（何mg・何錠）と飲む時間を確認した'],
  ['inr', '最近の PT-INR の値と測った日を確認した'],
  ['miss', '飲み忘れ・飲みすぎが無い'],
  ['bleed', '出血のサイン（鼻血・歯ぐき・あざ・尿や便の色）が無い'],
  ['drug', '新しく始まった薬・やめた薬が無い（ほかの病院・歯科・市販薬も）'],
  ['abx', '抗菌薬・抗真菌薬・痛み止めなどを最近使っていない'],
  ['food', '納豆・クロレラ・青汁を食べていない。食事の量が急に変わっていない'],
  ['supp', 'サプリ・健康食品（セント・ジョーンズ・ワートなど）を飲んでいない'],
  ['alc', 'お酒の量が変わっていない'],
  ['sick', '体調の変化（発熱・下痢・食欲がない）が無い'],
  ['proc', '抜歯・手術・内視鏡の予定があれば、主治医に伝えてある'],
  ['card', 'ワルファリン手帳・カード（お薬手帳）を持っている'],
]

function CheckTab() {
  const [v, setV] = useState<Record<string, boolean>>({})
  const n = CHECKS.filter(([k]) => v[k]).length
  return (
    <Section
      header={`服薬指導のチェック（${n}/${CHECKS.length}）`}
      footer="確認できた項目をオンにします。この画面の内容は保存しません（閉じると消えます）。当てはまらない項目は、医師への連絡や指導の目安にしてください。"
    >
      {CHECKS.map(([k, l]) => (
        <Toggle label={l} value={!!v[k]} onChange={(x) => setV((o) => ({ ...o, [k]: x }))} />
      ))}
      <ButtonRow onClick={() => setV({})}>チェックを外す</ButtonRow>
    </Section>
  )
}
