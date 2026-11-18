import { useEffect, useState } from 'preact/hooks'
import { History } from 'lucide-preact'
import { Page, Sheet } from '../ui/components'
import { fmtTrim } from '../core/format'

/** 余り電卓の計算（四則と「割ってあまり」）。iOS・Android の RemainderCalc と同じ手順 */
export interface Calc {
  a: string
  op: string | null // "+", "−", "×", "÷", "mod"
  b: string
  done: boolean
}
const empty: Calc = { a: '', op: null, b: '', done: false }

interface Result {
  plain?: number
  quotient?: number
  remainder?: number
  decimal?: number
}

function calc(a: string, op: string | null, b: string): Result | null {
  if (a === '' || b === '' || op == null) return null
  const x = Number(a), y = Number(b)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  switch (op) {
    case '+':
      return { plain: x + y }
    case '−':
      return { plain: x - y }
    case '×':
      return { plain: x * y }
    case '÷':
      return { plain: y === 0 ? NaN : x / y }
    case 'mod': {
      if (y === 0) return { plain: NaN }
      const q = Math.floor(x / y + 1e-9)
      let r = x - q * y
      if (Math.abs(r) < 1e-9) r = 0
      return { quotient: q, remainder: r, decimal: x / y }
    }
  }
  return null
}

export function show(v: number) {
  if (!Number.isFinite(v)) return 'エラー'
  return fmtTrim(v, 3).replace(/,/g, '')
}

const result = (c: Calc) => (c.done ? calc(c.a, c.op, c.b) : null)
function carried(c: Calc): string | null {
  const r = calc(c.a, c.op, c.b)
  return r ? show(r.plain ?? r.quotient ?? 0) : null
}

export function press(c0: Calc, key: string): Calc {
  let c = { ...c0 }
  if (/^[0-9.]+$/.test(key)) {
    if (c.done) c = { ...empty }
    let v = c.op == null ? c.a : c.b
    if (key === '.' && v.includes('.')) return c0
    if (v === '0' && key !== '.') v = ''
    v = (v + key).slice(0, 9)
    if (c.op == null) c.a = v
    else c.b = v
  } else if (key === 'C') {
    c = { ...empty }
  } else if (key === '⌫') {
    if (c.done) c = { ...empty }
    else if (c.b !== '') c.b = c.b.slice(0, -1)
    else if (c.op != null) c.op = null
    else if (c.a !== '') c.a = c.a.slice(0, -1)
  } else if (key === '=') {
    if (c.op != null && c.b !== '') c.done = true
  } else {
    if (c.done) {
      c.a = carried(c) ?? c.a
      c.b = ''
      c.done = false
    }
    if (c.a === '') return c0
    if (c.op != null && c.b !== '') {
      c.a = carried(c) ?? c.a
      c.b = ''
    }
    c.op = key
  }
  return c
}

function divide(c: Calc, n: number): Calc {
  let x = c.a === '' ? '0' : c.a
  if (c.done || (c.op != null && c.b !== '')) x = carried(c) ?? x
  return { a: x, op: 'mod', b: String(n), done: true }
}

const opLabel = (c: Calc) => (c.op === 'mod' ? '÷余' : c.op ?? '')
function expression(c: Calc) {
  let s = c.a
  if (c.op != null) s += ` ${opLabel(c)} `
  s += c.b
  return c.done ? s + ' =' : s
}
function summary(c: Calc): string | null {
  const r = result(c)
  if (!r) return null
  if (r.quotient != null && r.remainder != null) return `${c.a} ÷ ${c.b} ＝ ${show(r.quotient)} あまり ${show(r.remainder)}`
  return `${c.a} ${opLabel(c)} ${c.b} ＝ ${show(r.plain ?? 0)}`
}

const labels: Record<string, string> = {
  C: 'クリア',
  '⌫': '1文字消す',
  '÷余': '割ってあまりを出す',
  '÷': '割る',
  '×': 'かける',
  '−': 'ひく',
  '+': 'たす',
  '.': '小数点',
  '=': 'イコール',
}

