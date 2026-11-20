import { useEffect, useRef, useState } from 'preact/hooks'
import { Camera, Crop, Image as ImageIcon } from 'lucide-preact'
import { ButtonRow, NumField, OkRow, Page, ResultRow, Section, Segmented, WarningRow } from '../ui/components'
import { persistedStore, useStore } from '../core/store'
import { CameraShot } from './cameraShot'
import { parseIntNum } from '../core/format'
import { nextMarkerId, type PillMarker, type Rect } from './pillCounter'

interface Prepared {
  url: string
  width: number
  height: number
  rgba: Uint8ClampedArray
}

/** 向きを直し、長辺を 1200 画素に縮小する */
async function prepare(file: File): Promise<Prepared> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions)
  const scale = Math.min(1, 1200 / Math.max(bmp.width, bmp.height))
  const width = Math.max(1, Math.floor(bmp.width * scale)), height = Math.max(1, Math.floor(bmp.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bmp, 0, 0, width, height)
  bmp.close?.()
  const rgba = ctx.getImageData(0, 0, width, height).data
  const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/jpeg', 0.9))
  return { url: URL.createObjectURL(blob), width, height, rgba }
}

/** 錠剤の形（round＝丸い錠剤：円の検出、any＝楕円・長い錠剤・カプセル：形を問わない数え方） */
const shapeStore = persistedStore<'round' | 'any'>('pillShape', 'round')

let worker: Worker | null = null
let jobSeq = 0
function getWorker() {
  worker ??= new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  return worker
}

