import { useEffect, useRef, useState } from 'preact/hooks'
import { FileText, Flashlight, FlashlightOff, Search, SwitchCamera, Trash2 } from 'lucide-preact'
import { prepareZXingModule, readBarcodes, type ReaderOptions } from 'zxing-wasm/reader'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'
import { ButtonRow, LabeledRow, Page, Section, Toggle, WarningRow, openExternal } from '../ui/components'
import { useNav, useVisible } from '../ui/nav'
import { persistedStore, useStore } from '../core/store'
import { matchesSearch } from '../core/format'
import { OtcBadge } from '../otc/otcViews'
import { LimitBadge } from '../limits/limits'
import { RmpBadge } from '../rmp/rmp'
import { PMDA, addScan, memoFor, parseGS1, scanHistory, setAutoName, type GS1Result } from './gs1'
import { nameForGtin } from '../otc/otcData'

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
/** カメラの倍率（ズームできる端末だけ。0＝まだ選んでいない→2倍で始める） */
const zoomStore = persistedStore<number>('cameraZoom', 0)
/** 選んだ背面カメラ（deviceId。空＝自動で選ぶ） */
const cameraStore = persistedStore<string>('cameraDevice', '')

interface CamInfo {
  id: string
  label: string
}

/** 背面のカメラの一覧（許可を得たあとでないと名前が分からない） */
async function backCameras(): Promise<CamInfo[]> {
  const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput')
  const back = all.filter((d) => /back|rear|environment|背面|後面/i.test(d.label))
  return (back.length ? back : all).map((d) => ({ id: d.deviceId, label: d.label }))
}

/**
 * 自動で選ぶカメラ。Android の Chrome では背面カメラが何台も並び、近くにピントが合わない物（超広角・望遠など）が
 * 選ばれることがあるので、メインのカメラ（名前が「camera2 0」や「camera 0」）を優先する
 */
function preferredCamera(cams: CamInfo[]): string | null {
  const saved = cameraStore.get()
  if (saved && cams.some((c) => c.id === saved)) return saved
  const main = cams.find((c) => /camera2? 0\b/i.test(c.label))
  return main ? main.id : null
}

type CamState = 'starting' | 'running' | 'denied' | 'stopped' | 'unsupported' | 'error'

/** このページで一度でもカメラが動いたか（動いたあとに断られたら「再開」のボタンを出す） */
let startedOnce = false
/** 「タップしてカメラを再開」で、押した流れの中で取ったカメラの映像（次の起動でそのまま使う） */
let pendingStream: MediaStream | null = null
const SIZE = { width: { ideal: 1920 }, height: { ideal: 1080 } }