function tap() {
  try {
    navigator.vibrate?.(8)
  } catch {
    /* 振動できない端末 */
  }
}

export function RemainderPage() {
  const [c, setC] = useState<Calc>(empty)
  const [history, setHistory] = useState<Calc[]>([])
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    // 答えが出たら履歴に残す（最新が上、30件まで）
    if (c.done && summary(c) != null) {
      setHistory((h) => (h[0] && summary(h[0]) === summary(c) ? h : [c, ...h].slice(0, 30)))
    }
  }, [c])

  const r = result(c)
  const rows = [
    ['C', '⌫', '÷余', '÷'],
    ['7', '8', '9', '×'],
    ['4', '5', '6', '−'],
    ['1', '2', '3', '+'],
    ['0', '00', '.', '='],
  ]
  const plain = r ? show(r.plain ?? 0) : (c.op == null ? c.a : c.b) || '0'

  return (
    <Page
      title="余り電卓"
      bodyClass="rem-body"
      right={
        <button class="bar-btn" aria-label="履歴" disabled={history.length === 0} onClick={() => setShowHistory(true)}>
          <History size={22} />
        </button>
      }
    >
      <div class="rem">
        <div class="rem-display" aria-live="polite">
          <div class="rem-expr">{expression(c) || ' '}</div>
          {r && r.quotient != null && r.remainder != null ? (
            <>
              <div class="rem-main">
                <span class="rem-big">{show(r.quotient)}</span>
                <span class="rem-amari">あまり</span>
                <span class="rem-big orange">{show(r.remainder)}</span>
              </div>
              <div class="rem-chips">
                <span class="rem-chip accent">
                  {show(r.quotient)}シート ＋ バラ{show(r.remainder)}錠
                </span>
                <span class="rem-chip">小数 {show(r.decimal ?? 0)}</span>
              </div>
            </>
          ) : (
            <div class="rem-main">
              <span class="rem-big">{plain}</span>
            </div>
          )}
        </div>
        <div class="rem-sheet-label">シートの錠数で割る</div>
        <div class="rem-sheets">
          {[6, 10, 14, 21, 28].map((n) => {
            const on = c.done && c.op === 'mod' && c.b === String(n)
            return (
              <button
                class={'rem-sheet ' + (on ? 'on' : '')}
                aria-label={`${n}で割ってあまりを出す`}
                onClick={() => {
                  tap()
                  setC((x) => divide(x, n))
                }}
              >
                ÷{n}
              </button>
            )
          })}
        </div>
        <div class="rem-keys">
          {rows.flat().map((k) => {
            const isNum = /^[0-9.]+$/.test(k)
            const isOp = ['÷', '×', '−', '+'].includes(k)
            const opOn = isOp && c.op === k && !c.done
            const cls = k === '=' ? 'eq' : k === '÷余' ? 'mod' : opOn ? 'op on' : isOp ? 'op' : isNum ? 'num' : 'fn'
            return (
              <button
                class={'rem-key ' + cls}
                aria-label={labels[k] ?? k}
                onClick={() => {
                  tap()
                  setC((x) => press(x, k === '÷余' ? 'mod' : k))
                }}
              >
                {k}
              </button>
            )
          })}
        </div>
      </div>
      <Sheet
        open={showHistory}
        title="履歴（タップで呼び出し）"
        onClose={() => setShowHistory(false)}
        left={
          <button
            class="bar-btn"
            style={{ color: 'var(--red)' }}
            onClick={() => {
              setHistory([])
              setShowHistory(false)
            }}
          >
            消去
          </button>
        }
      >
        <div class="section-body" style={{ marginTop: '12px' }}>
          {history.map((h) => (
            <button
              class="row num"
              onClick={() => {
                setC(h)
                setShowHistory(false)
              }}
            >
              {summary(h)}
            </button>
          ))}
        </div>
      </Sheet>
    </Page>
  )
}
