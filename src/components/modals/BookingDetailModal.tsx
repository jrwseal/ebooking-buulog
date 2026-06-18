import { useState } from 'react'
import { X, CalendarDays, Clock, MapPin, Users, AlertTriangle, Check, Trash2 } from 'lucide-react'
import { STATUS, thaiFull, overlaps } from '../../utils/datetime'
import { useStore } from '../../store/useStore'
import type { Booking, Status } from '../../types'

interface BookingDetailModalProps {
  booking: Booking
  role: 'requester' | 'approver'
  onClose: () => void
  onDecide: (id: string, status: Status, note: string) => void
  onRemove: (id: string) => void
}

export default function BookingDetailModal({
  booking: b,
  role,
  onClose,
  onDecide,
  onRemove,
}: BookingDetailModalProps) {
  const { rooms, bookings } = useStore()
  const [note, setNote] = useState(b.reviewNote || '')

  const roomName = (id: string) => rooms.find((r) => r.id === id)?.name ?? id
  const S = STATUS[b.status]

  const conflicts =
    b.status === 'pending'
      ? bookings.filter(
          (x) =>
            x.id !== b.id &&
            x.roomId === b.roomId &&
            x.date === b.date &&
            x.status === 'approved' &&
            overlaps(b.start, b.end, x.start, x.end),
        )
      : []

  const canDecide = role === 'approver' && b.status === 'pending'
  const canDelete = role === 'approver' || b.status === 'pending'

  function handleDecide(status: Status) {
    onDecide(b.id, status, note)
    onClose()
  }

  function handleRemove() {
    const label = role === 'approver' ? 'ลบรายการนี้' : 'ยกเลิกคำขอนี้'
    if (!window.confirm(`${label}? ย้อนกลับไม่ได้`)) return
    onRemove(b.id)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="font-bold">รายละเอียดการจอง</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-500"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <h4 className="font-bold text-base">{b.title}</h4>
            <span className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full border ${S.chip}`}>
              {S.label}
            </span>
          </div>
          <p className="text-sm text-slate-600 flex items-center gap-1.5">
            <CalendarDays size={14} /> {thaiFull(b.date)}
          </p>
          <p className="text-sm text-slate-600 flex items-center gap-1.5">
            <Clock size={14} /> {b.start}–{b.end}
          </p>
          <p className="text-sm text-slate-600 flex items-center gap-1.5">
            <MapPin size={14} /> {roomName(b.roomId)}
          </p>
          <p className="text-sm text-slate-600 flex items-center gap-1.5">
            <Users size={14} /> {b.requester}
          </p>
          {b.purpose && (
            <p className="text-sm text-slate-500 bg-slate-50 rounded-lg p-2">{b.purpose}</p>
          )}
          {b.reviewNote && !canDecide && (
            <p className="text-sm text-slate-500">หมายเหตุผู้อนุมัติ: {b.reviewNote}</p>
          )}

          {conflicts.length > 0 && (
            <div className="flex gap-1.5 items-start text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              ชนกับการจองที่อนุมัติแล้ว:{' '}
              {conflicts.map((c) => `${c.start}–${c.end}`).join(', ')}
            </div>
          )}

          {/* Admin approve/reject */}
          {canDecide && (
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="หมายเหตุ (ไม่บังคับ)"
                className="input text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => handleDecide('approved')}
                  className="flex-1 text-sm font-medium py-2 rounded-md bg-green-600 text-white hover:bg-green-700 flex items-center justify-center gap-1"
                >
                  <Check size={15} /> อนุมัติ
                </button>
                <button
                  onClick={() => handleDecide('rejected')}
                  className="flex-1 text-sm font-medium py-2 rounded-md bg-rose-100 text-rose-700 hover:bg-rose-200 flex items-center justify-center gap-1"
                >
                  <X size={15} /> ปฏิเสธ
                </button>
              </div>
            </div>
          )}

          {/* Delete / cancel */}
          {canDelete && (
            <button
              onClick={handleRemove}
              className="text-xs text-slate-400 hover:text-rose-600 mt-1 flex items-center gap-1 transition"
            >
              <Trash2 size={13} />
              {role === 'approver' ? 'ลบรายการ' : 'ยกเลิกคำขอนี้'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
