import { useState } from 'preact/hooks'
import { DateRow, NumField, Page, QuickButtons, ResultRow, Section, Toggle, WarningRow } from '../ui/components'
import { JPDate } from '../core/jpdate'
import { fmt, fmtTrim, parseIntNum, parseNum } from '../core/format'

const dayPresets = [7, 14, 21, 28, 30, 35, 42, 56, 60, 84, 90]

export function EndDatePage() {
  const [start, setStart] = useState(JPDate.today())
  const [days, setDays] = useState('')
  const [fromNextDay, setFromNextDay] = useState(false)
  const n = parseIntNum(days)
  return (
    <Page title="服用終了日">
      <Section>
        <DateRow label="処方日（調剤日）" value={start} onChange={setStart} />
        <Toggle label="翌日から服用開始" value={fromNextDay} onChange={setFromNextDay} />
        <NumField title="処方日数" value={days} onChange={setDays} unit="日" integer />
        <QuickButtons values={dayPresets} onPick={setDays} suffix="日" />
      </Section>
      {n != null && n > 0 &&
        (() => {
          const first = JPDate.add(start, fromNextDay ? 1 : 0)
          const last = JPDate.add(first, n - 1)
          return (
            <Section header="結果">
              <ResultRow title="服用開始日" value={JPDate.text(first)} big={false} />
              <ResultRow title="最終服用日" value={JPDate.text(last)} big={false} />
              <ResultRow title="薬がなくなる日" value={JPDate.text(JPDate.add(last, 1))} note="この日までに次の受診が必要です" big={false} color="orange" />
              <ResultRow title="週換算" value={`${Math.floor(n / 7)}週＋${n % 7}日`} big={false} />
            </Section>
          )
        })()}
    </Page>
  )
}

export function NextVisitPage() {
  const [today, setToday] = useState(JPDate.today())
  const [visit, setVisit] = useState(JPDate.add(new Date(), 28))
  const [includeToday, setIncludeToday] = useState(true)
  const [includeVisitDay, setIncludeVisitDay] = useState(false)
  const [daily, setDaily] = useState('')
  const [remain, setRemain] = useState('')
  const base = JPDate.diff(today, visit)
  const need = base - (includeToday ? 0 : 1) + (includeVisitDay ? 1 : 0)
  const d = parseNum(daily), r = parseNum(remain)
  return (
    <Page title="次回受診まで">
      <Section footer="受診日の朝の分まで必要な場合は「受診日当日の分も含める」をオンにします">
        <DateRow label="今日" value={today} onChange={setToday} />
        <DateRow label="次回受診日" value={visit} onChange={setVisit} />
        <Toggle label="今日の分を含める" value={includeToday} onChange={setIncludeToday} />
        <Toggle label="受診日当日の分も含める" value={includeVisitDay} onChange={setIncludeVisitDay} />
      </Section>
      <Section header="数量（任意）">
        <NumField title="1日量" value={daily} onChange={setDaily} unit="錠" />
        <NumField title="残薬" value={remain} onChange={setRemain} unit="錠" />
      </Section>
      <Section header="結果">
        {base < 0 ? (
          <WarningRow>受診日が今日より前になっています</WarningRow>
        ) : (
          <>
            <ResultRow title="必要日数" value={String(Math.max(need, 0))} unit="日" note={`今日から受診日まで ${base}日`} />
            {d != null && d > 0 &&
              (() => {
                const total = Math.max(need, 0) * d
                return (
                  <>
                    <ResultRow title="必要数" value={fmtTrim(total)} unit="錠" />
                    {r != null && r > 0 &&
                      (() => {
                        const lack = Math.max(0, total - r)
                        return (
                          <>
                            <ResultRow title="残薬を引いた必要数" value={fmtTrim(lack)} unit="錠" />
                            <ResultRow title="処方日数にすると" value={String(Math.ceil(lack / d - 1e-9))} unit="日" note="端数は切り上げ" />
                          </>
                        )
                      })()}
                  </>
                )
              })()}
          </>
        )}
      </Section>
    </Page>
  )
}