/** iPhone・iPad（ホーム画面のアプリは、アプリを離れて戻るとカメラを断ることがある） */
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/** カメラの映像を少しずつ読み取る */
export function useScanner(onCode: (s: string) => void, paused: boolean, on: boolean) {
  const video = useRef<HTMLVideoElement>(null)
  const [state, setState] = useState<CamState>('starting')
  const [torchOK, setTorchOK] = useState(false)
  const [torch, setTorch] = useState(false)
  /** ズームできる範囲（できない端末は null） */
  const [zoomMax, setZoomMax] = useState<number | null>(null)
  const [zoom, setZoomState] = useState(1)
  /** 背面カメラの一覧と、いま使っている物 */
  const [cams, setCams] = useState<CamInfo[]>([])
  const [camId, setCamId] = useState('')
  /** カメラを切り替えたら作り直す */
  const [restart, setRestart] = useState(0)
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
    let wasHidden = false

    let tries = 0
    let retryTimer = 0
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState('unsupported')
        return
      }
      const size = SIZE
      try {
        const saved = cameraStore.get()
        const got = pendingStream
        pendingStream = null
        stream = got && got.getVideoTracks()[0]?.readyState === 'live' ? got : await navigator.mediaDevices
          .getUserMedia({ audio: false, video: saved ? { deviceId: { exact: saved }, ...size } : { facingMode: { ideal: 'environment' }, ...size } })
          .catch(() => navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, ...size } }))
      } catch (e) {
        // iPhone のホーム画面のアプリは、添付文書などから戻った直後にカメラを断ることがある。少し待って数回やり直す
        if (!stop && tries < 3) {
          tries++
          retryTimer = window.setTimeout(start, 700 * tries)
          return
        }
        setState((e as DOMException)?.name === 'NotAllowedError' ? (startedOnce ? 'stopped' : 'denied') : 'error')
        return
      }
      if (stop) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      tries = 0
      startedOnce = true
      // 背面カメラが何台もあるときは、メインのカメラに替える
      try {
        const list = await backCameras()
        setCams(list)
        const cur = stream.getVideoTracks()[0]?.getSettings().deviceId ?? ''
        const want = preferredCamera(list)
        if (want && want !== cur && !stop) {
          stream.getTracks().forEach((t) => t.stop())
          stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { deviceId: { exact: want }, ...size } })
        }
        setCamId(stream.getVideoTracks()[0]?.getSettings().deviceId ?? '')
      } catch {
        /* 一覧が取れない端末は、そのままのカメラで */
      }
      const v = video.current!
      v.srcObject = stream
      await v.play().catch(() => {})
      track.current = stream.getVideoTracks()[0] ?? null
      try {
        const caps = track.current?.getCapabilities?.() as MediaTrackCapabilities & {
          torch?: boolean
          focusMode?: string[]
          zoom?: { min: number; max: number }
        }
        setTorchOK(!!caps?.torch)
        if (caps?.focusMode?.includes('continuous')) {
          await track.current!.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] })
        }
        // 近くにピントが合わないカメラ（Galaxy の Ultra など）でも、2倍にして20cmほど離せば小さいPTPのバーコードを読める
        if (caps?.zoom && caps.zoom.max >= 1.5) {
          const max = Math.min(caps.zoom.max, 4)
          setZoomMax(max)
          const want = Math.min(zoomStore.get() || 2, max)
          await track.current!.applyConstraints({ advanced: [{ zoom: want } as MediaTrackConstraintSet] })
          setZoomState(want)
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
      // 隠れている間は読まない。戻ってきたら、同じコードはしばらく読み直さない（添付文書が何度も開かないように）
      if (document.hidden) {
        wasHidden = true
      } else if (wasHidden) {
        wasHidden = false
        lastAt = Date.now() + 5000
      }
      if (v && v.videoWidth > 0 && !pausedRef.current && !document.hidden) {
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
    // iPhone では、アプリを離れても映像を止めない（止めると戻ったときにカメラを断られる）。
    // 戻ったら映像を動かし直し、映像が切れていたら起動し直す
    const onShow = () => {
      if (document.hidden || stop) return
      const t = stream?.getVideoTracks()[0]
      if (!t || t.readyState === 'ended') setRestart((x) => x + 1)
      else video.current?.play().catch(() => {})
    }
    if (isIOS) document.addEventListener('visibilitychange', onShow)
    return () => {
      document.removeEventListener('visibilitychange', onShow)
      stop = true
      clearTimeout(timer)
      clearTimeout(retryTimer)
      stream?.getTracks().forEach((t) => t.stop())
      track.current = null
      setTorch(false)
      setZoomMax(null)
      setState('starting')
    }
  }, [on, restart])

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
  const setZoom = async (z: number) => {
    const t = track.current
    if (!t) return
    try {
      await t.applyConstraints({ advanced: [{ zoom: z } as MediaTrackConstraintSet] })
      setZoomState(z)
      zoomStore.set(z)
    } catch {
      setZoomMax(null)
    }
  }
  /** 次の背面カメラに切り替える（選んだ物は次も使う） */
  const switchCamera = () => {
    if (cams.length < 2) return
    const i = cams.findIndex((c) => c.id === camId)
    cameraStore.set(cams[(i + 1) % cams.length].id)
    setRestart((x) => x + 1)
  }
  /** 押したらカメラを起動し直す（iPhone は画面を押した流れでないとカメラを許可しないことがある） */
  const resume = () => {
    setState('starting')
    const saved = cameraStore.get()
    navigator.mediaDevices
      ?.getUserMedia({ audio: false, video: saved ? { deviceId: { exact: saved }, ...SIZE } : { facingMode: { ideal: 'environment' }, ...SIZE } })
      .catch(() => navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, ...SIZE } }))
      .then((st) => {
        pendingStream = st
      })
      .catch(() => {})
      .finally(() => setRestart((x) => x + 1))
  }
  /** 映像を押したら、ピントを合わせ直す */
  const refocus = async () => {
    const t = track.current
    if (!t) return
    const caps = t.getCapabilities?.() as MediaTrackCapabilities & { focusMode?: string[] }
    try {
      if (caps?.focusMode?.includes('single-shot')) await t.applyConstraints({ advanced: [{ focusMode: 'single-shot' } as MediaTrackConstraintSet] })
      if (caps?.focusMode?.includes('continuous')) await t.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] })
    } catch {
      /* ピント合わせができない端末 */
    }
  }
  const camNo = cams.findIndex((c) => c.id === camId) + 1
  return { video, state, resume, torch, torchOK, toggleTorch, zoom, zoomMax, setZoom, refocus, camCount: cams.length, camNo, switchCamera }
}

