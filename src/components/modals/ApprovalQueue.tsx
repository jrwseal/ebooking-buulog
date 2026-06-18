import { useMemo, useState } from 'react'
import { X, Check, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { thaiFull, overlaps } from '../../utils/datetime'
import type { Booking, Status } from '../../types'

interface ApprovalQueueProps {
  onClose: () => void
  onDecide: (id: string, status: Status, note: string) => void
}

export default function ApprovalQueue({ onClose, onDecide }: ApprovalQueueProps) {
  const { rooms, bookings } = useStore()
  const roomName = (id: string) => rooms.find((r) => r.id === id)?.name ?? id

  const pending = useMemo(
    () =>
      bookings
        .filter((b) => b.status === 'pending')
        .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)),
    [bookings],
  )

  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="font-bold">คำขอรออนุมัติ ({pending.length})</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-500"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4">
          {pending.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              <CheckCircle2 size={28} className="mx-auto mb-2 opacity-40" />
              ไม่มีคำขอค้างอยู่
            </div>
          ) : (
            <div className="space-y-3">
              {pending.map((b) => (
                <ApprovalCard
                  key={b.id}
                  b={b}
                  roomName={roomName}
                  conflicts={bookings.filter(
                    (x) =>
                      x.id !== b.id &&
                      x.roomId === b.roomId &&
                      x.date === b.date &&
                      x.status === 'approved' &&
                      overlaps(b.start, b.end, x.start, x.end),
                  )}
                  onApprove={(note) => onDecide(b.id, 'approved', note)}
                  onReject={(note) => onDecide(b.id, 'rejected', note)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ApprovalCard({
  b,
  roomName,
  conflicts,
  onApprove,
  onReject,
}: {
  b: Booking
  roomName: (id: string) => string
  conflicts: Booking[]
  onApprove: (note: string) => void
  onReject: (note: string) => void
}) {
  const [note, setNote] = useState('')
  return (
    <div className="border border-slate-200 rounded-lg p-3">
      <p className="font-semibold text-sm">{b.title}</p>
      <p className="text-xs text-slate-500 mt-0.5">
        {thaiFull(b.date)} · {b.start}–{b.end}
      </p>
      <p className="text-xs text-slate-500">
        {roomName(b.roomId)} · โดย {b.requester}
      </p>
      {b.purpose && (
        <p className="text-xs text-slate-500 mt-1.5 bg-slate-50 rounded p-1.5">{b.purpose}</p>
      )}
      {conflicts.length > 0 && (
        <div className="flex gap-1.5 items-center text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-1.5 mt-2">
          <AlertTriangle size={13} className="shrink-0" />
          ชนกับการจองที่อนุมัติแล้ว {conflicts.map((c) => `${c.start}–${c.end}`).join(', ')}
        </div>
      )}
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="หมายเหตุ (ไม่บังคับ)"
        className="input mt-2 text-xs"
      />
      <div className="flex gap-2 mt-2">
        <button
          onClick={() => onApprove(note)}
          className="flex-1 text-sm font-medium py-2 rounded-md bg-green-600 text-white hover:bg-green-700 flex items-center justify-center gap-1"
        >
          <Check size={15} /> อนุมัติ
        </button>
        <button
          onClick={() => onReject(note)}
          className="flex-1 text-sm font-medium py-2 rounded-md bg-rose-100 text-rose-700 hover:bg-rose-200 flex items-center justify-center gap-1"
        >
          <X size={15} /> ปฏิเสธ
        </button>
      </div>
    </div>
  )
}
