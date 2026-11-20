import { persistedStore } from '../core/store'

/** GS1バーコード（PTPシートのGS1データバー、元箱のGS1-128など）を解析した結果 */
export interface GS1Result {
  raw: string
  gtin?: string
  /** 有効期限（表示用） */
  expiry?: string
  lot?: string
  serial?: string
  quantity?: string
}

const GS = '\u001d'
/** 固定長のAI（アプリケーション識別子）と値の桁数 */
const fixed: Record<string, number> = { '00': 18, '01': 14, '02': 14, '11': 6, '12': 6, '13': 6, '15': 6, '16': 6, '17': 6, '20': 2 }
/** 可変長のAI（GS区切りまたは末尾まで） */
const variable = new Set(['10', '21', '22', '30', '37'])

export function parseGS1(input: string): GS1Result {
  const r: GS1Result = { raw: input }
  let s = input.trim()
  // シンボル識別子を外す
  for (const p of [']e0', ']E0', ']C1', ']d2', ']Q3']) if (s.startsWith(p)) s = s.slice(p.length)

  // JAN（EAN-13）・GTIN-14 などの数字だけのコード
  if (/^\d+$/.test(s) && [8, 12, 13, 14].includes(s.length)) {
    const g = s.padStart(14, '0')
    if (checkDigitOK(g)) {
      r.gtin = g
      return r
    }
  }

  // 「(01)0498…(17)…」のような括弧つき表記
  if (s.startsWith('(')) s = s.slice(1).replace(/\)/g, '').replace(/\(/g, GS)

  let i = 0
  while (i < s.length) {
    if (s[i] === GS) {
      i++
      continue
    }
    if (i + 2 > s.length) break
    const ai = s.slice(i, i + 2)
    const aiEnd = i + 2
    if (fixed[ai] != null) {
      const vEnd = aiEnd + fixed[ai]
      if (vEnd > s.length) break
      assign(ai, s.slice(aiEnd, vEnd), r)
      i = vEnd
    } else if (variable.has(ai)) {
      let vEnd = s.indexOf(GS, aiEnd)
      if (vEnd < 0) vEnd = s.length
      assign(ai, s.slice(aiEnd, vEnd), r)
      i = vEnd
    } else break
  }
  return r
}

function assign(ai: string, v: string, r: GS1Result) {
  switch (ai) {
    case '01':
    case '02':
      r.gtin ??= v
      break
    case '17':
      r.expiry = dateText(v)
      break
    case '10':
      r.lot = v
      break
    case '21':
      r.serial = v
      break
    case '30':
    case '37':
      r.quantity = v
      break
  }
}

/** YYMMDD → 2028年3月31日（DDが00なら月末） */
export function dateText(v: string) {
  const m = /^(\d\d)(\d\d)(\d\d)$/.exec(v)
  if (!m) return v
  const yy = Number(m[1]), mm = Number(m[2]), dd = Number(m[3])
  if (mm < 1 || mm > 12) return v
  const year = 2000 + yy
  return dd === 0 ? `${year}年${mm}月（月末）` : `${year}年${mm}月${dd}日`
}

/** GS1のチェックデジット（モジュラス10） */
export function checkDigitOK(g: string) {
  if (!/^\d{8,}$/.test(g)) return false
  const d = g.split('').map(Number)
  const last = d.pop()!
  let sum = 0
  d.reverse().forEach((v, k) => (sum += v * (k % 2 === 0 ? 3 : 1)))
  return (10 - (sum % 10)) % 10 === last
}

export const PMDA = {
  /** GTINからPMDAの電子添文ページを開くURL（添文ナビと同じ形式） */
  url: (gtin: string) => `https://www.pmda.go.jp/PmdaSearch/bookSearch/01/${gtin}`,
  /** 医療用医薬品の添付文書等情報検索（名前で探すとき） */
  searchURL: 'https://www.pmda.go.jp/PmdaSearch/iyakuSearch/',
}

export interface ScanRecord {
  id: string
  /** 読み取った日時（ミリ秒） */
  date: number
  gtin: string
  expiry?: string
  lot?: string
  raw: string
  memo: string
}

/** 読み取り履歴（このブラウザに保存） */
export const scanHistory = persistedStore<ScanRecord[]>('scanHistory', [])

/** 追加。同じGTINがあれば薬品名メモを引き継いで先頭に移す */
export function addScan(r: GS1Result) {
  if (!r.gtin) return
  const gtin = r.gtin
  scanHistory.set((items) => {
    const old = items.find((x) => x.gtin === gtin)
    const rec: ScanRecord = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, date: Date.now(), gtin, expiry: r.expiry, lot: r.lot, raw: r.raw, memo: old?.memo ?? '' }
    return [rec, ...items.filter((x) => x.gtin !== gtin)].slice(0, 300)
  })
}

/** 薬品名が空の履歴に、自動で調べた薬品名を入れる（自分で入れた名前は変えない） */
export function setAutoName(gtin: string, name: string) {
  scanHistory.set((items) => items.map((x) => (x.gtin === gtin && !x.memo ? { ...x, memo: name } : x)))
}

export const memoFor = (items: ScanRecord[], gtin: string) => items.find((x) => x.gtin === gtin)?.memo ?? ''
