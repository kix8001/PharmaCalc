import { useEffect, useReducer } from 'preact/hooks'

export interface Store<T> {
  get(): T
  set(v: T | ((prev: T) => T)): void
  sub(f: () => void): () => void
}

export function createStore<T>(init: T, onChange?: (v: T) => void): Store<T> {
  let v = init
  const subs = new Set<() => void>()
  return {
    get: () => v,
    set(n) {
      v = typeof n === 'function' ? (n as (p: T) => T)(v) : n
      onChange?.(v)
      subs.forEach((f) => f())
    },
    sub(f) {
      subs.add(f)
      return () => subs.delete(f)
    },
  }
}

export function useStore<T>(s: Store<T>): T {
  const [, force] = useReducer((x: number) => x + 1, 0)
  useEffect(() => s.sub(() => force(0)), [s])
  return s.get()
}

/** 端末（このブラウザ）に保存する値。読めない・書けないときは保存しないだけで動き続ける */
export function loadLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw == null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function saveLocal(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {
    /* 保存できない（プライベートブラウズなど） */
  }
}

export function persistedStore<T>(key: string, fallback: T): Store<T> {
  return createStore<T>(loadLocal(key, fallback), (v) => saveLocal(key, v))
}
