// スケール・スコア：JCS・NYHA・CHADS2・CHA2DS2-VASc・HAS-BLED・日本版抗コリン薬リスクスケール・Naranjo・FAST
import type { ComponentChildren } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { Check, Minus, Plus, Search, X } from 'lucide-preact'
import { ButtonRow, Page, ResultRow, Section, Toggle } from '../ui/components'
import { matchesSearch } from '../core/format'

/** 1つを選ぶ行（説明つき） */
function Choice(props: { on: boolean; onClick: () => void; title: ComponentChildren; desc?: ComponentChildren }) {
  return (
    <button class={'row choice-row' + (props.on ? ' on' : '')} role="radio" aria-checked={props.on} onClick={props.onClick}>
      <span class="choice-mark">{props.on && <Check size={16} />}</span>
      <span class="choice-text">
        <b>{props.title}</b>
        {props.desc && <span class="small sub">{props.desc}</span>}
      </span>
    </button>
  )
}

/** 点数つきのはい／いいえ（チェックの行） */
function Item(props: { label: ComponentChildren; pts: number; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Toggle
      label={
        <span class="scale-item">
          <span>{props.label}</span>
          <span class="scale-pts">{props.pts}点</span>
        </span>
      }
      value={props.value}
      onChange={props.onChange}
    />
  )
}

/* ───────── JCS ───────── */

const JCS: [number, string, string][] = [
  [0, '0', '意識清明'],
  [1, 'I-1', 'だいたい清明だが、今ひとつはっきりしない'],
  [2, 'I-2', '見当識障害がある（時・場所・人が分からない）'],
  [3, 'I-3', '自分の名前・生年月日が言えない'],
  [10, 'II-10', '普通の呼びかけで容易に開眼する'],
  [20, 'II-20', '大きな声、または体を揺さぶることにより開眼する'],
  [30, 'II-30', '痛み刺激を加えつつ呼びかけを繰り返すと、かろうじて開眼する'],
  [100, 'III-100', '痛み刺激に対し、払いのけるような動作をする'],
  [200, 'III-200', '痛み刺激で少し手足を動かしたり、顔をしかめる'],
  [300, 'III-300', '痛み刺激に反応しない'],
]
const JCS_GROUP: [number, string][] = [
  [1, 'I. 刺激しないでも覚醒している状態（1桁）'],
  [10, 'II. 刺激すると覚醒する状態・刺激をやめると眠り込む（2桁）'],
  [100, 'III. 刺激をしても覚醒しない状態（3桁）'],
]

export function JcsPage() {
  const [v, setV] = useState<number | null>(null)
  const [r, setR] = useState(false)
  const [inc, setInc] = useState(false)
  const [a, setA] = useState(false)
  const sel = JCS.find(([n]) => n === v)
  const suffix = [r && 'R', inc && 'I', a && 'A'].filter(Boolean).join('')
  return (
    <Page title="JCS">
      {sel && (
        <Section>
          <ResultRow title="JCS" value={`${v}${suffix ? '-' + suffix : ''}`} note={`${sel[1]}${suffix ? '-' + suffix : ''}：${sel[2]}`} color="orange" />
        </Section>
      )}
      <Section>
        <Choice on={v === 0} onClick={() => setV(0)} title="0" desc="意識清明" />
      </Section>
      {JCS_GROUP.map(([g, head]) => (
        <Section header={head}>
          {JCS.filter(([n]) => n >= g && n < g * 10).map(([n, lab, desc]) => (
            <Choice on={v === n} onClick={() => setV(n)} title={lab} desc={desc} />
          ))}
        </Section>
      ))}
      <Section header="付加（あてはまれば）" footer="例：JCS 20-R（大きな声で開眼・不穏あり）。数字が大きいほど意識障害が重い。">
        <Toggle label="R：不穏（Restlessness）" value={r} onChange={setR} />
        <Toggle label="I：失禁（Incontinence）" value={inc} onChange={setInc} />
        <Toggle label="A：自発性喪失（Akinetic mutism・Apallic state）" value={a} onChange={setA} />
      </Section>
    </Page>
  )
}

/* ───────── NYHA ───────── */