export function PillCountPage() {
  const [prepared, setPrepared] = useState<Prepared | null>(null)
  const [markers, setMarkers] = useState<PillMarker[]>([])
  const [radius, setRadius] = useState(12)
  const [sensitivity, setSensitivity] = useState(0.5)
  const [busy, setBusy] = useState(false)
  const [expected, setExpected] = useState('')
  const [roi, setRoi] = useState<Rect | null>(null)
  const [selecting, setSelecting] = useState(false)
  /** 楕円・長い錠剤：見本の1錠を囲んだ四角（大きさと色を覚える）。sampling は囲んでいる最中 */
  const [sample, setSample] = useState<Rect | null>(null)
  const [sampling, setSampling] = useState(false)
  const [error, setError] = useState('')
  const camIn = useRef<HTMLInputElement>(null)
  const shape = useStore(shapeStore)
  const [shooting, setShooting] = useState(false)
  const libIn = useRef<HTMLInputElement>(null)
  const job = useRef(0)
  const total = markers.reduce((a, m) => a + m.count, 0)

  useEffect(() => () => prepared && URL.revokeObjectURL(prepared.url), [prepared])

  const analyze = (p: Prepared | null = prepared, area: Rect | null = roi, s = sensitivity, sh = shape, sm: Rect | null = sample) => {
    if (!p) return
    // 楕円・長い錠剤は、見本の1錠を囲んでから数える
    if (sh === 'any' && !sm) {
      setMarkers([])
      setBusy(false)
      setSampling(true)
      return
    }
    setSampling(false)
    setBusy(true)
    const id = ++jobSeq
    job.current = id
    const w = getWorker()
    w.onmessage = (e: MessageEvent<{ job: number; markers: PillMarker[]; unitRadius: number; noSample?: boolean }>) => {
      if (e.data.job !== job.current) return
      if (e.data.noSample) {
        // タップした所から錠剤の形が分からなかった
        setBusy(false)
        setSample(null)
        setSampling(true)
        setError('見本の錠剤が分かりませんでした。ほかと離れている錠剤の真ん中をタップし直してください。')
        return
      }
      setError('')
      setMarkers(e.data.markers.map((m) => ({ ...m, id: nextMarkerId() })))
      setRadius(e.data.unitRadius)
      setBusy(false)
    }
    w.onerror = () => {
      setBusy(false)
      setError('数えられませんでした。もう一度撮ってください。')
    }
    w.postMessage({ rgba: p.rgba.slice(), width: p.width, height: p.height, sensitivity: s, roi: area, job: id, shape: sh, sample: sm })
  }

  const load = async (file: File | undefined) => {
    if (!file) return
    setError('')
    setBusy(true)
    setMarkers([])
    setRoi(null)
    setSelecting(false)
    setSample(null)
    try {
      const p = await prepare(file)
      setPrepared(p)
      analyze(p, null, sensitivity, shape, null)
    } catch {
      setBusy(false)
      setError('写真を読み込めませんでした。')
    }
  }

  const e = parseIntNum(expected)
  return (
    <Page title="錠剤カウント">
      {shooting && (
        <CameraShot
          onShot={(f) => {
            setShooting(false)
            load(f)
          }}
          onClose={() => setShooting(false)}
          onFail={() => {
            // アプリの中でカメラを開けない端末は、端末のカメラアプリで撮る
            setShooting(false)
            camIn.current?.click()
          }}
        />
      )}
      <Section header="錠剤の形" footer="丸い錠剤は「丸い」、楕円の錠剤・細長い錠剤・カプセルは「楕円・長い・カプセル」を選んでください（選んだ物は次も使います）。">
        <Segmented
          options={[
            ['round', '丸い'],
            ['any', '楕円・長い・カプセル'],
          ]}
          value={shape}
          onChange={(v) => {
            shapeStore.set(v)
            analyze(prepared, roi, sensitivity, v)
          }}
        />
      </Section>
      <Section footer="袋から出し、無地の紙やトレーの上に重ならないように広げて、真上から画面いっぱいに撮ってください。白い錠剤は黒い背景、色の濃い錠剤は白い背景が向いています。">
        <ButtonRow icon={<Camera size={20} />} onClick={() => setShooting(true)}>
          撮影する
        </ButtonRow>
        <ButtonRow icon={<ImageIcon size={20} />} onClick={() => libIn.current?.click()}>
          写真から選ぶ
        </ButtonRow>
        <input ref={camIn} type="file" accept="image/*" capture="environment" hidden onChange={(ev) => load((ev.target as HTMLInputElement).files?.[0]).then(() => ((ev.target as HTMLInputElement).value = ''))} />
        <input ref={libIn} type="file" accept="image/*" hidden onChange={(ev) => load((ev.target as HTMLInputElement).files?.[0]).then(() => ((ev.target as HTMLInputElement).value = ''))} />
      </Section>
      {error && (
        <Section>
          <WarningRow>{error}</WarningRow>
        </Section>
      )}
      {prepared && (
        <>
          <Section
            footer={
              sampling ? (
                <span style={{ color: 'var(--orange)' }}>数える錠剤を1錠タップしてください（なるべく錠剤の真ん中を。大きさと色を覚えて、同じ形の錠剤を数えます）。</span>
              ) : selecting ? (
                <span style={{ color: 'var(--orange)' }}>写真の上を指でなぞって、数える範囲を四角で囲んでください。</span>
              ) : (
                '緑の点が自動で数えた錠剤です。点をタップすると消え、点のない錠剤をタップすると追加します（青の点）。机の端などが写っているときは「数える範囲を指定」で錠剤だけを囲んでください。'
              )
            }
          >
            <MarkedImage
              p={prepared}
              markers={markers}
              setMarkers={setMarkers}
              radius={radius}
              roi={roi}
              selecting={selecting || sampling}
              pointMode={sampling}
              busy={busy}
              onSelect={(r) => {
                if (sampling) {
                  setSample(r)
                  setSampling(false)
                  analyze(prepared, roi, sensitivity, shape, r)
                  return
                }
                setRoi(r)
                setSelecting(false)
                analyze(prepared, r)
              }}
            />
          </Section>
          <Section header="結果">
            <ResultRow title="錠数" value={busy ? '…' : String(total)} unit="錠" color="orange" />
            <NumField title="予定数（任意）" value={expected} onChange={setExpected} unit="錠" integer />
            {e != null && e > 0 && !busy && (e === total ? <OkRow>予定数と一致しています</OkRow> : <WarningRow>{total > e ? `予定より${total - e}錠多い` : `予定より${e - total}錠足りない`}</WarningRow>)}
          </Section>
          <Section>
            {shape === 'any' && (
              <ButtonRow onClick={() => setSampling((s) => !s)}>{sampling ? '選ぶのをやめる' : '見本の1錠を選び直す'}</ButtonRow>
            )}
            <ButtonRow icon={<Crop size={20} />} onClick={() => setSelecting((s) => !s)}>
              {selecting ? '範囲の指定をやめる' : '数える範囲を指定'}
            </ButtonRow>
            {roi && (
              <ButtonRow
                onClick={() => {
                  setRoi(null)
                  analyze(prepared, null)
                }}
              >
                範囲を解除（全体を数える）
              </ButtonRow>
            )}
          </Section>
          <Section header="感度" footer="背景の模様や影を錠剤と間違えるときは感度を下げ、薄い色の錠剤を見落とすときは上げてください。">
            <div class="row" style={{ gap: '12px' }}>
              <span class="small sub">低</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={sensitivity}
                aria-label="感度"
                style={{ flex: 1, accentColor: 'var(--btn)' }}
                onInput={(ev) => setSensitivity(Number((ev.target as HTMLInputElement).value))}
                onChange={(ev) => analyze(prepared, roi, Number((ev.target as HTMLInputElement).value))}
              />
              <span class="small sub">高</span>
            </div>
            <ButtonRow onClick={() => analyze()}>自動で数え直す</ButtonRow>
            <ButtonRow danger onClick={() => setMarkers([])}>
              印をすべて消す
            </ButtonRow>
          </Section>
        </>
      )}
    </Page>
  )
}

