// 添付文書・インタビューフォームを元の PDF の見た目のまま表示し、文字で探す画面。
// PDF は Concrete の /pharmacalc/pmda-pdf/{添付文書番号}・/pharmacalc/pmda-if/{パス} が PMDA から代わりに取ってくる。
// pdf.js でページを描き（見えているページだけ。離れたら消してメモリを空ける）、ページの文字の位置から見つかった所に印を重ねる
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { ChevronDown, ChevronUp, ExternalLink, Search, X } from 'lucide-preact'
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

/** 描く画素の上限（iPhone の canvas は 1 枚 1600 万画素ほどまで。余裕を見て） */
const MAX_PX = 12_000_000

/** 1ページ：見えている間だけ描く。画素は画面の細かさ（最大3倍）×拡大率で、くっきり描く */
function PdfPage({ doc, n, size, zoom, hits, cur }: { doc: PdfDoc; n: number; size: { w: number; h: number }; zoom: number; hits: { h: Hit; i: number }[]; cur: number }) {
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [show, setShow] = useState(false)
  useEffect(() => {
    const io = new IntersectionObserver((es) => setShow(es[0].isIntersecting), { rootMargin: '800px 0px' })
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
      let scale = (cssW / size.w) * Math.min(window.devicePixelRatio || 1, 3)
      // 大きすぎるときは画素の上限まで
      const px = size.w * size.h * scale * scale
      if (px > MAX_PX) scale *= Math.sqrt(MAX_PX / px)
      const vp = page.getViewport({ scale })
      // 描き終わるまでは前の絵を残す（別の canvas に描いてから写す）
      const off = document.createElement('canvas')
      off.width = Math.floor(vp.width)
      off.height = Math.floor(vp.height)
      task = page.render({ canvasContext: off.getContext('2d')!, viewport: vp })
      task.promise
        .then(() => {
          if (dead) return
          c.width = off.width
          c.height = off.height
          c.getContext('2d')!.drawImage(off, 0, 0)
          off.width = 0
        })
        .catch(() => {})
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
    </div>
  )
}

/**
 * 2本指で広げる・縮めると拡大・縮小（1〜4倍）。動かしている間は CSS で拡大して見せ、指を離したら
 * その倍率で描き直し、指の真ん中の所が同じ場所に来るように動かす
 */
function usePinch(scroller: { current: HTMLDivElement | null }, list: { current: HTMLDivElement | null }, zoom: number, setZoom: (z: number) => void, ready: boolean) {
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    // 指の動きに合わせて、倍率は段階なしで（1〜4倍）。2本指をずらすと拡大したまま動かせる
    let g: { d0: number; z0: number; fx: number; fy: number; cx0: number; cy0: number; cx: number; cy: number; z: number } | null = null
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const mid = (t: TouchList) => [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2]
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !list.current) return
      e.preventDefault()
      const r = list.current.getBoundingClientRect()
      const [cx, cy] = mid(e.touches)
      g = { d0: dist(e.touches), z0: zoomRef.current, fx: cx - r.left, fy: cy - r.top, cx0: cx, cy0: cy, cx, cy, z: zoomRef.current }
      list.current.style.transformOrigin = `${g.fx}px ${g.fy}px`
    }
    const move = (e: TouchEvent) => {
      if (!g || e.touches.length !== 2 || !list.current) return
      e.preventDefault()
      const [cx, cy] = mid(e.touches)
      g.cx = cx
      g.cy = cy
      g.z = Math.min(4, Math.max(1, (g.z0 * dist(e.touches)) / g.d0))
      list.current.style.transform = `translate(${cx - g.cx0}px, ${cy - g.cy0}px) scale(${g.z / g.z0})`
    }
    const end = (e: TouchEvent) => {
      if (!g || e.touches.length >= 2 || !list.current) return
      const { z, z0, fx, fy, cx0, cy0, cx, cy } = g
      g = null
      const k = z / z0
      // 同じ瞬間に、拡大した大きさに置き替えて、指の真ん中の所が同じ位置に来るよう動かす（ちらつかない）
      list.current.style.width = `${z * 100}%`
      list.current.style.transform = ''
      el.scrollLeft += fx * k - fx - (cx - cx0)
      const body = el.closest('.page-body') as HTMLElement | null
      if (body) body.scrollTop += fy * k - fy - (cy - cy0)
      // くっきり描き直す
      if (Math.abs(z - z0) > 0.005) setZoom(z)
    }
    // iPhone の Safari の画面全体の拡大を止める（この画面を開いている間）
    const gesture = (e: Event) => e.preventDefault()
    document.addEventListener('gesturestart', gesture)
    document.addEventListener('gesturechange', gesture)
    el.addEventListener('touchstart', start, { passive: false })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    return () => {
      document.removeEventListener('gesturestart', gesture)
      document.removeEventListener('gesturechange', gesture)
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
    }
  }, [ready])
}

