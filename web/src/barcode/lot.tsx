// ロット番号から使用期限を調べる（手元に PTP シートしかないとき）。data/lot.json（tools/make_lot.py で作る）
// ロットと期限の対応は公開されていないので、メーカーの使用期限検索のページ → 問い合わせ先の電話 → メールの順に案内する
import { useEffect, useState } from 'preact/hooks'
import { ExternalLink, Mail, Phone } from 'lucide-preact'
import { copyText, openExternal } from '../ui/components'

interface Company {
  /** 製造販売元 */
  n: string
  /** 問い合わせ先（部署） */
  d?: string
  /** 電話番号 */
  t?: string[]
  /** メールアドレス */
  m?: string
  /** 使用期限検索のページ */
  u?: string
}
interface LotData {
  companies: Company[]
  yj: Record<string, number>
}

let pr: Promise<LotData> | null = null
function loadLot(): Promise<LotData> {
  pr ??= import('../../../data/lot.json').then((m) => (m.default ?? m) as unknown as LotData).catch(() => ({ companies: [], yj: {} }))
  return pr
}

export function LotLookup({ yj, name }: { yj: string[]; name: string }) {
  const [c, setC] = useState<Company | null>(null)
  const [lot, setLot] = useState('')
  const [msg, setMsg] = useState('')
  useEffect(() => {
    loadLot().then((d) => {
      const i = yj.map((y) => d.yj[y]).find((x) => x !== undefined)
      setC(i !== undefined ? d.companies[i] : null)
    })
  }, [yj.join()])
  if (!c) return null
  const L = lot.trim().toUpperCase()

  const openSite = async () => {
    if (L) {
      await copyText(L)
      setMsg(`ロット番号「${L}」をコピーしました。開いたページの入力欄に貼り付けて検索してください。`)
    }
    openExternal(c.u!)
  }
  const mailto = () =>
    `mailto:${c.m}?subject=${encodeURIComponent('使用期限の問い合わせ')}&body=${encodeURIComponent(`製品名：${name}\nロット番号：${L || '（記入してください）'}\n\nこのロットの使用期限を教えてください。`)}`

  return (
    <div class="lot">
      <div class="lot-title">ロット番号から使用期限を調べる</div>
      <div class="lot-input">
        <input
          class="text-input"
          placeholder="PTP シートのロット番号"
          autocapitalize="characters"
          autocomplete="off"
          value={lot}
          onInput={(e) => setLot((e.target as HTMLInputElement).value)}
        />
      </div>
      {c.u ? (
        <>
          <button class="primary-btn" onClick={openSite}>
            <ExternalLink size={20} /> 使用期限検索を開く
          </button>
          <div class="small sub lot-note">
            {c.n} のページ。ロット番号を入れてから押すと、番号をコピーしてから開きます。
          </div>
        </>
      ) : c.t?.length ? (
        <div class="lot-contact">
          <div class="small sub">このメーカーには使用期限を調べるページがありません。問い合わせ先に、製品名とロット番号を伝えてください。</div>
          <div class="lot-desk">{c.d || c.n}</div>
          {c.t.map((t) => (
            <a class="primary-btn lot-tel" href={`tel:${t.replace(/-/g, '')}`}>
              <Phone size={20} /> {t}
            </a>
          ))}
        </div>
      ) : c.m ? (
        <div class="lot-contact">
          <div class="small sub">使用期限を調べるページと電話番号が見つかりません。問い合わせ先のメールに、製品名とロット番号を書いて送ってください。</div>
          <div class="lot-desk">{c.d || c.n}</div>
          <a class="primary-btn lot-tel" href={mailto()}>
            <Mail size={20} /> {c.m}
          </a>
        </div>
      ) : (
        <div class="small sub">{c.d || c.n}：問い合わせ先が添付文書に見つかりませんでした。添付文書の「文献請求先及び問い合わせ先」を見てください。</div>
      )}
      {msg && <div class="small lot-msg">{msg}</div>}
    </div>
  )
}
