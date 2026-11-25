// 添付文書・インタビューフォームを元の PDF の見た目のまま表示し、文字で探す画面。
// PDF は Concrete の /pharmacalc/pmda-pdf/{添付文書番号}・/pharmacalc/pmda-if/{パス} が PMDA から代わりに取ってくる。
// pdf.js でページを描き（見えているページだけ。離れたら消してメモリを空ける）、ページの文字の位置から見つかった所に印を重ねる
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { ChevronDown, ChevronUp, ExternalLink, Minus, Plus, Search, X } from 'lucide-preact'
import { Page, Section, openExternal } from '../ui/components'
import { queryRegex } from './docview'

type PdfDoc = import('pdfjs-dist/types/src/display/api').PDFDocumentProxy

/** ページの文字（つなげた物）と、各文字がどの文字の部品（item）の何文字目か */
interface PageText {
  w: number
  h: number
  text: string
  /** item ごと：開始位置・文字数・枠（ページの幅・高さに対する割合） */
  items: { at: number; n: number; x: number; y: number; w: number; h: number }[]
}
interface Hit {
  page: number
  rects: { x: number; y: number; w: number; h: number }[]
}

let pdfjsP: Promise<typeof import('pdfjs-dist')> | null = null
async function pdfjs() {
  pdfjsP ??= (async () => {
    const lib = (await import('pdfjs-dist/legacy/build/pdf')) as unknown as typeof import('pdfjs-dist')
    lib.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/legacy/build/pdf.worker.min.js?url')).default
    return lib
  })()
  return pdfjsP
}

async function pageTexts(lib: typeof import('pdfjs-dist'), doc: PdfDoc, onProgress: (v: number) => void): Promise<PageText[]> {
  const out: PageText[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const vp = page.getViewport({ scale: 1 })
    const tc = await page.getTextContent()
    let text = ''
    const items: PageText['items'] = []
    for (const it of tc.items as { str?: string; transform: number[]; width: number; height: number; hasEOL?: boolean }[]) {
      if (!it.str) {
        if (it.hasEOL) text += '\n'
        continue
      }
      const t = lib.Util.transform(vp.transform, it.transform)
      const fh = Math.hypot(t[2], t[3]) || it.height
      // 横書き：左下が (t[4], t[5])。縦書き（幅が0に近い）は高さの向きに伸ばす
      const vertical = it.width < 0.5 && it.str.length > 1
      const w = vertical ? fh : it.width
      const h = vertical ? fh * it.str.length : fh
      items.push({ at: text.length, n: it.str.length, x: t[4] / vp.width, y: (t[5] - (vertical ? 0 : fh)) / vp.height, w: w / vp.width, h: h / vp.height })
      text += it.str
      if (it.hasEOL) text += '\n'
    }
    out.push({ w: vp.width, h: vp.height, text, items })
    onProgress(p / doc.numPages)
  }
  return out
}

/** 見つかった所（ページの文字の位置 → ページの上の枠） */
function findHits(pages: PageText[], re: RegExp): Hit[] {
  const hits: Hit[] = []
  pages.forEach((pg, i) => {
    re.lastIndex = 0
    for (let m = re.exec(pg.text); m; m = re.exec(pg.text)) {
      if (!m[0]) {
        re.lastIndex++
        continue
      }
      const s = m.index, e = m.index + m[0].length
      const rects: Hit['rects'] = []
      for (const it of pg.items) {
        const a = Math.max(s, it.at), b = Math.min(e, it.at + it.n)
        if (a >= b) continue
        // 部品の中の位置は文字数で割り振る（等幅とみなす）
        rects.push({ x: it.x + (it.w * (a - it.at)) / it.n, y: it.y, w: (it.w * (b - a)) / it.n, h: it.h })
      }
      if (rects.length) hits.push({ page: i, rects })
    }
  })
  return hits
}

/** 1ページ：見えている間だけ描く */
function PdfPage({ doc, n, size, zoom, hits, cur }: { doc: PdfDoc; n: number; size: { w: number; h: number }; zoom: number; hits: { h: Hit; i: number }[]; cur: number }) {
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [show, setShow] = useState(false)
  useEffect(() => {
    const io = new IntersectionObserver((es) => setShow(es[0].isIntersecting), { rootMargin: '600px 0px' })
    io.observe(box.current!)
    return () => io.disconnect()
  }, [])
  useEffect(() => {
    const c = canvas.current
    if (!c) return
    if (!show) {
      c.width = 0
      c.height = 0
      return
    }
    let task: { cancel: () => void; promise: Promise<void> } | null = null
    let dead = false
    doc.getPage(n + 1).then((page) => {
      if (dead) return
      const cssW = box.current!.clientWidth
      const scale = (cssW / size.w) * Math.min(window.devicePixelRatio || 1, 2)
      const vp = page.getViewport({ scale })
      c.width = Math.floor(vp.width)
      c.height = Math.floor(vp.height)
      task = page.render({ canvasContext: c.getContext('2d')!, viewport: vp })
      task.promise.catch(() => {})
    })
    return () => {
      dead = true
      task?.cancel()
    }
  }, [show, zoom])
  return (
    <div class="pdf-page" ref={box} style={{ aspectRatio: `${size.w} / ${size.h}` }}>
      <canvas ref={canvas} />
      {hits.map(({ h, i }) =>
        h.rects.map((r) => (
          <div
            class={'pdf-hit' + (i === cur ? ' cur' : '')}
            data-hit={i}
            style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
          />
        )),
      )}
      <div class="pdf-pno">{n + 1}</div>
    </div>
  )
}