const NYHA: [string, string][] = [
  ['I度', '心疾患はあるが身体活動に制限はない。日常的な身体活動では著しい疲労、動悸、呼吸困難あるいは狭心痛を生じない。'],
  ['II度', '軽度ないし中等度の身体活動の制限がある。安静時には無症状。日常的な身体活動で著しい疲労、動悸、呼吸困難あるいは狭心痛を生じる。'],
  ['III度', '高度な身体活動の制限がある。安静時には無症状。日常的な身体活動以下の労作で著しい疲労、動悸、呼吸困難あるいは狭心痛を生じる。'],
  ['IV度', '心疾患のためいかなる身体活動も制限される。心不全症状や狭心痛が安静時にも存在する。わずかな労作でこれらが増悪する。'],
]

export function NyhaPage() {
  return (
    <Page title="NYHA心機能分類">
      <Section
        header="心不全の自覚症状による分類"
        footer="II度は、身体活動に軽度の制限がある IIs（slight）と中等度の制限がある IIm（moderate）に分けることがあります。（NYHA：ニューヨーク心臓協会）"
      >
        {NYHA.map(([k, d]) => (
          <div class="row scale-read">
            <b>{k}</b>
            <span>{d}</span>
          </div>
        ))}
      </Section>
    </Page>
  )
}

/* ───────── CHADS2 ───────── */

const CHADS2_RATE = [1.9, 2.8, 4.0, 5.9, 8.5, 12.5, 18.2]

export function Chads2Page() {
  const [c, setC] = useState(false)
  const [h, setH] = useState(false)
  const [a, setA] = useState(false)
  const [d, setD] = useState(false)
  const [s, setS] = useState(false)
  const total = +c + +h + +a + +d + (s ? 2 : 0)
  return (
    <Page title="CHADS2スコア">
      <Section>
        <ResultRow
          title="CHADS2スコア"
          value={`${total}点`}
          note={`脳梗塞の年間発症率の目安 ${CHADS2_RATE[total]}%（Gage 2001、抗凝固療法なし）。${total === 0 ? '低リスク。' : '抗凝固療法の適応を検討（ガイドラインの基準を確認）。'}`}
          color="orange"
        />
      </Section>
      <Section
        header="心房細動の患者の脳梗塞のリスク"
        footer="合計0〜6点。日本の不整脈のガイドライン（日本循環器学会・日本不整脈心電学会）は CHADS2 スコアを使って抗凝固療法の適応を考えます。点数が高いほど脳梗塞のリスクが高い。最終的な判断はガイドラインと医師の判断で。"
      >
        <Item label="C：心不全（Congestive heart failure）" pts={1} value={c} onChange={setC} />
        <Item label="H：高血圧（Hypertension）" pts={1} value={h} onChange={setH} />
        <Item label="A：75歳以上（Age）" pts={1} value={a} onChange={setA} />
        <Item label="D：糖尿病（Diabetes mellitus）" pts={1} value={d} onChange={setD} />
        <Item label="S2：脳梗塞・一過性脳虚血発作（TIA）の既往（Stroke）" pts={2} value={s} onChange={setS} />
      </Section>
    </Page>
  )
}

/* ───────── CHA2DS2-VASc ───────── */

const VASC_RATE = [0, 1.3, 2.2, 3.2, 4.0, 6.7, 9.8, 9.6, 6.7, 15.2]

