import { useEffect, useRef, useState } from 'preact/hooks'
import { FileText, Flashlight, FlashlightOff, Search, Trash2 } from 'lucide-preact'
import { prepareZXingModule, readBarcodes, type ReaderOptions } from 'zxing-wasm/reader'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'
import { ButtonRow, LabeledRow, Page, Section, Toggle, WarningRow, openExternal } from '../ui/components'
import { useNav, useVisible } from '../ui/nav'
import { persistedStore, useStore } from '../core/store'
import { matchesSearch } from '../core/format'
import { OtcBadge } from '../otc/otcViews'
import { PMDA, addScan, memoFor, parseGS1, scanHistory, type GS1Result } from './gs1'

// バーコードを読む部品（zxing-cpp の WebAssembly 版）は、このサイトに置いた物を使う（外部のサーバーから読まない）
prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
  },
})

const readerOptions: ReaderOptions = {
  formats: ['DataBar', 'DataBarExpanded', 'DataBarLimited', 'EAN-13', 'EAN-8', 'UPC-A', 'Code128', 'DataMatrix', 'QRCode'],
  tryHarder: true,
  tryRotate: true,
  maxNumberOfSymbols: 1,
}

export const autoOpenStore = persistedStore<boolean>('autoOpen', true)

type CamState = 'starting' | 'running' | 'denied' | 'unsupported' | 'error'

/** カメラの映像を少しずつ読み取る */
export function useScanner(onCode: (s: string) => void, paused: boolean, on: boolean) {
  const video = useRef<HTMLVideoElement>(null)
  const [state, setState] = useState<CamState>('starting')
  const [torchOK, setTorchOK] = useState(false)
  const [torch, setTorch] = useState(false)
  const track = useRef<MediaStreamTrack | null>(null)
  const onCodeRef = useRef(onCode)
  onCodeRef.current = onCode
  const pausedRef = useRef(paused)
  pausedRef.current = paused

  useEffect(() => {
    let stream: MediaStream | null = null
    let stop = false
    let timer = 0
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    let last = ''
    let lastAt = 0
    let frame = 0

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState('unsupported')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        })
      } catch (e) {
        setState((e as DOMException)?.name === 'NotAllowedError' ? 'denied' : 'error')
        return
      }
      if (stop) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      const v = video.current!
      v.srcObject = stream
      await v.play().catch(() => {})
      track.current = stream.getVideoTracks()[0] ?? null
      try {
        const caps = track.current?.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean; focusMode?: string[] }
        setTorchOK(!!caps?.torch)
        if (caps?.focusMode?.includes('continuous')) {
          await track.current!.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] })
        }
      } catch {
        /* 使えない機能は飛ばす */
      }
      setState('running')
      loop()
    }

    async function loop() {
      if (stop) return
      const v = video.current
      if (v && v.videoWidth > 0 && !pausedRef.current) {
        // 1回おきに「枠の中（真ん中の横長の部分）」と「映像全体」を読む。
        // 枠の中だけだとPTPの小さいバーコードが読みやすく、全体なら箱の横長のバーコードがはみ出しても読める
        const vw = v.videoWidth, vh = v.videoHeight
        const whole = frame++ % 2 === 1
        const cw = whole ? vw : Math.round(vw * 0.8)
        const ch = whole ? vh : Math.round(Math.min(vh * 0.5, cw * 0.5))
        canvas.width = cw
        canvas.height = ch
        ctx.drawImage(v, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, cw, ch)
        try {
          const res = await readBarcodes(ctx.getImageData(0, 0, cw, ch), readerOptions)
          const hit = res.find((r) => r.isValid && r.text)
          if (hit) {
            const now = Date.now()
            if (hit.text !== last || now - lastAt > 3000) {
              last = hit.text
              lastAt = now
              onCodeRef.current(hit.text)
            }
          }
        } catch {
          /* 1枚読めなくても続ける */
        }
      }
      timer = window.setTimeout(loop, 120)
    }

    if (!on) return
    start()
    return () => {
      stop = true
      clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
      track.current = null
      setTorch(false)
      setState('starting')
    }
  }, [on])

  const toggleTorch = async () => {
    const t = track.current
    if (!t) return
    try {
      await t.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] })
      setTorch(!torch)
    } catch {
      setTorchOK(false)
    }
  }
  return { video, state, torch, torchOK, toggleTorch }
}