/** 写真の上に印を重ねて表示し、タップで印を足し引きする。範囲指定中はなぞって四角を描く */
function MarkedImage(props: {
  p: Prepared
  markers: PillMarker[]
  setMarkers: (f: (m: PillMarker[]) => PillMarker[]) => void
  radius: number
  roi: Rect | null
  selecting: boolean
  /** 見本の1錠を選ぶとき：タップ（点）でも四角でもよい */
  pointMode?: boolean
  busy: boolean
  onSelect: (r: Rect) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const { p } = props
  // 画像の画素 ↔ 画面上の位置
  const scale = () => (box.current ? box.current.clientWidth / p.width : 1)
  const toImg = (ev: PointerEvent) => {
    const r = box.current!.getBoundingClientRect()
    const s = r.width / p.width
    return { x: (ev.clientX - r.left) / s, y: (ev.clientY - r.top) / s }
  }

  const tap = (x: number, y: number) => {
    const s = scale()
    const r = Math.min(Math.max(props.radius * s, 6), 40)
    props.setMarkers((ms) => {
      let best = -1, bd = Infinity
      ms.forEach((m, i) => {
        const d = Math.hypot(m.x - x, m.y - y)
        if (d < bd) {
          bd = d
          best = i
        }
      })
      if (best >= 0 && bd * s <= Math.max(r, 14)) {
        const m = ms[best]
        return m.count > 1 ? ms.map((x, i) => (i === best ? { ...x, count: x.count - 1 } : x)) : ms.filter((_, i) => i !== best)
      }
      return [...ms, { id: nextMarkerId(), x, y, count: 1, manual: true }]
    })
  }

  const rect = drag
    ? { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0) }
    : props.roi
  // 印の大きさ（画像の画素で。表示の幅にかかわらず見やすい大きさにする）
  const s = box.current ? box.current.clientWidth / p.width : 0.4
  const dot = Math.min(Math.max(Math.min(Math.max(props.radius * s, 6), 40) * 0.45, 6), 12) / (s || 1)

  return (
    <div
      ref={box}
      class="pill-image"
      style={{ aspectRatio: `${p.width} / ${p.height}`, touchAction: props.selecting ? 'none' : 'manipulation' }}
      onPointerDown={(ev) => {
        if (!props.selecting) return
        ;(ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId)
        const a = toImg(ev)
        setDrag({ x0: a.x, y0: a.y, x1: a.x, y1: a.y })
      }}
      onPointerMove={(ev) => {
        if (!props.selecting || !drag) return
        const a = toImg(ev)
        setDrag({ ...drag, x1: Math.max(0, Math.min(p.width, a.x)), y1: Math.max(0, Math.min(p.height, a.y)) })
      }}
      onPointerUp={(ev) => {
        if (props.selecting) {
          if (drag) {
            const r = { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0) }
            if (props.pointMode && Math.max(r.w, r.h) * scale() < 20) props.onSelect({ x: drag.x0, y: drag.y0, w: 0, h: 0 })
            else if (props.pointMode ? Math.max(r.w, r.h) * scale() >= 20 : r.w * scale() > 20 && r.h * scale() > 20) props.onSelect(r)
          }
          setDrag(null)
          return
        }
        const a = toImg(ev)
        tap(a.x, a.y)
      }}
    >
      <img src={p.url} alt="数える錠剤の写真" draggable={false} />
      <svg viewBox={`0 0 ${p.width} ${p.height}`} preserveAspectRatio="none" aria-hidden="true">
        {rect && (
          <>
            <path d={`M0 0H${p.width}V${p.height}H0Z M${rect.x} ${rect.y}V${rect.y + rect.h}H${rect.x + rect.w}V${rect.y}Z`} fill="rgba(0,0,0,.45)" fill-rule="evenodd" />
            <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill="none" stroke="#ffd60a" stroke-width={2 / (s || 1)} stroke-dasharray={`${6 / (s || 1)} ${4 / (s || 1)}`} />
          </>
        )}
        {props.markers.map((m) => (
          <g>
            <circle cx={m.x} cy={m.y} r={dot / 2} fill={m.manual ? '#1d6ff2' : '#22b14c'} stroke="#fff" stroke-width={1.5 / (s || 1)} />
            {m.count > 1 && (
              <text x={m.x + dot} y={m.y - dot} fill="#fff" font-size={dot * 1.2} font-weight="700" stroke="#c2410c" stroke-width={dot * 0.25} paint-order="stroke">
                {m.count}
              </text>
            )}
          </g>
        ))}
      </svg>
      {props.busy && (
        <div class="pill-busy" role="status">
          数えています…
        </div>
      )}
    </div>
  )
}
