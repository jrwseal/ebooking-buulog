import { useState } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { todayStr, toMin, overlaps, pad } from '../../utils/datetime'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import type { BookingInput } from '../../store/useStore'

interface BookingModalProps {
  defaultDate: string
  defaultRoomId?: string | null
  defaultHour?: number
  onClose: () => void
  onSuccess: (msg: string) => void
  onError: (msg: string) => void
}

export default function BookingModal({ defaultDate, defaultRoomId, defaultHour, onClose, onSuccess, onError }: BookingModalProps) {
  const { rooms, bookings, addBooking } = useStore()
  const trapRef = useFocusTrap<HTMLDivElement>()

  const [form, setForm] = useState<BookingInput>({
    roomId: defaultRoomId ?? rooms[0]?.id ?? '',
    title: '',
    requester: '',
    date: defaultDate || todayStr,
    start: defaultHour !== undefined ? `${pad(defaultHour)}:00` : '09:00',
    end: defaultHour !== undefined ? `${pad(Math.min(20, defaultHour + 1))}:00` : '12:00',
    purpose: '',
  })
  const [submitting, setSubmitting] = useState(false)

  const liveConflicts = bookings.filter(
    (b) =>
      b.roomId === form.roomId &&
      b.date === form.date &&
      b.status !== 'rejected' &&
      overlaps(form.start, form.end, b.start, b.end),
  )

  function update<K extends keyof BookingInput>(key: K, value: BookingInput[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit() {
    if (!form.title.trim() || !form.requester.trim()) {
      onError('กรอกหัวข้อและชื่อผู้จองให้ครบ')
      return
    }
    if (toMin(form.end) <= toMin(form.start)) {
      onError('เวลาสิ้นสุดต้องหลังเวลาเริ่ม')
      return
    }
    if (liveConflicts.length > 0) {
      onError('ช่วงเวลานี้ถูกจองแล้ว ไม่สามารถส่งคำขอได้')
      return
    }
    setSubmitting(true)
    try {
      await addBooking({ ...form, title: form.title.trim(), requester: form.requester.trim() })
      onSuccess('ส่งคำขอจองแล้ว รอการอนุมัติ')
      onClose()
    } catch {
      onError('บันทึกไม่สำเร็จ ลองอีกครั้ง')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-modal-title"
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className="sticky top-0 bg-white flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 id="booking-modal-title" className="font-bold">แบบฟอร์มขอจองห้อง</h3>
          <button
            onClick={onClose}
            aria-label="ปิด"
            className="w-10 h-10 flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-500"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-3.5">
          <Field label="ห้องที่ต้องการ">
            <select value={form.roomId} onChange={(e) => update('roomId', e.target.value)} className="input">
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.capacity} ที่นั่ง)
                </option>
              ))}
            </select>
          </Field>

          <Field label="หัวข้อ / รายวิชา *">
            <input
              value={form.title}
              onChange={(e) => update('title', e.target.value)}
              placeholder="เช่น การจัดการคลังสินค้า"
              className="input"
            />
          </Field>

          <Field label="ผู้จอง *">
            <input
              value={form.requester}
              onChange={(e) => update('requester', e.target.value)}
              placeholder="ชื่อ-นามสกุล / หน่วยงาน"
              className="input"
            />
          </Field>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <div className="col-span-2 sm:col-span-1">
              <Field label="วันที่">
                <input type="date" value={form.date} onChange={(e) => update('date', e.target.value)} className="input" />
              </Field>
            </div>
            <Field label="เริ่ม">
              <input type="time" value={form.start} onChange={(e) => update('start', e.target.value)} className="input" />
            </Field>
            <Field label="ถึง">
              <input type="time" value={form.end} onChange={(e) => update('end', e.target.value)} className="input" />
            </Field>
          </div>

          <Field label="รายละเอียดเพิ่มเติม">
            <textarea
              value={form.purpose}
              onChange={(e) => update('purpose', e.target.value)}
              rows={2}
              placeholder="วัตถุประสงค์ / อุปกรณ์ที่ต้องใช้"
              className="input resize-none"
            />
          </Field>

          {liveConflicts.length > 0 && (
            <div className="flex gap-2 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg p-2.5">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                ห้องนี้ถูกจองทับช่วงเวลานี้แล้ว:{' '}
                <span className="font-medium">{liveConflicts.map((c) => `${c.start}–${c.end}`).join(', ')}</span>
                <br />
                <span className="text-rose-500">ไม่สามารถส่งคำขอได้ กรุณาเลือกเวลาอื่น</span>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-slate-200 text-slate-600 font-medium hover:bg-slate-50"
            >
              ยกเลิก
            </button>
            <button
              onClick={() => void handleSubmit()}
              disabled={submitting || liveConflicts.length > 0}
              className="flex-1 py-2.5 rounded-lg bg-buu text-white font-semibold hover:bg-buu-dark disabled:opacity-60"
            >
              {submitting ? 'กำลังส่ง…' : 'ส่งคำขอจอง'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  )
}