/** 画面が見えていないとき（別のタブ・別の画面・アプリを離れたとき）はカメラを止める */
export function useCameraOn() {
  const visible = useVisible()
  const [pageShown, setPageShown] = useState(!document.hidden)
  useEffect(() => {
    const f = () => setPageShown(!document.hidden)
    document.addEventListener('visibilitychange', f)
    return () => document.removeEventListener('visibilitychange', f)
  }, [])
  return visible && pageShown
}

/** カメラの映像と読み取り枠 */
export function CameraBox({ cam }: { cam: ReturnType<typeof useScanner> }) {
  return (
    <div class="camera">
      <video ref={cam.video} playsInline muted autoPlay />
      {cam.state === 'running' && <div class="scan-frame" aria-hidden="true" />}
      {cam.state !== 'running' && (
        <div class="camera-msg">
          {cam.state === 'starting' && 'カメラを起動しています…'}
          {cam.state === 'denied' && 'カメラの使用が許可されていません。ブラウザの設定で、このサイトのカメラを許可してください。'}
          {cam.state === 'unsupported' && 'このブラウザではカメラを使えません。下の手入力を使ってください。'}
          {cam.state === 'error' && 'カメラを起動できませんでした。'}
        </div>
      )}
    </div>
  )
}

export function ScanPage() {
  const autoOpen = useStore(autoOpenStore)
  const history = useStore(scanHistory)
  const [result, setResult] = useState<GS1Result | null>(null)
  const [manual, setManual] = useState('')
  const [blocked, setBlocked] = useState(false)

  const handle = (code: string) => {
    const r = parseGS1(code)
    setResult(r)
    setBlocked(false)
    try {
      navigator.vibrate?.(30)
    } catch {
      /* 振動できない端末 */
    }
    if (!r.gtin) return
    addScan(r)
    if (autoOpenStore.get() && !openExternal(PMDA.url(r.gtin))) setBlocked(true)
  }
  const cam = useScanner(handle, false, useCameraOn())

  return (
    <Page
      title="バーコード"
      right={
        cam.torchOK && (
          <button class="bar-btn" aria-label={cam.torch ? 'ライトを消す' : 'ライトをつける'} onClick={cam.toggleTorch}>
            {cam.torch ? <Flashlight size={22} /> : <FlashlightOff size={22} />}
          </button>
        )
      }
    >
      <CameraBox cam={cam} />
      {result && (
        <Section header="読み取り結果">
          {result.gtin ? (
            <>
              {memoFor(history, result.gtin) && (
                <div class="row">
                  <b>{memoFor(history, result.gtin)}</b>
                </div>
              )}
              <LabeledRow label="GTIN" value={result.gtin} />
              <OtcBadge gtin={result.gtin} />
              {result.expiry && <LabeledRow label="有効期限" value={result.expiry} />}
              {result.lot && <LabeledRow label="ロット" value={result.lot} />}
              {result.quantity && <LabeledRow label="数量" value={result.quantity} />}
              <div class="row">
                <button class="primary-btn" onClick={() => openExternal(PMDA.url(result.gtin!))}>
                  <FileText size={20} /> 添付文書を開く
                </button>
              </div>
              {blocked && <div class="row small sub">自動で開けませんでした（ブラウザがポップアップを止めました）。上のボタンで開いてください。</div>}
            </>
          ) : (
            <>
              <WarningRow>医薬品のコード（GTIN）が見つかりませんでした</WarningRow>
              <div class="row small num" style={{ wordBreak: 'break-all' }}>
                {result.raw}
              </div>
            </>
          )}
        </Section>
      )}
      <Section footer="PTPシートのGS1データバー、箱のGS1-128・JANコードに対応しています。PTPのバーコードは小さいので、10cmほど離して枠いっぱいに写すと読みやすくなります。">
        <Toggle label="読み取ったらすぐ添付文書を開く" value={autoOpen} onChange={(v) => autoOpenStore.set(v)} />
      </Section>
      <Section header="手入力">
        <div class="row">
          <input
            class="text-input"
            inputMode="numeric"
            placeholder="GTIN（14桁）またはJAN（13桁）"
            value={manual}
            onInput={(e) => setManual((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && manual) {
                ;(e.target as HTMLInputElement).blur()
                handle(manual)
              }
            }}
          />
          <button class="bar-btn strong" disabled={!manual} onClick={() => handle(manual)}>
            開く
          </button>
        </div>
        <ButtonRow icon={<Search size={20} />} onClick={() => openExternal(PMDA.searchURL)}>
          PMDAで薬品名から探す
        </ButtonRow>
      </Section>
    </Page>
  )
}

