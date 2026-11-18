const W = ['日', '月', '火', '水', '木', '金', '土']

/** その日の0時（端末の時刻で） */
export function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export const JPDate = {
  today: () => startOfDay(new Date()),
  add(d: Date, n: number) {
    const s = startOfDay(d)
    return new Date(s.getFullYear(), s.getMonth(), s.getDate() + n)
  },
  /** a から b までの日数（同じ日なら0） */
  diff(a: Date, b: Date) {
    const x = startOfDay(a), y = startOfDay(b)
    return Math.round((Date.UTC(y.getFullYear(), y.getMonth(), y.getDate()) - Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())) / 86400000)
  },
  text: (d: Date) => `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${W[d.getDay()]})`,
  short: (d: Date) => `${d.getMonth() + 1}/${d.getDate()}(${W[d.getDay()]})`,
  isWeekend: (d: Date) => d.getDay() === 0 || d.getDay() === 6,
  /** <input type="date"> の値 */
  toInput: (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  fromInput(s: string): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
  },
  /** 年・月・日の差（暦どおり） */
  ymd(from: Date, to: Date) {
    const a = startOfDay(from), b = startOfDay(to)
    let y = b.getFullYear() - a.getFullYear()
    let m = b.getMonth() - a.getMonth()
    let d = b.getDate() - a.getDate()
    if (d < 0) {
      m -= 1
      d += new Date(b.getFullYear(), b.getMonth(), 0).getDate()
    }
    if (m < 0) {
      y -= 1
      m += 12
    }
    return { y, m, d }
  },
}