/**
 * 画面が見えていないとき（別のタブ・別の画面・アプリを離れたとき）はカメラを止める。
 * ただし iPhone では、アプリを離れたときは止めない（止めると戻ったときにカメラを断られ、アプリを終了するまで使えなくなるため）
 */
export function useCameraOn() {
  const visible = useVisible()
  const [pageShown, setPageShown] = useState(!document.hidden)
  useEffect(() => {
    const f = () => setPageShown(!document.hidden)
    document.addEventListener('visibilitychange', f)
    return () => document.removeEventListener('visibilitychange', f)
  }, [])
  return visible && (isIOS || pageShown)
}

/** カメラの映像と読み取り枠 */
export function CameraBox({ cam }: { cam: ReturnType<typeof useScanner> }) {
  return (
    <div class="camera">
      <video ref={cam.video} playsInline muted autoPlay onClick={cam.refocus} />
      {cam.state === 'running' && <div class="scan-frame" aria-hidden="true" />}
      {cam.state === 'running' && cam.camCount > 1 && (
        <button class="cam-switch" onClick={cam.switchCamera} aria-label="カメラを切り替える">
          <SwitchCamera size={18} /> カメラ {cam.camNo || 1}/{cam.camCount}
        </button>
      )}
      {cam.state === 'running' && cam.zoomMax && (
        <div class="zoom-chips">
          {[1, 2, 3, 4]
            .filter((z) => z <= cam.zoomMax! + 0.01)
            .map((z) => (
              <button class={'zoom-chip' + (Math.abs(cam.zoom - z) < 0.05 ? ' on' : '')} onClick={() => cam.setZoom(z)}>
                {z}×
              </button>
            ))}
        </div>
      )}
      {cam.state !== 'running' && (
        <div class="camera-msg">
          {cam.state === 'starting' && 'カメラを起動しています…'}
          {cam.state === 'denied' && 'カメラの使用が許可されていません。ブラウザの設定で、このサイトのカメラを許可してください。'}
          {cam.state === 'stopped' && 'カメラが止まりました。'}
          {(cam.state === 'stopped' || cam.state === 'denied' || cam.state === 'error') && (
            <button class="cam-resume" onClick={cam.resume}>
              タップしてカメラを再開
            </button>
          )}
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
    fillName(r.gtin)
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
              <LimitBadge gtin={result.gtin} />
              <RmpBadge gtin={result.gtin} />
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
      <Section footer="PTPシートのGS1データバー、箱のGS1-128・JANコードに対応しています。PTPのバーコードは小さいので、枠いっぱいに写すと読みやすくなります。ピントが合わないときは、倍率を2×か3×にして少し離すか、映像を押してピントを合わせ直してください。それでもぼやけるときは、右上の「カメラ」で別のカメラに切り替えてください（選んだカメラは次も使います）。">
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

/** 履歴の薬品名が空なら、箱のコードの表や PMDA の添付文書から調べて入れる */
function fillName(gtin: string) {
  if (memoFor(scanHistory.get(), gtin)) return
  nameForGtin(gtin)
    .then((n) => n && setAutoName(gtin, n))
    .catch(() => {})
}

/** 前に読んだ履歴で薬品名が空の物も、履歴を開いたときに順に調べて入れる（1回に30件まで） */
let backfilling = false
async function backfillNames() {
  if (backfilling) return
  backfilling = true
  try {
    const gtins = scanHistory
      .get()
      .filter((x) => !x.memo)
      .map((x) => x.gtin)
      .slice(0, 30)
    for (const g of gtins) {
      const n = await nameForGtin(g).catch(() => null)
      if (n) setAutoName(g, n)
    }
  } finally {
    backfilling = false
  }
}

const dateFmt = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export function HistoryPage() {
  const items = useStore(scanHistory)
  const nav = useNav()
  const [query, setQuery] = useState('')
  const filtered = query ? items.filter((x) => matchesSearch(x.memo + ' ' + x.gtin, query)) : items
  useEffect(() => {
    backfillNames()
  }, [])
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