export function PdfSearchPage({ title, name, url, original, q0 = '', note }: { title: string; name: string; url: string; original: string; q0?: string; note?: string }) {
  const [doc, setDoc] = useState<PdfDoc | null>(null)
  /** ページの大きさ（すぐ分かる）と文字（あとから読む） */
  const [sizes, setSizes] = useState<{ w: number; h: number }[] | null>(null)
  const [pages, setPages] = useState<PageText[] | null>(null)
  const [err, setErr] = useState(false)
  const [dl, setDl] = useState(0)
  const [prog, setProg] = useState(0)
  const [q, setQ] = useState(q0)
  const [dq, setDq] = useState(q0)
  const [cur, setCur] = useState(0)
  const [zoom, setZoom] = useState(1)
  const list = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  usePinch(scroller, list, zoom, setZoom, !!sizes)
  useEffect(() => {
    let dead = false
    ;(async () => {
      const lib = await pdfjs()
      const task = lib.getDocument({ url, cMapUrl: './cmaps/', cMapPacked: true, isEvalSupported: false })
      task.onProgress = (p: { loaded: number; total: number }) => p.total && setDl(p.loaded / p.total)
      const d = await task.promise
      if (dead) return
      // ページの大きさを先に出して、すぐ見られるようにする（文字はあとで読む）
      const vs = await Promise.all(Array.from({ length: d.numPages }, (_, i) => d.getPage(i + 1).then((pg) => pg.getViewport({ scale: 1 }))))
      if (dead) return
      setDoc(d)
      setSizes(vs.map((v) => ({ w: v.width, h: v.height })))
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
  // いまの1件まで動かす
  useEffect(() => {
    if (!hits.length) return
    const el = list.current?.querySelector(`[data-hit="${cur}"]`)
    el?.scrollIntoView({ block: 'center', inline: 'center' })
  }, [cur, hits])
  const byPage = useMemo(() => {
    const m = new Map<number, { h: Hit; i: number }[]>()
    hits.forEach((h, i) => m.set(h.page, [...(m.get(h.page) ?? []), { h, i }]))
    return m
  }, [hits])

  const status = !sizes
    ? ''
    : !pages
      ? `文字を読んでいます…${Math.round(prog * 100)}%（読み終わると探せます）`
      : re
        ? hits.length
          ? `${cur + 1}/${hits.length}件・${hits[cur].page + 1}ページ`
          : '見つかりません'
        : `${pages.length}ページ・2本指で拡大できます`

  return (
    <Page title={title}>
      <div class="doc-search pdf-search">
        <label class="pdf-searchbox">
          <Search size={20} />
          <input type="text" enterKeyHint="search" placeholder="この文書の中を探す" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
          {q && (
            <button class="doc-clear" aria-label="消す" onClick={() => setQ('')}>
              <X size={18} />
            </button>
          )}
        </label>
        {sizes && (
          <div class="doc-nav">
            <span class="small">{status}</span>
            <button class="bar-btn" aria-label="前へ" disabled={!hits.length} onClick={() => setCur((c) => (c - 1 + hits.length) % hits.length)}>
              <ChevronUp size={22} />
            </button>
            <button class="bar-btn" aria-label="次へ" disabled={!hits.length} onClick={() => setCur((c) => (c + 1) % hits.length)}>
              <ChevronDown size={22} />
            </button>
          </div>
        )}
      </div>
      {!sizes && !err && (
        <Section>
          <div class="row sub">PMDA から取っています…{dl > 0 ? `${Math.round(dl * 100)}%` : ''}</div>
          <div class="pdf-bar">
            <span style={{ width: `${Math.round(dl * 100)}%` }} />
          </div>
        </Section>
      )}
      {err && (
        <Section footer="電波が無いか、PMDA から取れませんでした。元の文書（PMDA）を開いてください。">
          <div class="row sub">読み込めませんでした。</div>
        </Section>
      )}
      {doc && sizes && (
        <div class="pdf-scroll" ref={scroller}>
          <div class="pdf-list" ref={list} style={{ width: `${zoom * 100}%` }}>
            {sizes.map((sz, n) => (
              <PdfPage doc={doc} n={n} size={sz} zoom={zoom} hits={byPage.get(n) ?? []} cur={cur} />
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
