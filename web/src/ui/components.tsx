import type { ComponentChildren, JSX } from 'preact'
import { useRef, useState } from 'preact/hooks'
import { ChevronLeft, ChevronRight, CircleCheck, SquarePen, TriangleAlert, X } from 'lucide-preact'
import { useNav } from './nav'
import { fmtTrim } from '../core/format'
import { JPDate } from '../core/jpdate'

/** 1画面（上のバー＋スクロールする中身） */
export function Page(props: { title: string; right?: ComponentChildren; children: ComponentChildren; large?: boolean; bodyClass?: string }) {
  const nav = useNav()
  return (
    <div class="page">
      <header class="bar">
        <div class="bar-side">
          {nav.depth > 0 && (
            <button class="bar-btn" onClick={() => nav.back()} aria-label="戻る">
              <ChevronLeft size={26} />
              <span>戻る</span>
            </button>
          )}
        </div>
        <h1 class="bar-title">{props.title}</h1>
        <div class="bar-side right">{props.right}</div>
      </header>
      <div class={'page-body ' + (props.bodyClass ?? '')} onKeyDown={nextOnEnter}>
        {props.children}
      </div>
    </div>
  )
}

/** Enter（キーボードの「次へ」）で次の入力欄に移る。最後の欄ならキーボードを閉じる */
function nextOnEnter(e: KeyboardEvent) {
  const t = e.target as HTMLElement
  if (e.key !== 'Enter' || !(t instanceof HTMLInputElement) || t.dataset.noNext != null) return
  e.preventDefault()
  const page = t.closest('.page-body')
  if (!page) return
  const fields = Array.from(page.querySelectorAll<HTMLInputElement>('input[data-field]'))
  const i = fields.indexOf(t)
  const next = fields[i + 1]
  if (next) next.focus()
  else t.blur()
}

export function Section(props: { header?: ComponentChildren; footer?: ComponentChildren; children?: ComponentChildren; plain?: boolean }) {
  return (
    <section class="section">
      {props.header && <div class="section-header">{props.header}</div>}
      {props.children && <div class={props.plain ? 'section-plain' : 'section-body'}>{props.children}</div>}
      {props.footer && <div class="section-footer">{props.footer}</div>}
    </section>
  )
}

export function Row(props: { children: ComponentChildren; class?: string; onClick?: () => void }) {
  return (
    <div class={'row ' + (props.class ?? '')} onClick={props.onClick}>
      {props.children}
    </div>
  )
}

/** 数値の入力欄。行のどこを押しても入力でき、入力があれば×で消せる */
export function NumField(props: {
  title: string
  value: string
  onChange: (v: string) => void
  unit?: string
  integer?: boolean
  placeholder?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div class="row numfield" onClick={() => ref.current?.focus()}>
      <span class="numfield-title">{props.title}</span>
      <span class="numfield-box">
        {props.value !== '' && (
          <button
            class="clear"
            aria-label={`${props.title}を消す`}
            onClick={(e) => {
              e.stopPropagation()
              props.onChange('')
              ref.current?.focus()
            }}
          >
            <X size={14} strokeWidth={3} />
          </button>
        )}
        <input
          ref={ref}
          data-field
          type="text"
          inputMode={props.integer ? 'numeric' : 'decimal'}
          enterKeyHint="next"
          autoComplete="off"
          placeholder={props.placeholder ?? '—'}
          value={props.value}
          onInput={(e) => props.onChange((e.target as HTMLInputElement).value)}
        />
      </span>
      {props.unit ? <span class="numfield-unit">{props.unit}</span> : null}
    </div>
  )
}

/** 文字の入力欄（1行） */
export function TextField(props: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string; inputMode?: JSX.HTMLAttributes['inputMode'] }) {
  return (
    <div class="row">
      <input
        class="text-input"
        type={props.type ?? 'text'}
        data-field
        data-no-next
        inputMode={props.inputMode}
        placeholder={props.placeholder}
        value={props.value}
        onInput={(e) => props.onChange((e.target as HTMLInputElement).value)}
      />
    </div>
  )
}

export function Toggle(props: { label: ComponentChildren; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label class="row toggle-row">
      <span>{props.label}</span>
      <input type="checkbox" role="switch" class="switch" checked={props.value} onChange={(e) => props.onChange((e.target as HTMLInputElement).checked)} />
    </label>
  )
}

export function Segmented<T extends string | number | boolean>(props: { options: [T, string][]; value: T; onChange: (v: T) => void; label?: string }) {
  return (
    <div class="row">
      <div class="segmented" role="radiogroup" aria-label={props.label}>
        {props.options.map(([v, l]) => (
          <button role="radio" aria-checked={v === props.value} class={v === props.value ? 'on' : ''} onClick={() => props.onChange(v)}>
            {l}
          </button>
        ))}
      </div>
    </div>
  )
}

export function SelectRow<T extends string | number>(props: { label: string; options: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <label class="row select-row">
      <span>{props.label}</span>
      <select
        value={String(props.value)}
        onChange={(e) => {
          const s = (e.target as HTMLSelectElement).value
          const found = props.options.find(([v]) => String(v) === s)
          if (found) props.onChange(found[0])
        }}
      >
        {props.options.map(([v, l]) => (
          <option value={String(v)}>{l}</option>
        ))}
      </select>
    </label>
  )
}

