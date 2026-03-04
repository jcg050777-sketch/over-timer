import { useState, useMemo, useEffect } from 'react'
import Calendar from 'react-calendar'
import { Settings } from 'lucide-react'
import { format, getMonth, getYear, startOfMonth } from 'date-fns'

const STORAGE_KEY = 'overtimer-saved'
const DEFAULTS_STORAGE_KEY = 'overtimer-defaults'

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
    setTimeValidationError('')
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setTimeValidationError('')
  }

  /** 시간 유효성: 시간외 출근 < 기본 출근, 시간외 퇴근 > 기본 퇴근 */
  const validateTimes = () => {
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
    const deductionMin = (Number(deductionHours) || 0) * 60
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
            tileClassName={({ date }) =>
              hasRecord(date) ? 'react-calendar__tile--hasRecord' : null
            }
            tileContent={({ date }) =>
              hasRecord(date) ? (
                <span
                  className="block w-1.5 h-1.5 rounded-full bg-blue-400 mx-auto mt-0.5"
                  aria-hidden
                />
              ) : null
            }
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
