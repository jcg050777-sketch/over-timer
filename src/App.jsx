import { useState, useMemo, useEffect } from 'react'
import Calendar from 'react-calendar'
import { Settings } from 'lucide-react'
import { format, getMonth, getYear, startOfMonth } from 'date-fns'

const STORAGE_KEY = 'overtimer-saved'
const DEFAULTS_STORAGE_KEY = 'overtimer-defaults'

/** 해당 날짜가 토·일 또는 한국 공휴일이면 true */
function isWeekendOrHoliday(date) {
  const d = new Date(date)
  const day = d.getDay()
  if (day === 0 || day === 6) return true // 일요일, 토요일

  const y = d.getFullYear()
  const key = format(d, 'yyyy-MM-dd')

  const solar = [
    `${y}-01-01`, // 신정
    `${y}-03-01`, // 삼일절
    `${y}-05-05`, // 어린이날
    `${y}-06-06`, // 현충일
    `${y}-08-15`, // 광복절
    `${y}-10-03`, // 개천절
    `${y}-10-09`, // 한글날
    `${y}-12-25`, // 성탄절
  ]

  const lunarByYear = {
    2024: ['2024-02-09', '2024-02-10', '2024-02-11', '2024-02-12', '2024-05-15', '2024-09-16', '2024-09-17', '2024-09-18'],
    2025: ['2025-01-28', '2025-01-29', '2025-01-30', '2025-05-05', '2025-10-05', '2025-10-06', '2025-10-07'],
    2026: ['2026-02-16', '2026-02-17', '2026-02-18', '2026-05-24', '2026-09-24', '2026-09-25', '2026-09-26'],
    2027: ['2027-02-06', '2027-02-07', '2027-02-08', '2027-05-12', '2027-09-14', '2027-09-15', '2027-09-16'],
    2028: ['2028-01-26', '2028-01-27', '2028-01-28', '2028-05-02', '2028-10-02', '2028-10-03', '2028-10-04'],
    2029: ['2029-02-12', '2029-02-13', '2029-02-14', '2029-05-21', '2029-09-21', '2029-09-22', '2029-09-23'],
    2030: ['2030-02-02', '2030-02-03', '2030-02-04', '2030-05-10', '2030-10-11', '2030-10-12', '2030-10-13'],
  }

  if (solar.includes(key)) return true
  const lunar = lunarByYear[y]
  if (lunar && lunar.includes(key)) return true
  return false
}

