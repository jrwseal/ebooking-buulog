import { useMemo } from 'react'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { STATUS, TH_DAYS_FULL, fmtDate, thaiFull, todayStr, parseDate, overlaps, toMin, pad } from '../../utils/datetime'
import Legend from '../Legend'
import type { Booking } from '../../types'

interface OverviewViewProps {
  selectedDate: string
  setSelectedDate: (s: string) => void
  role: 'requester' | 'approver'
  onBookRoom: (dateStr: string, roomId: string | null, hour: number) => void
  onOpenDetail: (b: Booking) => void
}

interface Period {
  key: string
  label: string
  startH: number
  endH: number
}

const PERIODS: Period[] = [
  { key: 'morning', label: 'เช้า', startH: 8, endH: 12 },
  { key: 'afternoon', label: 'บ่าย', startH: 12, endH: 16 },
  { key: 'evening', label: 'เย็น', startH: 16, endH: 20 },
]

export default function OverviewView({
  selectedDate,
  setSelectedDate,
  role,
  onBookRoom,
  onOpenDetail,
}: OverviewViewProps) {
  const { rooms, bookings, loading } = useStore()

  const dDate = useMemo(() => parseDate(selectedDate), [selectedDate])

  const rows = useMemo(
    () =>
      rooms.map((room) => ({
        room,
        periods: PERIODS.map((period) => ({
          period,
          items: bookings
            .filter(
              (b) =>
                b.roomId === room.id &&
                b.date === selectedDate &&
                b.status !== 'rejected' &&
                overlaps(b.start, b.end, `${pad(period.startH)}:00`, `${pad(period.endH)}:00`),
            )
            .sort((a, b) => toMin(a.start) - toMin(b.start)),
        })),
      })),
    [rooms, bookings, selectedDate],
  )

  function shiftDay(n: number) {
    const d = parseDate(selectedDate)
    d.setDate(d.getDate() + n)
    setSelectedDate(fmtDate(d))
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <h2 className="font-bold">
          วัน{TH_DAYS_FULL[dDate.getDay()]} {thaiFull(selectedDate)}
        </h2>
        <div className="flex items-center gap-1">
          <NavBtn aria-label="วันก่อน" onClick={() => shiftDay(-1)}>
            <ChevronLeft size={18} aria-hidden="true" />
          </NavBtn>
          <button
            onClick={() => setSelectedDate(todayStr)}
            className="text-xs font-medium px-2.5 py-1.5 rounded-md hover:bg-slate-100 text-slate-600"
          >
            วันนี้
          </button>
          <NavBtn aria-label="วันถัดไป" onClick={() => shiftDay(1)}>
            <ChevronRight size={18} aria-hidden="true" />
          </NavBtn>
        </div>
      </div>

      {loading && rooms.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-20 text-slate-400 text-sm">
          <Loader2 size={18} className="motion-safe:animate-spin" /> กำลังโหลดห้อง…
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50">
                  <th className="sticky left-0 bg-slate-50 text-left px-3 py-2 text-xs font-semibold text-slate-500 border-b border-slate-100 w-32">
                    ห้อง
                  </th>
                  {PERIODS.map((p) => (
                    <th
                      key={p.key}
                      className="px-3 py-2 text-xs font-semibold text-slate-500 border-b border-l border-slate-100 text-center"
                    >
                      {p.label}
                      <span className="block font-normal text-slate-400">
                        {pad(p.startH)}:00–{pad(p.endH)}:00
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ room, periods }) => (
                  <tr key={room.id} className="border-b border-slate-100 align-top">
                    <th
                      scope="row"
                      className="sticky left-0 bg-white text-left px-3 py-2 font-medium text-slate-700 w-32"
                    >
                      {room.name}
                      <span className="block text-[11px] font-normal text-slate-400">{room.type}</span>
                    </th>
                    {periods.map(({ period, items }) => (
                      <td key={period.key} className="border-l border-slate-100 px-1.5 py-1.5 align-top">
                        {items.length === 0 ? (
                          <button
                            onClick={() => onBookRoom(selectedDate, room.id, period.startH)}
                            className="w-full h-10 rounded-md border border-dashed border-slate-200 text-slate-300 hover:border-buu-subtle hover:text-buu transition text-xs"
                            aria-label={`จอง ${room.name} ช่วง${period.label}`}
                          >
                            +
                          </button>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {items.map((b) => (
                              <button
                                key={b.id}
                                onClick={() => onOpenDetail(b)}
                                className={`w-full text-left rounded border px-1.5 py-1 text-[11px] leading-tight min-h-[44px] sm:min-h-0 ${STATUS[b.status].chip}`}
                              >
                                <div className="font-semibold truncate">
                                  {role === 'requester' ? 'จองแล้ว' : b.title}
                                </div>
                                <div className="opacity-80 truncate">
                                  {b.start}–{b.end}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Legend />
        </>
      )}
    </div>
  )
}

function NavBtn({ onClick, children, 'aria-label': ariaLabel }: { onClick: () => void; children: React.ReactNode; 'aria-label'?: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className="w-10 h-10 flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-600"
    >
      {children}
    </button>
  )
}
