import { useState, useMemo } from 'react'
import { X, AlertTriangle, Info, Repeat2 } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { todayStr, toMin, overlaps, pad, parseDate, fmtDate } from '../../utils/datetime'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import SearchableSelect from '../SearchableSelect'
import { LECTURERS } from '../../data/lecturers'
import { downloadBookingPdf } from '../../lib/pdf/generateBookingPdf'
import type { BookingInput } from '../../store/useStore'

interface BookingModalProps {
  defaultDate: string
  defaultRoomId?: string | null
  defaultHour?: number
  adminMode?: boolean
  onClose: () => void
  onSuccess: (msg: string) => void
  onError: (msg: string) => void
}

export default function BookingModal({ defaultDate, defaultRoomId, defaultHour, adminMode = false, onClose, onSuccess, onError }: BookingModalProps) {
  const { rooms, bookings, addBooking, addSchedule, addSchedules } = useStore()
  const trapRef = useFocusTrap<HTMLDivElement>()

  const [form, setForm] = useState<BookingInput>({
    roomId: defaultRoomId ?? rooms[0]?.id ?? '',
    title: '',
    requester: '',
    email: '',
    date: defaultDate || todayStr,
    start: defaultHour !== undefined ? `${pad(defaultHour)}:00` : '09:00',
    end: defaultHour !== undefined ? `${pad(Math.min(20, defaultHour + 1))}:00` : '12:00',
    purpose: '',
    studentId: '',
    major: '',
    year: '',
    phone: '',
    courseCode: '',
    courseGroup: '',
    instructorName: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [recur, setRecur] = useState(false)
  const [recurEnd, setRecurEnd] = useState('')

  // All dates this submission will cover
  const occurrences = useMemo(() => {
    if (!adminMode || !recur || !recurEnd || recurEnd < form.date) return [form.date]
    const dates: string[] = []
    const cur = parseDate(form.date)
    while (fmtDate(cur) <= recurEnd) {
      dates.push(fmtDate(cur))
      cur.setDate(cur.getDate() + 7)
    }
    return dates
  }, [adminMode, recur, recurEnd, form.date])

  // Which dates have conflicts (pending or approved)
  const conflictedDates = useMemo(() =>
    occurrences.filter((date) =>
      bookings.some(
        (b) =>
          b.roomId === form.roomId &&
          b.date === date &&
          b.status !== 'rejected' &&
          overlaps(form.start, form.end, b.start, b.end),
      ),
    ),
    [occurrences, bookings, form.roomId, form.start, form.end],
  )

  const cleanDates = occurrences.filter((d) => !conflictedDates.includes(d))
  const isRecurMode = adminMode && recur && occurrences.length > 1

  function update<K extends keyof BookingInput>(key: K, value: BookingInput[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit() {
    if (!form.title.trim() || !form.requester.trim()) {
      onError('กรอกหัวข้อและชื่อผู้จองให้ครบ')
      return
    }
    if (!adminMode && !/.+@.+\..+/.test(form.email.trim())) {
      onError('กรอก email ให้ถูกต้อง')
      return
    }
    if (!adminMode) {
      const required: Array<[string, string]> = [
        [form.studentId, 'รหัสนิสิต'],
        [form.major, 'สาขาวิชา/แขนงวิชา'],
        [form.year, 'ชั้นปีที่'],
        [form.phone, 'เบอร์โทรศัพท์'],
        [form.courseCode, 'รหัสวิชา'],
        [form.courseGroup, 'กลุ่ม'],
      ]
      const missing = required.find(([value]) => !value.trim())
      if (missing) {
        onError(`กรอก${missing[1]}ให้ครบ`)
        return
      }
    }
    if (toMin(form.end) <= toMin(form.start)) {
      onError('เวลาสิ้นสุดต้องหลังเวลาเริ่ม')
      return
    }

    if (adminMode) {
      if (isRecurMode) {
        if (cleanDates.length === 0) {
          onError('ทุกสัปดาห์มีการจองซ้ำ ไม่สามารถบันทึกได้')
          return
        }
        setSubmitting(true)
        try {
          const inputs = cleanDates.map((date) => ({
            ...form,
            date,
            title: form.title.trim(),
            requester: form.requester.trim(),
          }))
          await addSchedules(inputs)
          const skipped = conflictedDates.length
          onSuccess(
            `บันทึกตารางสอน ${cleanDates.length} สัปดาห์แล้ว` +
            (skipped > 0 ? ` (ข้าม ${skipped} สัปดาห์ที่ชนกัน)` : ''),
          )
          onClose()
        } catch {
          onError('บันทึกไม่สำเร็จ ลองอีกครั้ง')
        } finally {
          setSubmitting(false)
        }
        return
      }

      // Single admin schedule
      if (conflictedDates.length > 0) {
        onError('ช่วงเวลานี้ถูกจองแล้ว ไม่สามารถบันทึกได้')
        return
      }
      setSubmitting(true)
      try {
        await addSchedule({ ...form, title: form.title.trim(), requester: form.requester.trim() })
        onSuccess('บันทึกตารางสอนแล้ว')
        onClose()
      } catch {
        onError('บันทึกไม่สำเร็จ ลองอีกครั้ง')
      } finally {
        setSubmitting(false)
      }
      return
    }

    // Regular student booking
    if (conflictedDates.length > 0) {
      onError('ช่วงเวลานี้ถูกจองแล้ว ไม่สามารถส่งคำขอได้')
      return
    }
    setSubmitting(true)
    try {
      const booking = await addBooking({ ...form, title: form.title.trim(), requester: form.requester.trim(), email: form.email.trim() })
      localStorage.setItem('ebooking_email', form.email.trim())
      onSuccess('ส่งคำขอจองแล้ว รอการอนุมัติ')
      onClose()
      const room = rooms.find((r) => r.id === booking.roomId)
      if (room) {
        try {
          await downloadBookingPdf(booking, room)
        } catch (err) {
          console.error('[downloadBookingPdf]', err)
        }
      }
    } catch {
      onError('บันทึกไม่สำเร็จ ลองอีกครั้ง')
    } finally {
      setSubmitting(false)
    }
  }

  const submitDisabled =
    submitting ||
    (isRecurMode ? cleanDates.length === 0 : conflictedDates.length > 0)

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
          <h3 id="booking-modal-title" className="font-bold">
            {adminMode ? 'เพิ่มตารางสอนอาจารย์' : 'แบบฟอร์มขอจองห้อง'}
          </h3>
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

          <Field label={adminMode ? 'วิชา / กิจกรรม *' : 'หัวข้อ / รายวิชา *'}>
            <input
              value={form.title}
              onChange={(e) => update('title', e.target.value)}
              placeholder={adminMode ? 'เช่น การจัดการโซ่อุปทาน 3/2567' : 'เช่น การจัดการคลังสินค้า'}
              className="input"
            />
          </Field>

          <Field label={adminMode ? 'อาจารย์ผู้สอน *' : 'ผู้จอง *'}>
            <input
              value={form.requester}
              onChange={(e) => update('requester', e.target.value)}
              placeholder={adminMode ? 'ชื่อ-นามสกุล อาจารย์' : 'ชื่อ-นามสกุล / หน่วยงาน'}
              className="input"
            />
          </Field>

          {!adminMode && (
            <Field label="อีเมล *">
              <input
                type="email"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                placeholder="สำหรับรับแจ้งเตือนและดูการจองของคุณ"
                className="input"
              />
            </Field>
          )}

          {!adminMode && (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                <Field label="รหัสนิสิต *">
                  <input
                    value={form.studentId}
                    onChange={(e) => update('studentId', e.target.value)}
                    placeholder="เช่น 64010123"
                    className="input"
                  />
                </Field>
                <Field label="ชั้นปีที่ *">
                  <input
                    value={form.year}
                    onChange={(e) => update('year', e.target.value)}
                    placeholder="เช่น 3"
                    className="input"
                  />
                </Field>
              </div>
              <Field label="สาขาวิชา/แขนงวิชา *">
                <input
                  value={form.major}
                  onChange={(e) => update('major', e.target.value)}
                  placeholder="เช่น การจัดการโลจิสติกส์และโซ่อุปทาน"
                  className="input"
                />
              </Field>
              <Field label="เบอร์โทรศัพท์ *">
                <input
                  value={form.phone}
                  onChange={(e) => update('phone', e.target.value)}
                  placeholder="เช่น 0812345678"
                  className="input"
                />
              </Field>
              <div className="grid grid-cols-2 gap-2.5">
                <Field label="รหัสวิชา *">
                  <input
                    value={form.courseCode}
                    onChange={(e) => update('courseCode', e.target.value)}
                    placeholder="เช่น 88420159"
                    className="input"
                  />
                </Field>
                <Field label="กลุ่ม *">
                  <input
                    value={form.courseGroup}
                    onChange={(e) => update('courseGroup', e.target.value)}
                    placeholder="เช่น 1"
                    className="input"
                  />
                </Field>
              </div>
              <Field label="อาจารย์ประจำวิชาผู้รับรอง (ถ้ามี)">
                <SearchableSelect
                  value={form.instructorName}
                  onChange={(v) => update('instructorName', v)}
                  options={LECTURERS}
                  placeholder="ค้นหาชื่อ-นามสกุล อาจารย์ผู้รับรอง"
                />
              </Field>
            </>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <div className="col-span-2 sm:col-span-1">
              <Field label={adminMode && recur ? 'วันเริ่มต้น' : 'วันที่'}>
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

          {/* Recur toggle — admin only */}
          {adminMode && (
            <div className="space-y-2.5">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={recur}
                  onChange={(e) => setRecur(e.target.checked)}
                  className="w-4 h-4 accent-buu rounded"
                />
                <span className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
                  <Repeat2 size={15} aria-hidden="true" /> ซ้ำทุกสัปดาห์
                </span>
              </label>

              {recur && (
                <Field label="วันสิ้นสุด">
                  <input
                    type="date"
                    value={recurEnd}
                    min={form.date}
                    onChange={(e) => setRecurEnd(e.target.value)}
                    className="input"
                  />
                </Field>
              )}
            </div>
          )}

          {!adminMode && (
            <Field label="รายละเอียดเพิ่มเติม">
              <textarea
                value={form.purpose}
                onChange={(e) => update('purpose', e.target.value)}
                rows={2}
                placeholder="วัตถุประสงค์ / อุปกรณ์ที่ต้องใช้"
                className="input resize-none"
              />
            </Field>
          )}

          {/* Recur summary */}
          {isRecurMode && recurEnd && (
            conflictedDates.length === 0 ? (
              <div className="flex gap-2 bg-buu-tint border border-buu/20 text-buu text-sm rounded-lg p-2.5">
                <Info size={15} className="shrink-0 mt-0.5" aria-hidden="true" />
                จะสร้างตารางสอน <span className="font-semibold">{occurrences.length} สัปดาห์</span>
              </div>
            ) : cleanDates.length > 0 ? (
              <div className="flex gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg p-2.5">
                <AlertTriangle size={15} className="shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  จะสร้าง <span className="font-semibold">{cleanDates.length} สัปดาห์</span>
                  {' '}· ข้าม <span className="font-semibold">{conflictedDates.length} สัปดาห์</span> ที่ชนกับการจองที่มีอยู่
                </div>
              </div>
            ) : (
              <div className="flex gap-2 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg p-2.5">
                <AlertTriangle size={15} className="shrink-0 mt-0.5" aria-hidden="true" />
                ทุกสัปดาห์ชนกับการจองที่มีอยู่ ไม่สามารถบันทึกได้
              </div>
            )
          )}

          {/* Single date conflict */}
          {!isRecurMode && conflictedDates.length > 0 && (
            <div className="flex gap-2 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg p-2.5">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                ห้องนี้ถูกจองทับช่วงเวลานี้แล้ว
                <br />
                <span className="text-rose-500">ไม่สามารถ{adminMode ? 'บันทึก' : 'ส่งคำขอ'}ได้ กรุณาเลือกเวลาอื่น</span>
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
              disabled={submitDisabled}
              className="flex-1 py-2.5 rounded-lg bg-buu text-white font-semibold hover:bg-buu-dark disabled:opacity-60"
            >
              {submitting
                ? 'กำลังบันทึก…'
                : adminMode
                  ? isRecurMode && recurEnd
                    ? `บันทึก ${cleanDates.length} สัปดาห์`
                    : 'บันทึกตารางสอน'
                  : 'ส่งคำขอจอง'}
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
