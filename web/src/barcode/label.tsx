// スキャンの結果の「添付文書の項目」：効能・効果、用法・用量（それぞれの関連する注意）、警告、禁忌、併用禁忌
// データは label/{YJ先頭4桁}.json（tools/make_label.py が PMDA の電子添文 XML から作る。サービスワーカーは開いたときに保存する）
import { useEffect, useState } from 'preact/hooks'
import { ChevronRight } from 'lucide-preact'
import { Page, Section } from '../ui/components'
import { useNav } from '../ui/nav'

export interface LabelDoc {
  /** 警告・禁忌・効能又は効果・効能関連注意・用法及び用量・用法用量関連注意・併用禁忌（文言どおり。改行と字下げつき） */
  w?: string
  c?: string
  i?: string
  ip?: string
  d?: string
  dp?: string
  x?: string
  /** 9.2 腎機能障害患者・9.3 肝機能障害患者、ほかの項目（警告・禁忌・用法用量など）の腎機能・肝機能に触れた行 */
  r?: string
  h?: string
  rx?: string
  hx?: string
}
interface LabelFile {
  yj: Record<string, string>
  docs: Record<string, LabelDoc>
}

const files = new Map<string, Promise<LabelFile | null>>()
function loadFile(k: string): Promise<LabelFile | null> {
  let p = files.get(k)
  if (!p) {
    p = fetch(`./label/${k}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<LabelFile>) : null))
      .catch(() => null)
    files.set(k, p)
  }
  return p
}

/** YJ コードの添付文書の項目。その製品に無ければ、同じ成分・剤形・規格（先頭9桁）、同じ成分（先頭7桁）の製品の物（other=true） */
export async function labelFor(yjs: string[]): Promise<{ doc: LabelDoc; other: boolean } | null> {
  for (const yj of yjs) {
    const f = await loadFile(yj.slice(0, 4))
    if (!f) continue
    if (f.yj[yj]) return { doc: f.docs[f.yj[yj]], other: false }
  }
  for (const n of [9, 7]) {
    for (const yj of yjs) {
      const f = await loadFile(yj.slice(0, 4))
      const k = f && Object.keys(f.yj).find((y) => y.startsWith(yj.slice(0, n)))
      if (f && k) return { doc: f.docs[f.yj[k]], other: true }
    }
  }
  return null
}

/** 項目の本文の画面 */
function LabelTextPage({ title, name, parts, other }: { title: string; name: string; parts: [string, string | undefined][]; other: boolean }) {
  return (
    <Page title={title}>
      {parts
        .filter(([, t]) => t)
        .map(([h, t], k) => (
          <Section header={k === 0 ? `${name}：${h}` : h}>
            <div class="row label-text">{t}</div>
          </Section>
        ))}
      <Section
        footer={`PMDA の電子添文の文言のとおり（アプリに入れた時点の物）。${other ? 'この製品の添付文書が無いため、同じ成分の別の製品の添付文書の内容です。' : ''}最新の内容は「添付文書を開く」で確かめてください。`}
      >
        <></>
      </Section>
    </Page>
  )
}

/** 添付文書を開くボタンの前に出す一覧 */
export function LabelRows({ yj, name }: { yj: string[]; name: string }) {
  const nav = useNav()
  const [r, setR] = useState<{ doc: LabelDoc; other: boolean } | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    setR(undefined)
    labelFor(yj).then((x) => alive && setR(x))
    return () => {
      alive = false
    }
  }, [yj.join()])
  if (r === undefined) return <div class="label-rows small sub">添付文書の項目を読み込んでいます…</div>
  if (r === null) return null
  const d = r.doc
  const open = (title: string, parts: [string, string | undefined][]) => nav.push(<LabelTextPage title={title} name={name} parts={parts} other={r.other} />)
  const rows: { t: string; v: string; on: boolean; go?: () => void }[] = [
    {
      t: '効能・効果',
      v: d.ip ? '関連する注意あり' : '関連する注意なし',
      on: !!d.ip,
      go: d.i
        ? () =>
            open('効能・効果', [
              ['効能又は効果', d.i],
              ['効能又は効果に関連する注意', d.ip],
            ])
        : undefined,
    },
    {
      t: '用法・用量',
      v: d.dp ? '関連する注意あり' : '関連する注意なし',
      on: !!d.dp,
      go: d.d
        ? () =>
            open('用法・用量', [
              ['用法及び用量', d.d],
              ['用法及び用量に関連する注意', d.dp],
            ])
        : undefined,
    },
    { t: '警告', v: d.w ? 'あり' : 'なし', on: !!d.w, go: d.w ? () => open('警告', [['警告', d.w]]) : undefined },
    { t: '禁忌', v: d.c ? 'あり' : 'なし', on: !!d.c, go: d.c ? () => open('禁忌', [['禁忌（次の患者には投与しないこと）', d.c]]) : undefined },
    { t: '併用禁忌', v: d.x ? 'あり' : 'なし', on: !!d.x, go: d.x ? () => open('併用禁忌', [['併用禁忌（併用しないこと）', d.x]]) : undefined },
    {
      t: '腎機能の規定',
      v: d.r || d.rx ? 'あり' : 'なし',
      on: !!(d.r || d.rx),
      go:
        d.r || d.rx
          ? () =>
              open('腎機能の規定', [
                ['ほかの項目の腎機能の記載（警告・禁忌・用法用量など）', d.rx],
                ['9.2 腎機能障害患者', d.r],
              ])
          : undefined,
    },
    {
      t: '肝機能の規定',
      v: d.h || d.hx ? 'あり' : 'なし',
      on: !!(d.h || d.hx),
      go:
        d.h || d.hx
          ? () =>
              open('肝機能の規定', [
                ['ほかの項目の肝機能の記載（警告・禁忌・用法用量など）', d.hx],
                ['9.3 肝機能障害患者', d.h],
              ])
          : undefined,
    },
  ]
  return (
    <div class="label-rows">
      <div class="small sub label-head">添付文書の項目{r.other ? '（同じ成分の別の製品の添付文書）' : ''}</div>
      {rows.map((x) => (
        <button class={'label-row' + (x.on ? ' on' : '')} onClick={x.go} disabled={!x.go}>
          <span class="label-t">{x.t}</span>
          <span class={'label-v' + (x.on ? ' on' : '')}>{x.v}</span>
          {x.go && <ChevronRight size={18} class="sub" />}
        </button>
      ))}
    </div>
  )
}