const dateFmt = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export function HistoryPage() {
  const items = useStore(scanHistory)
  const nav = useNav()
  const [query, setQuery] = useState('')
  const filtered = query ? items.filter((x) => matchesSearch(x.memo + ' ' + x.gtin, query)) : items
  return (
    <Page title="履歴">
      <label class="search">
        <Search size={18} />
        <input type="search" placeholder="薬品名・GTIN" value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} />
      </label>
      <Section>
        {items.length === 0 && <div class="row sub">バーコードを読み取ると、ここに履歴が残ります</div>}
        {filtered.map((it) => (
          <div class="row hist-row">
            <button class="hist-main" onClick={() => nav.push(<HistoryDetailPage id={it.id} />)}>
              <span class={it.memo ? '' : 'sub'}>{it.memo || '名称未登録'}</span>
              <span class="small sub num">{it.gtin}</span>
              <span class="small sub">{dateFmt.format(new Date(it.date))}</span>
            </button>
            <button class="ped-doc" aria-label="添付文書を開く" onClick={() => openExternal(PMDA.url(it.gtin))}>
              <FileText size={20} />
              <span>添付文書</span>
            </button>
          </div>
        ))}
      </Section>
    </Page>
  )
}

function HistoryDetailPage({ id }: { id: string }) {
  const items = useStore(scanHistory)
  const nav = useNav()
  const item = items.find((x) => x.id === id)
  if (!item) {
    return (
      <Page title="履歴の詳細">
        <Section>
          <div class="row sub">削除されました</div>
        </Section>
      </Page>
    )
  }
  return (
    <Page title="履歴の詳細">
      <Section footer="薬品名を入れておくと、次に読み取ったときにも表示されます">
        <div class="row">
          <input
            class="text-input"
            placeholder="薬品名（メモ）"
            value={item.memo}
            onInput={(e) => {
              const v = (e.target as HTMLInputElement).value
              scanHistory.set((l) => l.map((x) => (x.id === id ? { ...x, memo: v } : x)))
            }}
          />
        </div>
      </Section>
      <Section>
        <LabeledRow label="GTIN" value={item.gtin} />
        {item.expiry && <LabeledRow label="有効期限" value={item.expiry} />}
        {item.lot && <LabeledRow label="ロット" value={item.lot} />}
        <LabeledRow label="読み取り日時" value={dateFmt.format(new Date(item.date))} />
      </Section>
      <Section>
        <ButtonRow icon={<FileText size={20} />} onClick={() => openExternal(PMDA.url(item.gtin))}>
          添付文書を開く
        </ButtonRow>
        <ButtonRow
          danger
          icon={<Trash2 size={20} />}
          onClick={() => {
            scanHistory.set((l) => l.filter((x) => x.id !== id))
            nav.back()
          }}
        >
          この履歴を削除
        </ButtonRow>
      </Section>
    </Page>
  )
}