export function PdfSearchPage({ title, name, url, original, q0 = '', note }: { title: string; name: string; url: string; original: string; q0?: string; note?: string }) {
  const [doc, setDoc] = useState<PdfDoc | null>(null)
  const [pages, setPages] = useState<PageText[] | null>(null)
  const [err, setErr] = useState(false)
  const [prog, setProg] = useState(0)
  const [q, setQ] = useState(q0)
  const [dq, setDq] = useState(q0)
  const [cur, setCur] = useState(0)
  const [zoom, setZoom] = useState(1)
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let dead = false
    ;(async () => {
      const lib = await pdfjs()
      const d = await lib.getDocument({ url, cMapUrl: './cmaps/', cMapPacked: true, isEvalSupported: false }).promise
      if (dead) return
      setDoc(d)
      const t = await pageTexts(lib, d, setProg)
      if (!dead) setPages(t)
    })().catch(() => !dead && setErr(true))
    return () => {
      dead = true
    }
  }, [url])
  useEffect(() => {
    const t = setTimeout(() => setDq(q), 300)
    return () => clearTimeout(t)
  }, [q])
  const re = useMemo(() => queryRegex(dq), [dq])
  const hits = useMemo(() => (re && pages ? findHits(pages, re) : []), [re, pages])
  useEffect(() => setCur(0), [dq])
  // いまの1件まで動かす（ページの形は文字を読んだ時点で決まっているので、描く前でも位置が分かる）
  useEffect(() => {
    if (!hits.length) return
    const el = list.current?.querySelector(`[data-hit="${cur}"]`)
    el?.scrollIntoView({ block: 'center', inline: 'center' })
  }, [cur, hits, zoom])
  const byPage = useMemo(() => {
    const m = new Map<number, { h: Hit; i: number }[]>()
    hits.forEach((h, i) => m.set(h.page, [...(m.get(h.page) ?? []), { h, i }]))
    return m
  }, [hits])

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
        <div class="doc-nav">
          <span class="small">
            {!pages ? (doc ? `文字を読んでいます…${Math.round(prog * 100)}%` : '') : re ? (hits.length ? `${cur + 1}/${hits.length}件・${hits[cur].page + 1}p` : '見つかりません') : `${pages.length}ページ`}
          </span>
          <button class="bar-btn" aria-label="小さく" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z - 0.5))}>
            <Minus size={18} />
          </button>
          <button class="bar-btn" aria-label="大きく" disabled={zoom >= 3} onClick={() => setZoom((z) => Math.min(3, z + 0.5))}>
            <Plus size={18} />
          </button>
          <button class="bar-btn" aria-label="前へ" disabled={!hits.length} onClick={() => setCur((c) => (c - 1 + hits.length) % hits.length)}>
            <ChevronUp size={20} />
          </button>
          <button class="bar-btn" aria-label="次へ" disabled={!hits.length} onClick={() => setCur((c) => (c + 1) % hits.length)}>
            <ChevronDown size={20} />
          </button>
        </div>
      </div>
      {!doc && !err && (
        <Section>
          <div class="row sub">読み込んでいます…</div>
        </Section>
      )}
      {err && (
        <Section footer="電波が無いか、PMDA から取れませんでした。元の文書（PMDA）を開いてください。">
          <div class="row sub">読み込めませんでした。</div>
        </Section>
      )}
      {doc && pages && (
        <div class="pdf-scroll">
          <div class="pdf-list" ref={list} style={{ width: `${zoom * 100}%` }}>
            {pages.map((p, n) => (
              <PdfPage doc={doc} n={n} size={p} zoom={zoom} hits={byPage.get(n) ?? []} cur={cur} />
            ))}
          </div>
        </div>
      )}
      <Section footer={`${name}。${note ?? ''}見つかった所の印は、文字の位置からの目安です（表の中などで少しずれることがあります）。`}>
        <button class="row link-row" onClick={() => openExternal(original)}>
          <ExternalLink size={18} /> 元の文書（PMDA）を開く
        </button>
      </Section>
    </Page>
  )
}
