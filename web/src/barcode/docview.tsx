// 添付文書（電子添文）・インタビューフォームの全文をアプリの中で表示し、文字で探す画面。
// 添付文書：Concrete の /pharmacalc/pmda-doc/{添付文書番号} が PMDA の XML を代わりに取ってくる（XML の中の「<!--4.効能又は効果-->」などの注記を見出しにする）
// インタビューフォーム：/pharmacalc/pmda-if/{PDF のパス} が PDF を代わりに取ってくる。pdf.js でページごとの文字を取り出す
import type { JSX } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { ChevronDown, ChevronUp, ExternalLink, Search, X } from 'lucide-preact'
import { Page, Section, openExternal } from '../ui/components'

export interface DocSection {
  h: string
  t: string
}

/** 添付文書の XML → 見出しと本文 */
export async function loadLabelText(docId: string): Promise<DocSection[]> {
  const res = await fetch(`./pmda-doc/${docId}`)
  if (!res.ok) throw new Error(String(res.status))
  const xml = new DOMParser().parseFromString(await res.text(), 'application/xml')
  if (xml.getElementsByTagName('parsererror').length) throw new Error('xml')
  const secs: DocSection[] = [{ h: '製品', t: '' }]
  const lines: string[][] = [[]]
  const text = (n: Node): string => {
    let s = ''
    n.childNodes.forEach((c) => {
      if (c.nodeType === Node.TEXT_NODE) s += c.nodeValue ?? ''
      else if (c.nodeType === Node.PROCESSING_INSTRUCTION_NODE) s += (c as ProcessingInstruction).target === 'enter' ? '\n' : ''
      else if (c.nodeType === Node.ELEMENT_NODE) s += text(c)
    })
    return s
  }
  const walk = (n: Node) => {
    n.childNodes.forEach((c) => {
      if (c.nodeType === Node.COMMENT_NODE) {
        // 「4.効能又は効果」「10.2 併用注意」などの見出しの注記
        const h = (c.nodeValue ?? '').trim()
        if (/^([0-9０-９]+(\.[0-9０-９]+)*[.．\s]|[ア-ン][.．])/.test(h) && h.length < 40) {
          secs.push({ h: h.replace(/^([0-9０-９]+(?:\.[0-9０-９]+)*)[.．]?\s*/, '$1 '), t: '' })
          lines.push([])
        }
        return
      }
      if (c.nodeType !== Node.ELEMENT_NODE) return
      const el = c as Element
      if (el.localName === 'Lang') {
        if ((el.getAttribute('xml:lang') ?? el.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'lang')) === 'en') return
        const t = text(el).replace(/[ \t]+/g, ' ').trim()
        if (t) lines[lines.length - 1].push(t)
        return
      }
      walk(el)
    })
  }
  walk(xml.documentElement)
  return secs.map((s, i) => ({ h: s.h, t: lines[i].join('\n') })).filter((s) => s.t)
}