export function DateRow(props: { label: string; value: Date; onChange: (d: Date) => void; max?: Date }) {
  return (
    <label class="row select-row">
      <span>{props.label}</span>
      <input
        type="date"
        class="date-input"
        value={JPDate.toInput(props.value)}
        max={props.max ? JPDate.toInput(props.max) : undefined}
        onChange={(e) => {
          const d = JPDate.fromInput((e.target as HTMLInputElement).value)
          if (d) props.onChange(d)
        }}
      />
    </label>
  )
}

let toastTimer = 0
export function toast(text: string) {
  let el = document.getElementById('toast')
  if (!el) {
    el = document.createElement('div')
    el.id = 'toast'
    el.setAttribute('role', 'status')
    document.body.appendChild(el)
  }
  el.textContent = text
  el.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => el?.classList.remove('show'), 1600)
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast('コピーしました')
  } catch {
    toast('コピーできませんでした')
  }
}

/** 計算結果の1行。長押し（右クリック）でコピーできる */
export function ResultRow(props: { title: ComponentChildren; value: string; unit?: string; note?: ComponentChildren; big?: boolean; color?: 'orange' | 'accent' | 'red' }) {
  const big = props.big ?? true
  const timer = useRef(0)
  const copy = () => copyText(`${typeof props.title === 'string' ? props.title : ''}：${props.value}${props.unit ?? ''}`)
  return (
    <div
      class="row result"
      onContextMenu={(e) => {
        e.preventDefault()
        copy()
      }}
      onTouchStart={() => {
        timer.current = window.setTimeout(copy, 600)
      }}
      onTouchEnd={() => clearTimeout(timer.current)}
      onTouchMove={() => clearTimeout(timer.current)}
    >
      <div class="result-line">
        <span class="result-title">{props.title}</span>
        <span class={`result-value ${big ? 'big' : ''} ${props.color ?? 'accent'}`}>{props.value}</span>
        {props.unit ? <span class="result-unit">{props.unit}</span> : null}
      </div>
      {props.note ? <div class="note">{props.note}</div> : null}
    </div>
  )
}

export function MissingRow({ children }: { children: ComponentChildren }) {
  return (
    <div class="row missing">
      <SquarePen size={18} />
      <span>{children}</span>
    </div>
  )
}

export function WarningRow({ children }: { children: ComponentChildren }) {
  return (
    <div class="row warning">
      <TriangleAlert size={18} />
      <span>{children}</span>
    </div>
  )
}

export function OkRow({ children }: { children: ComponentChildren }) {
  return (
    <div class="row ok">
      <CircleCheck size={18} />
      <span>{children}</span>
    </div>
  )
}

/** よく使う値をワンタップで入れるボタン列 */
export function QuickButtons(props: { values: number[]; onPick: (s: string) => void; suffix?: string }) {
  return (
    <div class="row quick">
      {props.values.map((v) => (
        <button class="chip" onClick={() => props.onPick(fmtTrim(v).replace(/,/g, ''))}>
          {fmtTrim(v)}
          {props.suffix ?? ''}
        </button>
      ))}
    </div>
  )
}

/** 押すと次の画面へ進む行 */
export function LinkRow(props: { icon?: ComponentChildren; children: ComponentChildren; onClick: () => void; chevron?: boolean; class?: string }) {
  return (
    <button class={'row link-row ' + (props.class ?? '')} onClick={props.onClick}>
      {props.icon && <span class="link-icon">{props.icon}</span>}
      <span class="link-label">{props.children}</span>
      {props.chevron !== false && <ChevronRight size={18} class="chev" />}
    </button>
  )
}

export function ButtonRow(props: { children: ComponentChildren; onClick: () => void; danger?: boolean; disabled?: boolean; icon?: ComponentChildren }) {
  return (
    <button class={'row button-row ' + (props.danger ? 'danger' : '')} onClick={props.onClick} disabled={props.disabled}>
      {props.icon}
      <span>{props.children}</span>
    </button>
  )
}

export function LabeledRow(props: { label: string; value: ComponentChildren }) {
  return (
    <div class="row labeled">
      <span>{props.label}</span>
      <span class="labeled-value">{props.value}</span>
    </div>
  )
}

/** 下から出る小窓 */
export function Sheet(props: { open: boolean; title: string; onClose: () => void; children: ComponentChildren; left?: ComponentChildren }) {
  if (!props.open) return null
  return (
    <div class="sheet-backdrop" onClick={props.onClose}>
      <div class="sheet" role="dialog" aria-label={props.title} onClick={(e) => e.stopPropagation()}>
        <header class="bar">
          <div class="bar-side">{props.left}</div>
          <h2 class="bar-title">{props.title}</h2>
          <div class="bar-side right">
            <button class="bar-btn strong" onClick={props.onClose}>
              閉じる
            </button>
          </div>
        </header>
        <div class="sheet-body">{props.children}</div>
      </div>
    </div>
  )
}

/** 外部のページ（PMDA など）を開く。ホーム画面から起動したときもブラウザで開く */
export function openExternal(url: string): boolean {
  const w = window.open(url, '_blank')
  if (!w) return false
  try {
    w.opener = null
  } catch {
    /* 別のサイトなので触れなくてもよい */
  }
  return true
}

export function useForceUpdate() {
  const [, set] = useState(0)
  return () => set((x) => x + 1)
}
