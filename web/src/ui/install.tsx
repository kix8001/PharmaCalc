// ホーム画面への追加の案内（下のタブのすぐ上に出す）
// ・Android の Chrome など：beforeinstallprompt を受け取って「ホーム画面に追加」ボタン（押すと確認が出て、インストール）
// ・iPhone の Safari：サイトから追加はできないので、共有ボタン →「ホーム画面に追加」の手順を出す
// ・ホーム画面から開いているとき（standalone）は出さない。「あとで」で7日間出さない
import { useEffect, useState } from 'preact/hooks'
import { Share, SquarePlus, X } from 'lucide-preact'

interface InstallEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallEvent | null = null
const listeners = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallEvent
    listeners.forEach((f) => f())
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    listeners.forEach((f) => f())
  })
}

const LATER_KEY = 'installLater'
const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
/** iPhone・iPad（iPadOS は Mac のふりをするので、触れる画面かでも見る） */
export const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1)
/** iPhone の Safari 以外（Chrome・LINE などのアプリの中のブラウザ）。ホーム画面に追加できないので Safari で開いてもらう */
const iosOther = isIOS && /CriOS|FxiOS|EdgiOS|Line\/|FBAN|FBAV|Instagram|GSA\//.test(ua)
const isAndroid = /Android/.test(ua)

/** ホーム画面から開いているか */
export function isStandalone(): boolean {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  } catch {
    return false
  }
}

function laterUntil(): number {
  try {
    return Number(localStorage.getItem(LATER_KEY)) || 0
  } catch {
    return 0
  }
}

/** 案内の中身（情報の画面からも使う） */
export function InstallSteps({ canPrompt, onPrompt }: { canPrompt: boolean; onPrompt?: () => void }) {
  if (canPrompt)
    return (
      <button class="install-btn" onClick={onPrompt}>
        <SquarePlus size={20} /> ホーム画面に追加
      </button>
    )
  if (iosOther)
    return (
      <div class="install-steps">
        このブラウザではホーム画面に追加できません。<b>Safari</b> でこのページを開いてから追加してください（右下や右上の「…」→「Safari で開く」など）。
      </div>
    )
  if (isIOS)
    return (
      <ol class="install-steps">
        <li>
          画面の下（または上）の <b>共有ボタン</b> <Share size={16} class="install-ic" /> を押す（見当たらなければ「…」の中）
        </li>
        <li>
          <b>「ホーム画面に追加」</b>を選ぶ（無ければ下に動かす）
        </li>
        <li>
          <b>「Webアプリとして開く」</b>がオンのまま、右上の<b>「追加」</b>を押す
        </li>
      </ol>
    )
  if (isAndroid)
    return (
      <ol class="install-steps">
        <li>
          Chrome の右上の <b>︙</b> を押す
        </li>
        <li>
          <b>「ホーム画面に追加」</b>か<b>「アプリをインストール」</b>を選ぶ
        </li>
      </ol>
    )
  return <div class="install-steps">ブラウザのメニューから「ホーム画面に追加」（または「アプリをインストール」）を選んでください。</div>
}

/** 下のタブのすぐ上に出す案内 */
export function InstallBanner() {
  const [, tick] = useState(0)
  const [hidden, setHidden] = useState(() => isStandalone() || laterUntil() > Date.now())
  useEffect(() => {
    const f = () => tick((x) => x + 1)
    listeners.add(f)
    return () => {
      listeners.delete(f)
    }
  }, [])
  // スマホ以外（パソコン）では、インストールの確認が出せるときだけ出す
  if (hidden || isStandalone() || (!isIOS && !isAndroid && !deferred)) return null
  const later = () => {
    try {
      localStorage.setItem(LATER_KEY, String(Date.now() + 7 * 86400000))
    } catch {
      /* 保存できなくても今は閉じる */
    }
    setHidden(true)
  }
  const prompt = async () => {
    if (!deferred) return
    const e = deferred
    await e.prompt()
    const r = await e.userChoice.catch(() => null)
    deferred = null
    if (r?.outcome === 'accepted') setHidden(true)
    tick((x) => x + 1)
  }
  return (
    <div class="install-banner" role="dialog" aria-label="ホーム画面に追加">
      <div class="install-head">
        <img src="./icon-192.png" alt="" class="install-icon" />
        <div class="install-title">
          <b>メドスキャンをホーム画面に追加</b>
          <span class="small sub">アプリのように1タップで開けて、電波が無くても使えます</span>
        </div>
        <button class="install-close" aria-label="閉じる" onClick={later}>
          <X size={18} />
        </button>
      </div>
      <InstallSteps canPrompt={!!deferred} onPrompt={prompt} />
    </div>
  )
}

/** 情報の画面の「ホーム画面に追加」 */
export function InstallInfo() {
  const [, tick] = useState(0)
  useEffect(() => {
    const f = () => tick((x) => x + 1)
    listeners.add(f)
    return () => {
      listeners.delete(f)
    }
  }, [])
  if (isStandalone()) return <div class="row small sub">ホーム画面から開いています（追加済み）。</div>
  return (
    <div class="row" style={{ display: 'block' }}>
      <InstallSteps
        canPrompt={!!deferred}
        onPrompt={async () => {
          if (!deferred) return
          await deferred.prompt()
          await deferred.userChoice.catch(() => null)
          deferred = null
          tick((x) => x + 1)
        }}
      />
    </div>
  )
}
