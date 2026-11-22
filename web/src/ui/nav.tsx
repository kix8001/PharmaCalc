import { createContext, type ComponentChildren, type VNode } from 'preact'
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks'

/** 画面の積み重ね（iOS の NavigationStack に当たる）。タブごとに1つ持つ */
export interface NavApi {
  push(node: VNode): void
  back(): void
  /** 0 ならタブの最初の画面 */
  depth: number
}

const NavCtx = createContext<NavApi>({ push() {}, back() {}, depth: 0 })
export const useNav = () => useContext(NavCtx)

/** この画面がいま見えているか（タブが選ばれていて、いちばん上の画面） */
const VisibleCtx = createContext(true)
export const useVisible = () => useContext(VisibleCtx)

interface Entry {
  id: number
  node: VNode
}

let seq = 0

/**
 * iPhone のホーム画面のアプリで、ときどき画面の中のスクロールが固まる対策。
 * ・キーボードを閉じたあと、画面全体がずれたまま残ることがある → 元の位置に戻す
 * ・隠れていたスクロール部分が表に戻ったとき動かないことがある → overflow を一度切り替えて起こし直す
 */
export function wakeScroll() {
  if (typeof window === 'undefined') return
  if (window.scrollX || window.scrollY) window.scrollTo(0, 0)
  document.querySelectorAll<HTMLElement>('.page-body').forEach((el) => {
    if (!el.offsetParent) return
    const top = el.scrollTop
    el.style.overflowY = 'hidden'
    void el.offsetHeight
    el.style.overflowY = ''
    el.scrollTop = top
  })
}
if (typeof window !== 'undefined') {
  window.addEventListener('focusout', () => setTimeout(wakeScroll, 120))
  window.addEventListener('pageshow', () => setTimeout(wakeScroll, 0))
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) setTimeout(wakeScroll, 0)
  })
  window.visualViewport?.addEventListener('resize', () => setTimeout(wakeScroll, 120))
}
/** いま表示しているタブの「1つ戻る」（ブラウザ・Android の戻るボタン用） */
let activePop: (() => boolean) | null = null
let ignorePop = 0

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (ignorePop > 0) {
      ignorePop--
      return
    }
    activePop?.()
  })
}

export function Stack({ root, active, home }: { root: VNode; active: boolean; home?: number }) {
  const [entries, setEntries] = useState<Entry[]>([])
  const rootRef = useRef<HTMLDivElement>(null)
  // 下のタブを押したとき（home が増えたとき）：最初の画面に戻り、いちばん上までスクロールする
  useEffect(() => {
    if (!home) return
    if (entriesRef.current.length) setEntries([])
    requestAnimationFrame(() => rootRef.current?.querySelector('.page-body')?.scrollTo({ top: 0 }))
  }, [home])
  const entriesRef = useRef(entries)
  entriesRef.current = entries

  const popOne = useCallback(() => {
    if (entriesRef.current.length === 0) return false
    setEntries((e) => e.slice(0, -1))
    return true
  }, [])

  useEffect(() => {
    if (active) activePop = popOne
  }, [active, popOne])
  // タブを表に出したとき・画面を進めた／戻ったときに、スクロールを起こし直す
  useEffect(() => {
    if (active) requestAnimationFrame(wakeScroll)
  }, [active, entries.length])

  const push = useCallback((node: VNode) => {
    setEntries((e) => [...e, { id: ++seq, node }])
    try {
      history.pushState({ pc: seq }, '')
    } catch {
      /* 履歴に積めなくても画面は進める */
    }
  }, [])

  const back = useCallback(() => {
    if (entriesRef.current.length === 0) return
    // ブラウザの履歴も1つ戻す（popstate で popOne が呼ばれる）
    if (history.state && history.state.pc) history.back()
    else popOne()
  }, [popOne])

  const all = [{ id: 0, node: root }, ...entries]
  return (
    <>
      {all.map((e, i) => (
        <Layer key={e.id} ref0={i === 0 ? rootRef : undefined} depth={i} top={i === all.length - 1} visible={active && i === all.length - 1} push={push} back={back}>
          {e.node}
        </Layer>
      ))}
    </>
  )
}

function Layer(props: { ref0?: { current: HTMLDivElement | null }; depth: number; top: boolean; visible: boolean; push: NavApi['push']; back: NavApi['back']; children: ComponentChildren }) {
  const api = useMemo(() => ({ push: props.push, back: props.back, depth: props.depth }), [props.push, props.back, props.depth])
  return (
    <div class="layer" ref={props.ref0} style={{ display: props.top ? 'flex' : 'none' }}>
      <NavCtx.Provider value={api}>
        <VisibleCtx.Provider value={props.visible}>{props.children}</VisibleCtx.Provider>
      </NavCtx.Provider>
    </div>
  )
}

/** タブを切り替えたとき、ブラウザの戻るで別タブの画面が閉じないようにする */
export function resetHistoryMarker() {
  if (history.state && history.state.pc) {
    ignorePop++
    history.back()
  }
}