export function ValidityPage() {
  const [issued, setIssued] = useState(JPDate.today())
  const end = JPDate.add(issued, 3)
  const n = JPDate.diff(new Date(), end)
  const remainText = n < 0 ? `期限切れ（${-n}日超過）` : n === 0 ? '今日まで' : `あと${n}日`
  return (
    <Page title="処方箋の有効期限">
      <Section>
        <DateRow label="交付日" value={issued} onChange={setIssued} />
      </Section>
      <Section>
        <ResultRow title="有効期限" value={JPDate.text(end)} big={false} color="orange" />
        <ResultRow title="今日から" value={remainText} big={false} />
      </Section>
      <Section
        header="有効な4日間"
        footer="処方箋の使用期間は交付日を含めて4日以内です（休日も含む）。長期の旅行などの特殊な事情で、医師が処方箋に別の期限を記載した場合はその日まで有効です。祝日は表示に反映していません。"
      >
        {[0, 1, 2, 3].map((i) => {
          const d = JPDate.add(issued, i)
          return (
            <div class="row labeled">
              <span>{i + 1}日目</span>
              <span style={{ color: JPDate.isWeekend(d) ? 'var(--red)' : 'var(--text)' }}>{JPDate.text(d)}</span>
            </div>
          )
        })}
      </Section>
    </Page>
  )
}

export function CyclePage() {
  const [start, setStart] = useState(JPDate.today())
  const [onDays, setOnDays] = useState('21')
  const [offDays, setOffDays] = useState('7')
  const [cycles, setCycles] = useState('3')
  const on = parseIntNum(onDays), off = parseIntNum(offDays), c = parseIntNum(cycles)
  const ok = on != null && off != null && c != null && on > 0 && c > 0 && c <= 50
  return (
    <Page title="休薬期間のある処方">
      <Section footer="例：3週投与1週休薬 → 投与21日・休薬7日、2週投与1週休薬 → 14日・7日">
        <DateRow label="開始日" value={start} onChange={setStart} />
        <NumField title="投与日数" value={onDays} onChange={setOnDays} unit="日" integer />
        <NumField title="休薬日数" value={offDays} onChange={setOffDays} unit="日" integer />
        <NumField title="クール数" value={cycles} onChange={setCycles} unit="クール" integer />
      </Section>
      {ok && (
        <>
          <Section header="合計">
            <ResultRow title="投与日数の合計" value={String(on * c)} unit="日" />
            <ResultRow title="全期間" value={String((on + off) * c)} unit="日" note="最後のクールの休薬期間まで含む" />
          </Section>
          {Array.from({ length: c }, (_, i) => {
            const s = JPDate.add(start, i * (on + off))
            const e = JPDate.add(s, on - 1)
            return (
              <Section header={`${i + 1}クール目`}>
                <div class="row labeled">
                  <span style={{ color: 'var(--accent)' }}>投与</span>
                  <span class="num">
                    {JPDate.short(s)} 〜 {JPDate.short(e)}
                  </span>
                </div>
                {off > 0 && (
                  <div class="row labeled">
                    <span class="sub">休薬</span>
                    <span class="num">
                      {JPDate.short(JPDate.add(e, 1))} 〜 {JPDate.short(JPDate.add(e, off))}
                    </span>
                  </div>
                )}
              </Section>
            )
          })}
        </>
      )}
    </Page>
  )
}

export function AgePage() {
  const now = JPDate.today()
  const [birth, setBirth] = useState(new Date(now.getFullYear() - 5, now.getMonth(), now.getDate()))
  const [base, setBase] = useState(now)
  const { y, m, d } = JPDate.ymd(birth, base)
  const days = JPDate.diff(birth, base)
  return (
    <Page title="年齢・月齢">
      <Section>
        <DateRow label="生年月日" value={birth} onChange={setBirth} max={now} />
        <DateRow label="基準日" value={base} onChange={setBase} />
      </Section>
      {days >= 0 && y >= 0 ? (
        <Section header="結果">
          <ResultRow title="年齢" value={`${y}歳${m}か月${d}日`} big={false} />
          <ResultRow title="月齢" value={String(y * 12 + m)} unit="か月" />
          <ResultRow title="日齢" value={String(days)} unit="日" />
          <ResultRow title="小数の年齢" value={fmt(days / 365.25, 2)} unit="歳" note="小児薬用量の計算に使えます" />
        </Section>
      ) : (
        <Section>
          <WarningRow>基準日が生年月日より前です</WarningRow>
        </Section>
      )}
    </Page>
  )
}
