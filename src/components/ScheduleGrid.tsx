import { STATUS, pad, toMin, todayStr } from '../utils/datetime'
import { START_H, END_H, PXPM, HOUR_H, BODY_H, HEAD_H, HOURS } from '../lib/config'
import type { Booking } from '../types'

export interface ScheduleColumn {
  key: string
  label: string
  sublabel?: string
  isToday?: boolean
  dateStr: string
  roomId: string | null
  items: Booking[]
}

interface ScheduleGridProps {
  columns: ScheduleColumn[]
  showRoom: boolean
  maskDetails?: boolean
  onSelect: (b: Booking) => void
  onCreate: (dateStr: string, roomId: string | null, hour: number) => void
}

type LaidOut = Booking & { lane: number; lanes: number }

function layoutColumn(items: Booking[]): LaidOut[] {
  const sorted = [...items].sort(
    (a, b) => toMin(a.start) - toMin(b.start) || toMin(a.end) - toMin(b.end),
  )
  const result: LaidOut[] = []
  let cluster: Booking[] = []
  let laneMap = new Map<Booking, number>()
  let clusterEnd = -1

  const flush = () => {
    const laneEnds: number[] = []
    cluster.forEach((it) => {
      let lane = laneEnds.findIndex((e) => e <= toMin(it.start))
      if (lane === -1) {
        lane = laneEnds.length
        laneEnds.push(toMin(it.end))
      } else {
        laneEnds[lane] = toMin(it.end)
      }
      laneMap.set(it, lane)
    })
    const n = laneEnds.length
    cluster.forEach((it) => result.push({ ...it, lane: laneMap.get(it) ?? 0, lanes: n }))
    cluster = []
    laneMap = new Map()
    clusterEnd = -1
  }

  sorted.forEach((it) => {
    if (cluster.length && toMin(it.start) >= clusterEnd) flush()
    cluster.push(it)
    clusterEnd = Math.max(clusterEnd, toMin(it.end))
  })
  flush()
  return result
}

export default function ScheduleGrid({ columns, showRoom, maskDetails = false, onSelect, onCreate }: ScheduleGridProps) {
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max">
        {/* Time axis */}
        <div className="w-11 shrink-0">
          <div style={{ height: HEAD_H }} />
          <div className="relative" style={{ height: BODY_H }}>
            {HOURS.map((h, i) => (
              <div
                key={h}
                className="absolute right-1 text-[10px] text-slate-400 select-none"
                style={{ top: i * HOUR_H - 6 }}
              >
                {pad(h)}:00
              </div>
            ))}
          </div>
        </div>

        {/* Columns */}
        {columns.map((col) => {
          const laid = layoutColumn(col.items)
          return (
            <div key={col.key} className="w-28 sm:w-36 shrink-0 border-l border-slate-100">
              {/* Column header */}
              <div
                style={{ height: HEAD_H }}
                className={`px-1 flex flex-col justify-center border-b border-slate-100 text-center ${
                  col.isToday ? 'bg-[#eef2f9]' : 'bg-slate-50'
                }`}
              >
                <div
                  className={`text-xs font-semibold truncate leading-tight ${
                    col.isToday ? 'text-[#1b3a6b]' : 'text-slate-700'
                  }`}
                >
                  {col.label}
                </div>
                {col.sublabel && (
                  <div className="text-[10px] text-slate-400 truncate">{col.sublabel}</div>
                )}
              </div>

              {/* Column body */}
              <div
                className="relative cursor-copy"
                style={{ height: BODY_H }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  let hour = Math.floor((e.clientY - rect.top) / HOUR_H) + START_H
                  hour = Math.min(END_H - 1, Math.max(START_H, hour))
                  onCreate(col.dateStr, col.roomId, hour)
                }}
              >
                {/* Hour grid lines */}
                {HOURS.map((h, i) => (
                  <div
                    key={h}
                    className="absolute left-0 right-0 border-t border-slate-100 pointer-events-none"
                    style={{ top: i * HOUR_H }}
                  />
                ))}

                {/* Current time line */}
                {col.dateStr === todayStr &&
                  nowMin >= START_H * 60 &&
                  nowMin <= END_H * 60 && (
                    <div
                      className="absolute left-0 right-0 h-0.5 bg-rose-500 pointer-events-none z-10"
                      style={{ top: (nowMin - START_H * 60) * PXPM }}
                    />
                  )}

                {/* Booking blocks */}
                {laid.map((b) => {
                  const top = Math.max(0, (toMin(b.start) - START_H * 60) * PXPM)
                  const bottom = Math.min(BODY_H, (toMin(b.end) - START_H * 60) * PXPM)
                  const h = Math.max(18, bottom - top)
                  const w = 100 / b.lanes
                  return (
                    <button
                      key={b.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelect(b)
                      }}
                      className={`absolute rounded border px-1 py-0.5 text-left overflow-hidden hover:brightness-95 transition-[filter] ${STATUS[b.status].chip}`}
                      style={{
                        top,
                        height: h,
                        left: `calc(${b.lane * w}% + 1px)`,
                        width: `calc(${w}% - 2px)`,
                      }}
                    >
                      <div className="text-[10px] font-semibold leading-tight truncate">
                        {showRoom ? b.roomId.replace('LOG-', '') + ' · ' : ''}
                        {maskDetails ? 'จองแล้ว' : b.title}
                      </div>
                      {h > 30 && (
                        <div className="text-[9px] opacity-80 truncate">
                          {b.start}–{b.end}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-[11px] text-slate-400 px-3 py-2 select-none">
        แตะช่องว่างเพื่อจองห้องตามเวลานั้น · แตะรายการเพื่อดูรายละเอียด
      </p>
    </div>
  )
}