export function Cha2ds2VascPage() {
  const [c, setC] = useState(false)
  const [h, setH] = useState(false)
  const [age, setAge] = useState(0)
  const [d, setD] = useState(false)
  const [s, setS] = useState(false)
  const [v, setV] = useState(false)
  const [f, setF] = useState(false)
  const total = +c + +h + age + +d + (s ? 2 : 0) + +v + +f
  // 性別の1点を除いた点で判断する
  const core = total - +f
  return (
    <Page title="CHA2DS2-VAScスコア">
      <Section>
        <ResultRow
          title="CHA2DS2-VASc"
          value={`${total}点`}
          note={`脳梗塞などの年間発症率の目安 ${VASC_RATE[total]}%（Lip 2010）。${core === 0 ? '低リスク（抗凝固療法は勧められない）。' : core === 1 ? '抗凝固療法を考慮。' : '抗凝固療法が勧められる。'}`}
          color="orange"
        />
      </Section>
      <Section header="年齢">
        <div class="row">
          <div class="segmented" role="radiogroup" aria-label="年齢">
            {(
              [
                [0, '65歳未満'],
                [1, '65〜74歳（1点）'],
                [2, '75歳以上（2点）'],
              ] as [number, string][]
            ).map(([n, l]) => (
              <button role="radio" aria-checked={age === n} class={age === n ? 'on' : ''} onClick={() => setAge(n)}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </Section>
      <Section
        header="心房細動の患者の脳梗塞のリスク"
        footer="合計0〜9点。欧州のガイドライン（ESC）で使われてきたスコア。性別（女性）の1点は、ほかの危険因子が無ければリスクを上げないので、判断は女性の1点を除いた点（男性0点・女性1点＝低リスク、男性1点・女性2点＝考慮、それ以上＝推奨）。日本のガイドラインは CHADS2 を使います。"
      >
        <Item label="C：心不全・左室機能不全" pts={1} value={c} onChange={setC} />
        <Item label="H：高血圧" pts={1} value={h} onChange={setH} />
        <Item label="D：糖尿病" pts={1} value={d} onChange={setD} />
        <Item label="S2：脳梗塞・TIA・血栓塞栓症の既往" pts={2} value={s} onChange={setS} />
        <Item label="V：血管疾患（心筋梗塞の既往・末梢動脈疾患・大動脈プラーク）" pts={1} value={v} onChange={setV} />
        <Item label="Sc：女性（Sex category）" pts={1} value={f} onChange={setF} />
      </Section>
    </Page>
  )
}

/* ───────── HAS-BLED ───────── */

const HASBLED_RATE = [1.13, 1.02, 1.88, 3.74, 8.7, 12.5]

export function HasBledPage() {
  const k = ['h', 'ar', 'al', 's', 'b', 'l', 'e', 'dd', 'da'] as const
  const [v, setV] = useState<Record<string, boolean>>({})
  const set = (key: string) => (x: boolean) => setV((o) => ({ ...o, [key]: x }))
  const total = k.reduce((n, key) => n + +!!v[key], 0)
  return (
    <Page title="HAS-BLEDスコア">
      <Section>
        <ResultRow
          title="HAS-BLED"
          value={`${total}点`}
          note={`重大な出血の年間発症率の目安 ${HASBLED_RATE[Math.min(total, 5)]}%${total >= 5 ? '以上' : ''}（Pisters 2010）。${total >= 3 ? '出血の高リスク（3点以上）。抗凝固療法をやめる理由ではなく、直せる危険因子を見直し、注意して経過をみる。' : '出血のリスクは低〜中等度。'}`}
          color={total >= 3 ? 'red' : 'orange'}
        />
      </Section>
      <Section header="抗凝固療法中の出血のリスク" footer="合計0〜9点。3点以上で出血の高リスク。高血圧のコントロール、併用薬、飲酒など、直せる因子を見直します。">
        <Item label="H：高血圧（収縮期血圧 160mmHg 超）" pts={1} value={!!v.h} onChange={set('h')} />
        <Item label="A：腎機能障害（透析・腎移植・Cr 2.26mg/dL 以上）" pts={1} value={!!v.ar} onChange={set('ar')} />
        <Item label="A：肝機能障害（肝硬変、またはビリルビンが基準の2倍超かつAST・ALTが3倍超）" pts={1} value={!!v.al} onChange={set('al')} />
        <Item label="S：脳卒中の既往（Stroke）" pts={1} value={!!v.s} onChange={set('s')} />
        <Item label="B：出血の既往・出血しやすい素因（貧血など）" pts={1} value={!!v.b} onChange={set('b')} />
        <Item label="L：INRが不安定（ワルファリンで治療域にある時間が60%未満）" pts={1} value={!!v.l} onChange={set('l')} />
        <Item label="E：高齢（65歳超）" pts={1} value={!!v.e} onChange={set('e')} />
        <Item label="D：抗血小板薬・NSAIDs の併用" pts={1} value={!!v.dd} onChange={set('dd')} />
        <Item label="D：アルコール多飲（週8杯以上）" pts={1} value={!!v.da} onChange={set('da')} />
      </Section>
    </Page>
  )
}

/* ───────── 日本版抗コリン薬リスクスケール ───────── */

interface AcItem {
  /** 薬効群・中分類・薬物・スコア、o：1＝一般用医薬品だけ、2＝一般用医薬品と医療用医薬品 */
  g: string
  c: string
  n: string
  s: number
  o?: number
}
let acPr: Promise<{ source: string; items: AcItem[] }> | null = null
const loadAc = () => (acPr ??= import('../../../data/anticholinergic.json').then((m) => (m.default ?? m) as unknown as { source: string; items: AcItem[] }))

export function AnticholinergicPage() {
  const [d, setD] = useState<{ source: string; items: AcItem[] } | null>(null)
  const [q, setQ] = useState('')
  /** 選んだ薬（同じ薬は1回だけ数える） */
  const [picked, setPicked] = useState<string[]>([])
  const [score, setScore] = useState(0)
  useEffect(() => {
    loadAc().then(setD)
  }, [])
  const items = d?.items ?? []
  const byName = new Map(items.map((x) => [x.n, x]))
  const total = picked.reduce((n, k) => n + (byName.get(k)?.s ?? 0), 0)
  const list = items.filter((x) => (!score || x.s === score) && (!q.trim() || matchesSearch(`${x.n} ${x.g} ${x.c}`, q)))
  const toggle = (n: string) => setPicked((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n]))
  return (
    <Page title="抗コリン薬リスク">
      <Section
        header="服用中の薬の合計（総抗コリン薬負荷）"
        footer="下の一覧で＋を押した薬のスコアを合計します。合計が高いほど、認知機能の低下・転倒・便秘・尿閉などのリスクが高くなります（合計の区切りの点数はこのスケールでは決められていません）。スコアの高い薬は低い薬への切り替えを検討します。急にやめると悪くなる薬もあるので、減らすときは少しずつ。"
      >
        <ResultRow title="合計" value={`${total}点`} note={picked.length ? `${picked.length}剤` : '薬を選んでください'} color={total >= 3 ? 'red' : 'orange'} />
        {picked.map((n) => (
          <div class="row ac-picked">
            <span class={'ac-score s' + byName.get(n)?.s}>{byName.get(n)?.s}</span>
            <span class="ac-name">{n}</span>
            <button class="bar-btn" aria-label={`${n}を外す`} onClick={() => toggle(n)}>
              <X size={18} />
            </button>
          </div>
        ))}
        {picked.length > 0 && <ButtonRow onClick={() => setPicked([])}>すべて外す</ButtonRow>}
      </Section>
      <label class="search">
        <Search size={18} />
        <input type="search" placeholder="成分名・薬効で探す（例：ジフェンヒドラミン、過活動膀胱）" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      </label>
      <Section>
        <div class="row">
          <div class="segmented" role="radiogroup" aria-label="スコア">
            {(
              [
                [0, 'すべて'],
                [3, '3点'],
                [2, '2点'],
                [1, '1点'],
              ] as [number, string][]
            ).map(([n, l]) => (
              <button role="radio" aria-checked={score === n} class={score === n ? 'on' : ''} onClick={() => setScore(n)}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </Section>
      <Section
        header={d ? `${list.length}薬物` : '読み込んでいます…'}
        footer={d ? `${d.source}。スコア3＝抗コリン作用によるリスクが強い、1＝弱い。成分名で載っています（製品名では探せません）。` : undefined}
      >
        {list.map((x) => {
          const on = picked.includes(x.n)
          return (
            <button class={'row ac-row' + (on ? ' on' : '')} onClick={() => toggle(x.n)} aria-pressed={on}>
              <span class={'ac-score s' + x.s}>{x.s}</span>
              <span class="otc-main">
                <b>{x.n}</b>
                <span class="small sub">
                  {x.g}・{x.c}
                  {x.o === 1 ? '（一般用医薬品だけ）' : x.o === 2 ? '（一般用医薬品にもあり）' : ''}
                </span>
              </span>
              {on ? <Minus size={20} class="sub" /> : <Plus size={20} class="sub" />}
            </button>
          )
        })}
      </Section>
    </Page>
  )
}

/* ───────── Naranjo ───────── */

/** 質問と点数（はい・いいえ・分からない） */
const NARANJO: [string, number, number, number][] = [
  ['この副作用について、以前に結論的な報告があるか', 1, 0, 0],
  ['副作用は、疑わしい薬を使ったあとに起きたか', 2, -1, 0],
  ['薬をやめた、または特異的な拮抗薬を使ったら、副作用は良くなったか', 1, 0, 0],
  ['薬をもう一度使ったら、副作用がまた起きたか', 2, -1, 0],
  ['副作用を起こしうる、薬以外の原因があるか', -1, 2, 0],
  ['プラセボ（偽薬）で副作用がまた起きたか', -1, 1, 0],
  ['血中（体液中）の薬の濃度が中毒域だったか', 1, 0, 0],
  ['量を増やしたら副作用が悪くなり、減らしたら良くなったか', 1, 0, 0],
  ['以前に同じ薬や似た薬で、同じような副作用があったか', 1, 0, 0],
  ['副作用は客観的な証拠で確かめられたか', 1, 0, 0],
]

export function NaranjoPage() {
  const [ans, setAns] = useState<(number | null)[]>(NARANJO.map(() => null))
  const total = ans.reduce<number>((n, a, i) => n + (a == null ? 0 : (NARANJO[i][1 + a] as number)), 0)
  const done = ans.filter((a) => a != null).length
  const verdict = total >= 9 ? '確実（definite）' : total >= 5 ? '可能性が高い（probable）' : total >= 1 ? '可能性がある（possible）' : '疑わしい（doubtful）'
  return (
    <Page title="Naranjo評価スケール">
      <Section>
        <ResultRow title="合計" value={`${total}点`} note={`薬と副作用の因果関係：${verdict}${done < NARANJO.length ? `（${done}/${NARANJO.length}問に回答）` : ''}`} color="orange" />
      </Section>
      {NARANJO.map(([q, y, n, u], i) => (
        <Section header={`${i + 1}. ${q}`}>
          <div class="row">
            <div class="segmented" role="radiogroup" aria-label={q}>
              {(
                [
                  [0, `はい（${y > 0 ? '+' : ''}${y}）`],
                  [1, `いいえ（${n > 0 ? '+' : ''}${n}）`],
                  [2, `分からない（${u}）`],
                ] as [number, string][]
              ).map(([k, l]) => (
                <button role="radio" aria-checked={ans[i] === k} class={ans[i] === k ? 'on' : ''} onClick={() => setAns((a) => a.map((x, j) => (j === i ? k : x)))}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </Section>
      ))}
      <Section footer="9点以上：確実、5〜8点：可能性が高い、1〜4点：可能性がある、0点以下：疑わしい（Naranjo 1981）。">
        <ButtonRow onClick={() => setAns(NARANJO.map(() => null))}>答えを消す</ButtonRow>
      </Section>
    </Page>
  )
}

/* ───────── FAST ───────── */

/** 読むだけの1行（見出しと説明） */
const FAST: [string, string, string][] = [
  ['F', 'Face：顔のゆがみ', '「イー」と笑うと、片側の口元が下がる'],
  ['A', 'Arm：腕のまひ', '両腕を前に上げて目を閉じると、片方が下がる'],
  ['S', 'Speech：言葉の障害', 'ろれつが回らない、言葉が出ない、話が分からない'],
  ['T', 'Time：発症時刻', '1つでもあれば脳卒中の疑い。すぐに救急車を呼び、症状が出た時刻（最後に元気だった時刻）を伝える'],
]

export function FastPage() {
  return (
    <Page title="FAST">
      <Section
        header="脳卒中のサイン"
        footer="脳梗塞は発症から早いほど治療（血栓を溶かす薬・カテーテル治療）の効果が高く、使える時間に限りがあります。症状が消えても一過性脳虚血発作（TIA）のことがあるので受診を。"
      >
        {FAST.map(([k, t, d]) => (
          <div class="row scale-read">
            <b>
              <span class="fast-key">{k}</span>
              {t.slice(1)}
            </b>
            <span>{d}</span>
          </div>
        ))}
      </Section>
      <Section header="参考：BE-FAST" footer="FAST に B（Balance：急なめまい・ふらつき、まっすぐ歩けない）と E（Eyes：急に片目が見えない、物が二重に見える、視野が欠ける）を足して、見逃しを減らす方法もあります。">
        <></>
      </Section>
    </Page>
  )
}