/** "HH:mm" → 자정 기준 분 */
function timeToMinutes(timeStr) {
  if (!timeStr) return 0
  const [h, m] = timeStr.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** 분 → "HH:mm" */
function minutesToTimeStr(totalMinutes) {
  const h = Math.floor(totalMinutes / 60) % 24
  const m = totalMinutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** 분 → "N시간 NN분" */
function minutesToDuration(minutes) {
  if (minutes <= 0) return '0시간 00분'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}시간 ${String(m).padStart(2, '0')}분`
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

function loadDefaultsFromStorage() {
  try {
    const raw = localStorage.getItem(DEFAULTS_STORAGE_KEY)
    if (!raw) return { defaultStart: '09:00', defaultEnd: '18:00', deductionHours: 0 }
    const parsed = JSON.parse(raw)
    return {
      defaultStart: parsed.defaultStart ?? '09:00',
      defaultEnd: parsed.defaultEnd ?? '18:00',
      deductionHours: Number(parsed.deductionHours) || 0,
    }
  } catch {
    return { defaultStart: '09:00', defaultEnd: '18:00', deductionHours: 0 }
  }
}

/** "HH:mm" 24h → { hour 1-12, minute 0-59, ampm } */
function time24To12(timeStr) {
  const [h24, m] = (timeStr || '00:00').split(':').map(Number)
  const h = h24 % 12
  return {
    hour12: h === 0 ? 12 : h,
    minute: Math.min(59, Math.max(0, m ?? 0)),
    ampm: (h24 ?? 0) < 12 ? 'AM' : 'PM',
  }
}

/** { hour 1-12, minute, ampm } → "HH:mm" 24h */
function time12To24(hour12, minute, ampm) {
  let h24 = hour12
  if (ampm === 'AM') {
    h24 = hour12 === 12 ? 0 : hour12
  } else {
    h24 = hour12 === 12 ? 12 : hour12 + 12
  }
  return `${String(h24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/** 시각 선택: 시(1~12), 분(00~59), AM/PM 개별 Select → 내부 24h HH:mm 유지 */
function TimeSelect({ value, onChange, disabled }) {
  const { hour12, minute, ampm } = time24To12(value)

  const handleHour = (e) => {
    const h = Number(e.target.value)
    onChange(time12To24(h, minute, ampm))
  }
  const handleMinute = (e) => {
    const m = Number(e.target.value)
    onChange(time12To24(hour12, m, ampm))
  }
  const handleAmPm = (e) => {
    const a = e.target.value
    onChange(time12To24(hour12, minute, a))
  }

  const selectClass =
    'min-h-[48px] px-3 py-2.5 text-base rounded-xl border-2 border-neutral-300 bg-white text-neutral-800 font-medium disabled:opacity-50 disabled:bg-neutral-100 cursor-pointer'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={hour12}
        onChange={handleHour}
        disabled={disabled}
        className={`${selectClass} min-w-[4rem]`}
        aria-label="시"
      >
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((h) => (
          <option key={h} value={h}>
            {h}시
          </option>
        ))}
      </select>
      <select
        value={minute}
        onChange={handleMinute}
        disabled={disabled}
        className={`${selectClass} min-w-[4.5rem]`}
        aria-label="분"
      >
        {Array.from({ length: 60 }, (_, i) => i).map((m) => (
          <option key={m} value={m}>
            {String(m).padStart(2, '0')}분
          </option>
        ))}
      </select>
      <select
        value={ampm}
        onChange={handleAmPm}
        disabled={disabled}
        className={`${selectClass} min-w-[5rem]`}
        aria-label="AM/PM"
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  )
}

/** 공제 시간 스테퍼: 1시간 단위 +/- */
function DeductionStepper({ value, onChange, disabled }) {
  const step = 1
  const num = Number(value) || 0

  const handleStep = (delta) => {
    const next = Math.max(0, num + delta)
    onChange(next)
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => handleStep(-step)}
        disabled={disabled || num <= 0}
        className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border-2 border-neutral-300 bg-white text-neutral-600 text-xl font-medium disabled:opacity-40 disabled:cursor-not-allowed active:bg-neutral-100"
      >
        −
      </button>
      <span className="min-w-[4rem] text-center text-lg font-semibold text-neutral-800 tabular-nums">
        {num}시간
      </span>
      <button
        type="button"
        onClick={() => handleStep(step)}
        disabled={disabled}
        className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border-2 border-neutral-300 bg-white text-neutral-600 text-xl font-medium disabled:opacity-40 disabled:cursor-not-allowed active:bg-neutral-100"
      >
        +
      </button>
    </div>
  )
}

function App() {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()))
  const [modalOpen, setModalOpen] = useState(false)
  const [savedByDate, setSavedByDate] = useState(() => loadFromStorage())
  const [defaults, setDefaults] = useState(() => loadDefaultsFromStorage())
  const [showSettings, setShowSettings] = useState(false)
  const [settingsForm, setSettingsForm] = useState(() => loadDefaultsFromStorage())

  const [skipRecord, setSkipRecord] = useState(false)
  const [preWorkOvertime, setPreWorkOvertime] = useState(false)
  const [overtimeStart, setOvertimeStart] = useState('09:00')
  const [defaultStart, setDefaultStart] = useState('09:00')
  const [defaultEnd, setDefaultEnd] = useState('18:00')
  const [postWorkOvertime, setPostWorkOvertime] = useState(false)
  const [overtimeEnd, setOvertimeEnd] = useState('18:00')
  const [deductionHours, setDeductionHours] = useState(0)
  const [timeValidationError, setTimeValidationError] = useState('')
  const [workMode, setWorkMode] = useState('weekday') // 'weekday' | 'weekend'

  const dateKey = useMemo(
    () => format(selectedDate, 'yyyy-MM-dd'),
    [selectedDate]
  )

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedByDate))
    } catch (e) {
      console.warn('localStorage save failed', e)
    }
  }, [savedByDate])

  const openModal = (date) => {
    setSelectedDate(date)
    const key = format(date, 'yyyy-MM-dd')
    const saved = savedByDate[key]
    if (saved) {
      setSkipRecord(!!saved.skipRecord)
      setWorkMode(saved.workMode ?? 'weekday')
      setPreWorkOvertime(saved.preWorkOvertime ?? false)
      setOvertimeStart(saved.overtimeStart ?? '09:00')
      setDefaultStart(saved.defaultStart ?? '09:00')
      setDefaultEnd(saved.defaultEnd ?? '18:00')
      setPostWorkOvertime(saved.postWorkOvertime ?? false)
      setOvertimeEnd(saved.overtimeEnd ?? '18:00')
      setDeductionHours(
        saved.deductionHours ??
          (saved.deductionMinutes != null ? saved.deductionMinutes / 60 : 0)
      )
    } else {
      const isWeekend = isWeekendOrHoliday(date)
      setWorkMode(isWeekend ? 'weekend' : 'weekday')
      if (isWeekend) {
        setSkipRecord(true)
        setPreWorkOvertime(false)
        setOvertimeStart(defaults.defaultStart)
        setDefaultStart(defaults.defaultStart)
        setDefaultEnd(defaults.defaultEnd)
        setPostWorkOvertime(false)
        setOvertimeEnd(defaults.defaultEnd)
        setDeductionHours(defaults.deductionHours)
      } else {
        const defStartMin = timeToMinutes(defaults.defaultStart)
        const defEndMin = timeToMinutes(defaults.defaultEnd)
        const dayMinutes = 24 * 60
        setSkipRecord(false)
        setPreWorkOvertime(false)
        setOvertimeStart(minutesToTimeStr((defStartMin - 60 + dayMinutes) % dayMinutes))
        setDefaultStart(defaults.defaultStart)
        setDefaultEnd(defaults.defaultEnd)
        setPostWorkOvertime(false)
        setOvertimeEnd(minutesToTimeStr((defEndMin + 60) % dayMinutes))
        setDeductionHours(defaults.deductionHours)
      }
    }
    setTimeValidationError('')
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setTimeValidationError('')
  }

  /** 시간 유효성: 주중만 검사. 시간외 출근 < 기본 출근, 시간외 퇴근 > 기본 퇴근 */
  const validateTimes = () => {
    if (workMode === 'weekend') return true
    if (preWorkOvertime) {
      if (timeToMinutes(overtimeStart) >= timeToMinutes(defaultStart)) {
        return false
      }
    }
    if (postWorkOvertime) {
      if (timeToMinutes(overtimeEnd) <= timeToMinutes(defaultEnd)) {
        return false
      }
    }
    return true
  }

  const computeTotalMinutes = () => {
    if (skipRecord) return 0
    const deductionMin = (Number(deductionHours) || 0) * 60
    if (workMode === 'weekend') {
      const startM = timeToMinutes(overtimeStart)
      const endM = timeToMinutes(overtimeEnd)
      const span = endM >= startM ? endM - startM : endM + 24 * 60 - startM
      return Math.max(0, span - deductionMin)
    }
    let morning = 0
    if (preWorkOvertime) {
      morning = Math.max(
        0,
        timeToMinutes(defaultStart) - timeToMinutes(overtimeStart)
      )
    }
    let afternoon = 0
    if (postWorkOvertime) {
      afternoon = Math.max(
        0,
        timeToMinutes(overtimeEnd) - timeToMinutes(defaultEnd)
      )
    }
    return Math.max(0, morning + afternoon - deductionMin)
  }

  const handleSave = () => {
    if (skipRecord) {
      setSavedByDate((prev) => ({
        ...prev,
        [dateKey]: {
          skipRecord: true,
          totalMinutes: 0,
        },
      }))
      closeModal()
      return
    }
    if (!validateTimes()) {
      setTimeValidationError('시간 설정이 올바르지 않습니다')
      return
    }
    setTimeValidationError('')
    const totalMinutes = computeTotalMinutes()
    setSavedByDate((prev) => ({
      ...prev,
      [dateKey]: {
        skipRecord: false,
        workMode,
        preWorkOvertime,
        overtimeStart,
        defaultStart,
        defaultEnd,
        postWorkOvertime,
        overtimeEnd,
        deductionHours: Number(deductionHours) || 0,
        totalMinutes,
      },
    }))
    closeModal()
  }

  const viewYear = getYear(viewMonth)
  const viewMonthNum = getMonth(viewMonth)

  const viewedMonthTotalMinutes = useMemo(() => {
    let total = 0
    Object.entries(savedByDate).forEach(([key, data]) => {
      const d = new Date(key)
      if (getYear(d) === viewYear && getMonth(d) === viewMonthNum) {
        total += data.totalMinutes ?? 0
      }
    })
    return total
  }, [savedByDate, viewYear, viewMonthNum])

  const hasRecord = (date) => {
    const key = format(date, 'yyyy-MM-dd')
    return savedByDate[key] != null
  }

  /** 'skip' = 빨간 표시(시간외 안함 또는 총 0시간), 'overtime' = 파란 표시, null = 기록 없음 */
  const getRecordStyle = (date) => {
    const key = format(date, 'yyyy-MM-dd')
    const data = savedByDate[key]
    if (!data) return null
    if (data.skipRecord) return 'skip'
    if ((data.totalMinutes ?? 0) === 0) return 'skip'
    return 'overtime'
  }

  const openSettings = () => {
    setSettingsForm({ ...defaults })
    setShowSettings(true)
  }

  const closeSettings = () => {
    try {
      localStorage.setItem(DEFAULTS_STORAGE_KEY, JSON.stringify(settingsForm))
    } catch (e) {
      console.warn('localStorage save defaults failed', e)
    }
    setDefaults(settingsForm)
    setShowSettings(false)
  }

  return (
    <div className="min-h-screen flex flex-col bg-neutral-100">
      <header className="bg-blue-600 text-white py-5 px-4 flex items-center justify-center relative shadow">
        <h1 className="text-2xl font-bold tracking-tight">
          OverTimer ⏱️
        </h1>
        {!showSettings && (
          <button
            type="button"
            onClick={openSettings}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-xl hover:bg-white/20 active:bg-white/30 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="설정"
          >
            <Settings className="w-6 h-6" strokeWidth={2} />
          </button>
        )}
      </header>

      {showSettings ? (
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="max-w-md mx-auto flex flex-col gap-5">
            <h2 className="text-xl font-semibold text-neutral-800">설정</h2>
            <p className="text-sm text-neutral-500">새 날짜를 열 때 적용될 기본값입니다.</p>

            <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide block mb-1">시각</span>
              <span className="text-sm text-neutral-600 block mb-2">기본 출근 시각</span>
              <TimeSelect
                value={settingsForm.defaultStart}
                onChange={(v) => setSettingsForm((prev) => ({ ...prev, defaultStart: v }))}
              />
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide block mb-1">시각</span>
              <span className="text-sm text-neutral-600 block mb-2">기본 퇴근 시각</span>
              <TimeSelect
                value={settingsForm.defaultEnd}
                onChange={(v) => setSettingsForm((prev) => ({ ...prev, defaultEnd: v }))}
              />
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide block mb-1">시간</span>
              <span className="text-sm text-neutral-600 block mb-2">공제 시간 (1시간 단위)</span>
              <DeductionStepper
                value={settingsForm.deductionHours}
                onChange={(v) => setSettingsForm((prev) => ({ ...prev, deductionHours: v }))}
              />
            </div>

            <button
              type="button"
              onClick={closeSettings}
              className="w-full min-h-[48px] py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 active:bg-blue-800 transition-colors"
            >
              완료
            </button>
          </div>
        </main>
      ) : (
        <>
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-neutral-200 overflow-hidden">
          <Calendar
            value={selectedDate}
            activeStartDate={viewMonth}
            onActiveStartDateChange={({ activeStartDate }) => {
              if (activeStartDate) setViewMonth(activeStartDate)
            }}
            onChange={(value) => openModal(Array.isArray(value) ? value[0] : value)}
            locale="en-US"
            formatShortWeekday={(_, date) =>
              ['S', 'M', 'T', 'W', 'T', 'F', 'S'][date.getDay()]
            }
            showNeighboringMonth={false}
            className="mx-auto overtimer-calendar border-0 w-full"
            tileClassName={({ date }) => {
              const style = getRecordStyle(date)
              if (style === 'skip') return 'react-calendar__tile--hasRecordSkip'
              if (style === 'overtime') return 'react-calendar__tile--hasRecord'
              return null
            }}
            tileContent={({ date }) => {
              const style = getRecordStyle(date)
              if (style === 'skip') {
                return (
                  <span
                    className="block w-1.5 h-1.5 rounded-full bg-red-500 mx-auto mt-0.5"
                    aria-hidden
                  />
                )
              }
              if (style === 'overtime') {
                return (
                  <span
                    className="block w-1.5 h-1.5 rounded-full bg-blue-400 mx-auto mt-0.5"
                    aria-hidden
                  />
                )
              }
              return null
            }}
          />
        </div>
      </main>

      <footer className="py-5 px-4 text-center border-t border-neutral-200 bg-white">
        <p className="text-lg font-medium text-neutral-700">
          {viewMonthNum + 1}월 총 시간외 근무: {minutesToDuration(viewedMonthTotalMinutes)}
        </p>
      </footer>
        </>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-neutral-900/50"
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div
            className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-6 pb-4 border-b border-neutral-200 shrink-0">
              <h2 className="text-xl font-semibold text-neutral-800">
                시간외 근무 입력 — {dateKey}
              </h2>
              {/* 주중 / 주말 모드 탭 */}
              <div className="flex mt-4 rounded-xl bg-neutral-100 p-1">
                <button
                  type="button"
                  onClick={() => setWorkMode('weekday')}
                  disabled={skipRecord}
                  className={`flex-1 min-h-[44px] rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                    workMode === 'weekday'
                      ? 'bg-white text-neutral-800 shadow'
                      : 'text-neutral-600 hover:text-neutral-800'
                  }`}
                >
                  주중(기본)
                </button>
                <button
                  type="button"
                  onClick={() => setWorkMode('weekend')}
                  disabled={skipRecord}
                  className={`flex-1 min-h-[44px] rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                    workMode === 'weekend'
                      ? 'bg-white text-neutral-800 shadow'
                      : 'text-neutral-600 hover:text-neutral-800'
                  }`}
                >
                  주말(자율)
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-5 flex flex-col gap-5">
              {/* 오늘 시간외 안함: 체크 시 입력란만 비활성화, 값은 유지 */}
              <div className="rounded-2xl border-2 border-neutral-200 bg-neutral-50 p-4 shadow-sm">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skipRecord}
                    onChange={(e) => setSkipRecord(e.target.checked)}
                    className="h-5 w-5 rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-neutral-800">
                    오늘 시간외 안함
                  </span>
                </label>
              </div>

              <div className="flex flex-col gap-5 border-t border-neutral-100 pt-5">
                {workMode === 'weekend' ? (
                  <>
                    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
                      <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide block mb-1">시각</span>
                      <span className="text-sm text-neutral-600 block mb-2">시작 시각</span>
                      <TimeSelect
                        value={overtimeStart}
                        onChange={(v) => {
                          setOvertimeStart(v)
                          setTimeValidationError('')
                        }}
                        disabled={skipRecord}
                      />
                    </div>
                    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
                      <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide block mb-1">시각</span>
                      <span className="text-sm text-neutral-600 block mb-2">종료 시각</span>
                      <TimeSelect
                        value={overtimeEnd}
                        onChange={(v) => {
                          setOvertimeEnd(v)
                          setTimeValidationError('')
                        }}
                        disabled={skipRecord}
                      />
                    </div>
                    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
                      <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide block mb-1">시간</span>
                      <span className="text-sm text-neutral-600 block mb-2">공제 시간 (1시간 단위)</span>
                      <DeductionStepper
                        value={deductionHours}
                        onChange={setDeductionHours}
                        disabled={skipRecord}
                      />
                    </div>
                    <div className="pt-4 mt-2 border-t border-neutral-200">
                      <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">이번 날 합산 (시간)</p>
                      <p className="text-xl font-semibold text-blue-600">
                        {skipRecord ? '—' : minutesToDuration(computeTotalMinutes())}
                      </p>
                    </div>
                    {timeValidationError && (
                      <p className="text-sm text-red-600 font-medium text-center py-2 rounded-xl bg-red-50 border border-red-200" role="alert">
                        {timeValidationError}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                {/* 출근 전 시간외 */}
                <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
                  <label className="flex items-center gap-2 mb-3">
                    <input
                      type="checkbox"
                      checked={preWorkOvertime}
                      onChange={(e) => {
                        setPreWorkOvertime(e.target.checked)
                        setTimeValidationError('')
                      }}
                      disabled={skipRecord}
                      className="h-5 w-5 rounded border-neutral-300 text-blue-600 disabled:opacity-50"
                    />
                    <span className="text-sm font-medium text-neutral-700">
                      출근 전 시간외
                    </span>
                  </label>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide">시각</span>
                    <TimeSelect
                      value={overtimeStart}
                      onChange={(v) => {
                        setOvertimeStart(v)
                        setTimeValidationError('')
                      }}
                      disabled={skipRecord || !preWorkOvertime}
                    />
                  </div>
                </div>

                {/* 기본 출근 시각 */}
                <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
                  <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide block mb-1">시각</span>
                  <span className="text-sm text-neutral-600 block mb-2">기본 출근 시각</span>
                  <TimeSelect
                    value={defaultStart}
                    onChange={(v) => {
                      setDefaultStart(v)
                      setTimeValidationError('')
                    }}
                    disabled={skipRecord}
                  />
                </div>

                {/* 기본 퇴근 시각 */}
                <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
                  <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide block mb-1">시각</span>
                  <span className="text-sm text-neutral-600 block mb-2">기본 퇴근 시각</span>
                  <TimeSelect
                    value={defaultEnd}
                    onChange={(v) => {
                      setDefaultEnd(v)
                      setTimeValidationError('')
                    }}
                    disabled={skipRecord}
                  />
                </div>

                {/* 퇴근 후 시간외 */}
                <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
                  <label className="flex items-center gap-2 mb-3">
                    <input
                      type="checkbox"
                      checked={postWorkOvertime}
                      onChange={(e) => {
                        setPostWorkOvertime(e.target.checked)
                        setTimeValidationError('')
                      }}
                      disabled={skipRecord}
                      className="h-5 w-5 rounded border-neutral-300 text-blue-600 disabled:opacity-50"
                    />
                    <span className="text-sm font-medium text-neutral-700">
                      퇴근 후 시간외
                    </span>
                  </label>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide">시각</span>
                    <TimeSelect
                      value={overtimeEnd}
                      onChange={(v) => {
                        setOvertimeEnd(v)
                        setTimeValidationError('')
                      }}
                      disabled={skipRecord || !postWorkOvertime}
                    />
                  </div>
                </div>

                {/* 공제 시간 */}
                <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
                  <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide block mb-1">시간</span>
                  <span className="text-sm text-neutral-600 block mb-2">공제 시간 (1시간 단위)</span>
                  <DeductionStepper
                    value={deductionHours}
                    onChange={setDeductionHours}
                    disabled={skipRecord}
                  />
                </div>

                {/* 이번 날 합산 */}
                <div className="rounded-2xl border border-neutral-200 bg-blue-50/50 p-4 border-blue-100">
                  <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">이번 날 합산 (시간)</p>
                  <p className="text-xl font-semibold text-blue-600">
                    {skipRecord ? '—' : minutesToDuration(computeTotalMinutes())}
                  </p>
                </div>

                {timeValidationError && (
                  <p className="text-sm text-red-600 font-medium text-center py-2 rounded-xl bg-red-50 border border-red-200" role="alert">
                    {timeValidationError}
                  </p>
                )}
                  </>
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-neutral-200 flex flex-col gap-3 shrink-0 bg-neutral-50 rounded-b-2xl">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 min-h-[48px] py-3 rounded-xl border-2 border-neutral-300 text-neutral-700 font-medium hover:bg-neutral-100 active:bg-neutral-200 transition-colors"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="flex-1 min-h-[48px] py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 active:bg-blue-800 transition-colors"
                >
                  저장
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