/** インタビューフォームの PDF → ページごとの文字 */
export async function loadIfText(ifUrl: string, onProgress?: (p: number) => void): Promise<DocSection[]> {
  const path = ifUrl.replace('https://www.info.pmda.go.jp/go/interview/', '')
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf')
  const worker = (await import('pdfjs-dist/legacy/build/pdf.worker.min.js?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const doc = await pdfjs.getDocument({ url: `./pmda-if/${path}`, cMapUrl: './cmaps/', cMapPacked: true, isEvalSupported: false }).promise
  const out: DocSection[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const tc = await page.getTextContent()
    let s = ''
    for (const it of tc.items as { str?: string; hasEOL?: boolean }[]) {
      if (it.str === undefined) continue
      s += it.str
      if (it.hasEOL) s += '\n'
    }
    // PDF の字間で入った日本語の間の空白を取る
    // 目次の点線などの読めない字（�）はまとめて「…」に
    s = s.replace(/(?<=[^\x00-\x7F]) (?=[^\x00-\x7F])/g, '').replace(/[\uFFFD\s]*\uFFFD[\uFFFD\s]*/g, ' … ').replace(/[.・…·]{6,}/g, ' … ').replace(/\n{3,}/g, '\n\n').trim()
    if (s) out.push({ h: `${p}ページ`, t: s })
    onProgress?.(p / doc.numPages)
  }
  return out
}

const HIRA = /[ぁ-ゖ]/g
/** 探す文字を正規表現に。全角・半角、大文字・小文字、ひらがな・カタカナを区別しない */
function queryRegex(q: string): RegExp | null {
  q = q.normalize('NFKC').trim()
  if (!q) return null
  let src = ''
  for (const ch of q) {
    if (/\s/.test(ch)) {
      src += '\\s*'
      continue
    }
    const kata = ch.replace(HIRA, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
    const hira = kata.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    const alts = new Set([ch, kata, hira])
    if (/[0-9A-Za-z]/.test(ch)) {
      for (const c of [ch.toUpperCase(), ch.toLowerCase()]) {
        alts.add(c)
        alts.add(String.fromCharCode(c.charCodeAt(0) + 0xfee0)) // 全角
      }
    }
    src += '(?:' + [...alts].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')'
  }
  return new RegExp(src, 'g')
}

/** 文字で探せる全文の画面 */
export function DocSearchPage({ title, name, load, original, note, q0 = '' }: { title: string; name: string; load: (p: (v: number) => void) => Promise<DocSection[]>; original: string; note?: string; q0?: string }) {
  const [secs, setSecs] = useState<DocSection[] | null>(null)
  const [err, setErr] = useState(false)
  const [prog, setProg] = useState(0)
  const [q, setQ] = useState(q0)
  const [dq, setDq] = useState(q0)
  const [onlyHits, setOnlyHits] = useState(false)
  const [cur, setCur] = useState(0)
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => {
    load(setProg)
      .then(setSecs)
      .catch(() => setErr(true))
  }, [])
  useEffect(() => {
    const t = setTimeout(() => setDq(q), 250)
    return () => clearTimeout(t)
  }, [q])
  const re = useMemo(() => queryRegex(dq), [dq])
  // 見つかった数
  const total = useMemo(() => {
    if (!re || !secs) return 0
    let n = 0
    for (const s of secs) n += (s.t.match(re) ?? []).length
    return n
  }, [re, secs])
  useEffect(() => setCur(0), [dq])
  // いまの1件まで動かす
  useEffect(() => {
    if (!total) return
    const marks = body.current?.querySelectorAll('mark')
    marks?.forEach((m, i) => m.classList.toggle('cur', i === cur))
    marks?.[cur]?.scrollIntoView({ block: 'center' })
  }, [cur, total, onlyHits])

  const hl = (t: string) => {
    if (!re) return t
    const parts: (string | JSX.Element)[] = []
    let last = 0
    re.lastIndex = 0
    for (let m = re.exec(t); m; m = re.exec(t)) {
      if (!m[0]) {
        re.lastIndex++
        continue
      }
      parts.push(t.slice(last, m.index), <mark>{m[0]}</mark>)
      last = m.index + m[0].length
    }
    parts.push(t.slice(last))
    return parts
  }
  const shown = (s: DocSection) => {
    if (!onlyHits || !re) return s.t
    // 見つかった行だけ（前後を少し）
    return s.t
      .split('\n')
      .filter((l) => {
        re.lastIndex = 0
        return re.test(l)
      })
      .join('\n')
  }

  return (
    <Page title={title}>
      <div class="doc-search">
        <label class="search">
          <Search size={18} />
          <input type="text" enterKeyHint="search" placeholder="この文書の中を探す" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
          {q && (
            <button class="doc-clear" aria-label="消す" onClick={() => setQ('')}>
              <X size={16} />
            </button>
          )}
        </label>
        {re && secs && (
          <div class="doc-nav">
            <span class="small">{total ? `${cur + 1} / ${total}件` : '見つかりません'}</span>
            <button class={'chip ' + (onlyHits ? 'on' : '')} onClick={() => setOnlyHits(!onlyHits)}>
              見つかった行だけ
            </button>
            <button class="bar-btn" aria-label="前へ" disabled={!total} onClick={() => setCur((c) => (c - 1 + total) % total)}>
              <ChevronUp size={20} />
            </button>
            <button class="bar-btn" aria-label="次へ" disabled={!total} onClick={() => setCur((c) => (c + 1) % total)}>
              <ChevronDown size={20} />
            </button>
          </div>
        )}
      </div>
      {!secs && !err && (
        <Section>
          <div class="row sub">読み込んでいます…{prog > 0 && prog < 1 ? `（${Math.round(prog * 100)}%）` : ''}</div>
        </Section>
      )}
      {err && (
        <Section footer="電波が無いか、PMDA から取れませんでした。元の文書（PMDA）を開いてください。">
          <div class="row sub">読み込めませんでした。</div>
        </Section>
      )}
      <div ref={body}>
        {secs?.map((s) => {
          const t = shown(s)
          if (onlyHits && re && !t) return null
          return (
            <Section header={s.h}>
              <div class="row label-text doc-text">{hl(t)}</div>
            </Section>
          )
        })}
      </div>
      <Section footer={`${name}。${note ?? ''}表や図は文字だけで、くずれて見えることがあります。正しい形は元の文書で確かめてください。`}>
        <button class="row link-row" onClick={() => openExternal(original)}>
          <ExternalLink size={18} /> 元の文書（PMDA）を開く
        </button>
      </Section>
    </Page>
  )
}
