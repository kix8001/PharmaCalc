// 新医薬品の処方日数制限（14日ルール）。データは data/newdrug.json（tools/make_newdrug.py で中医協の資料から作る）
import { useEffect, useState } from 'preact/hooks'
import { ChevronRight, Search } from 'lucide-preact'
import { Page, Section } from '../ui/components'
import { useNav } from '../ui/nav'
import { matchesSearch } from '../core/format'
import { ScanSummary } from '../barcode/summary'

export interface NewDrug {
  /** 品名 */
  m: string
  /** 薬価収載日・解除日（この日から長期処方できる）。yyyy-mm-dd */
  d: string
  u: string
  /** 上限の日数（ふつうは14。例外で30・20など、0＝例外で制限なし） */
  n: number
}
interface NewDrugData {
  source: string
  items: Record<string, NewDrug>
}

let pr: Promise<NewDrugData> | null = null
export function loadNewDrugs(): Promise<NewDrugData> {
  pr ??= import('../../../data/newdrug.json').then((m) => (m.default ?? m) as unknown as NewDrugData).catch(() => ({ source: '', items: {} }))
  return pr
}

/** 今日（端末の日付）の yyyy-mm-dd */
export const todayIso = () => {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}
/** まだ制限中か（例外で制限なしの物は制限中にしない） */
export const isActive = (x: NewDrug) => x.n > 0 && todayIso() < x.u
/** 「2027年12月1日」 */
export const jpDate = (iso: string) => iso.replace(/^(\d+)-(\d+)-(\d+)$/, (_, y, m, d) => `${y}年${Number(m)}月${Number(d)}日`)
/** 画面に出す1行の文 */
export function newDrugText(x: NewDrug): string {
  if (x.n === 0) return '新医薬品（例外で処方日数の制限なし）'
  if (isActive(x)) return `${x.n}日分まで（${jpDate(x.u)}から長期処方できます）`
  return `制限は解除（${jpDate(x.u)}から）`
}

/** 解除までの日数 */
function daysLeft(u: string): number {
  return Math.round((new Date(u + 'T00:00:00').getTime() - new Date(todayIso() + 'T00:00:00').getTime()) / 86400000)
}

const RULE =
  '新医薬品（新しい有効成分・新しい投与経路の薬など）は、薬価基準に収載された月の翌月の初日から1年間、1回の処方は14日分までです（掲示事項等告示 第十 二）。中医協で「例外的な取扱い」とされた薬は30日・20日など、または制限なし。解除日からは長期処方できます。'

/** メインメニューの「新薬の処方日数制限」：解除日の順の一覧と検索 */
export function NewDrugPage() {
  const nav = useNav()
  const [d, setD] = useState<NewDrugData | null>(null)
  const [q, setQ] = useState('')
  useEffect(() => {
    loadNewDrugs().then(setD)
  }, [])
  const all = d ? Object.entries(d.items).sort((a, b) => a[1].u.localeCompare(b[1].u) || a[1].m.localeCompare(b[1].m, 'ja')) : []
  const hit = q.trim() ? all.filter(([y, x]) => matchesSearch(x.m + ' ' + y, q)) : all
  const active = hit.filter(([, x]) => isActive(x))
  const free = hit.filter(([, x]) => x.n === 0)
  const lifted = hit.filter(([, x]) => x.n > 0 && !isActive(x)).reverse()
  const open = (yj: string, x: NewDrug) =>
    nav.push(
      <Page title="新薬の処方日数制限">
        <Section>
          <ScanSummary yj={[yj]} memo={x.m} detail={`薬価収載 ${jpDate(x.d)}`} />
        </Section>
      </Page>,
    )
  const row = ([y, x]: [string, NewDrug]) => (
    <button class="row otc-row" onClick={() => open(y, x)}>
      <span class="otc-main">
        <b>{x.m}</b>
        <span class="small sub">
          収載 {jpDate(x.d)}
          {x.n !== 14 && x.n > 0 && `・例外で${x.n}日分まで`}
        </span>
      </span>
      {isActive(x) ? (
        <span class="nd-lift">
          <b>{jpDate(x.u).replace(/^\d+年/, '')}</b>
          <span class="small sub">{x.u.slice(0, 4)}年・あと{daysLeft(x.u)}日</span>
        </span>
      ) : x.n === 0 ? (
        <span class="otc-verdict no">制限なし</span>
      ) : (
        <span class="otc-verdict no">解除済み</span>
      )}
      <ChevronRight size={18} class="chev" />
    </button>
  )
  return (
    <Page title="新薬の処方日数制限">
      <label class="search">
        <Search size={18} />
        <input type="search" placeholder="薬品名で探す" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      </label>
      {!d && (
        <Section>
          <div class="row sub">読み込んでいます…</div>
        </Section>
      )}
      {d && (
        <>
          <Section header={`制限中（${active.length}品目）・右は解除日`} footer="解除日からは14日を超えて処方できます。押すとスキャンと同じ結果の画面。">
            {active.length ? active.map(row) : <div class="row sub">ありません</div>}
          </Section>
          {free.length > 0 && <Section header="例外で制限なしの新医薬品">{free.map(row)}</Section>}
          {lifted.length > 0 && <Section header="最近解除された品目（半年以内）">{lifted.map(row)}</Section>}
          <Section header="決まり" footer={`${d.source}。新しく収載された薬は、アプリの更新で足されます。必ず最新の情報で確かめてください。`}>
            <div class="row small" style={{ display: 'block' }}>
              {RULE}
            </div>
          </Section>
        </>
      )}
    </Page>
  )
}

/** スキャンの結果から開く：1品目の説明 */
export function NewDrugDetailPage({ yj, x }: { yj: string; x: NewDrug }) {
  return (
    <Page title="新薬の処方日数制限">
      <Section header={x.m}>
        <div class="row select-row">
          <span>薬価収載日</span>
          <span>{jpDate(x.d)}</span>
        </div>
        <div class="row select-row">
          <span>1回の処方の上限</span>
          <b class={isActive(x) ? 'keika' : ''}>{x.n === 0 ? '制限なし（例外）' : isActive(x) ? `${x.n}日分まで` : '制限なし（解除済み）'}</b>
        </div>
        {x.n > 0 && (
          <div class="row select-row">
            <span>解除日（長期処方できる日）</span>
            <span>
              {jpDate(x.u)}
              {isActive(x) && <span class="small sub">（あと{daysLeft(x.u)}日）</span>}
            </span>
          </div>
        )}
        <div class="row small sub num">YJコード {yj}</div>
      </Section>
      <Section header="決まり">
        <div class="row small" style={{ display: 'block' }}>
          {RULE}
          {x.n !== 14 && x.n > 0 && ` この薬は例外で${x.n}日分までです。`}
        </div>
      </Section>
    </Page>
  )
}
