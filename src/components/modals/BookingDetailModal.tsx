import { useState } from 'react'
import { X, CalendarDays, Clock, MapPin, Users, AlertTriangle, Check, Trash2, CalendarPlus, ExternalLink, ScanLine, FileDown } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { STATUS, thaiFull, overlaps } from '../../utils/datetime'
import { useStore } from '../../store/useStore'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import type { Booking, Status } from '../../types'

function toUtcIcal(dateStr: string, timeStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [h, min] = timeStr.split(':').map(Number)
  const utcMs = Date.UTC(y, m - 1, d, h, min, 0) - 7 * 60 * 60 * 1000 // Bangkok = UTC+7
  const dt = new Date(utcMs)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${dt.getUTCFullYear()}${p(dt.getUTCMonth() + 1)}${p(dt.getUTCDate())}T${p(dt.getUTCHours())}${p(dt.getUTCMinutes())}00Z`
}

function downloadIcs(b: Booking, room: string, title: string) {
  const dtStart = toUtcIcal(b.date, b.start)
  const dtEnd   = toUtcIcal(b.date, b.end)
  const dtstamp = toUtcIcal(new Date().toISOString().slice(0, 10), `${String(new Date().getUTCHours() + 7).padStart(2, '0')}:${String(new Date().getUTCMinutes()).padStart(2, '0')}`)
  const desc = `ผู้จอง: ${b.requester}${b.purpose ? '\\n' + b.purpose : ''}`
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//eBooking-BUULOG//TH',
    'BEGIN:VEVENT',
    `UID:${b.id}@ebooking-buulog`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${desc}`,
    `LOCATION:${room}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
  a.download = `booking-${b.date}.ics`
  a.click()
}

function googleCalUrl(b: Booking, room: string, title: string): string {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${toUtcIcal(b.date, b.start)}/${toUtcIcal(b.date, b.end)}`,
    details: `ผู้จอง: ${b.requester}${b.purpose ? '\n' + b.purpose : ''}`,
    location: room,
  })
  return `https://calendar.google.com/calendar/render?${p}`
}

import { downloadBookingPdf } from '../../lib/pdf/generateBookingPdf'

interface BookingDetailModalProps {
  booking: Booking
  role: 'requester' | 'approver'
  onClose: () => void
  onDecide: (id: string, status: Status, note: string) => void
  onRemove: (id: string) => void
  onError: (msg: string) => void
}

export default function BookingDetailModal({
  booking: b,
  role,
  onClose,
  onDecide,
  onRemove,
  onError,
}: BookingDetailModalProps) {
  const { rooms, bookings } = useStore()
  const [note, setNote] = useState(b.reviewNote || '')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)

  async function handleDownloadPdf() {
    const room = rooms.find((r) => r.id === b.roomId)
    if (!room) { onError('ไม่พบข้อมูลห้อง'); return }
    setDownloadingPdf(true)
    try {
      await downloadBookingPdf(b, room)
    } catch (err) {
      console.error('[downloadBookingPdf]', err)
      onError('สร้าง PDF ไม่สำเร็จ ลองอีกครั้ง')
    } finally {
      setDownloadingPdf(false)
    }
  }
  const trapRef = useFocusTrap<HTMLDivElement>()

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
  const calTitle = role === 'approver' ? b.title : `การจองห้อง ${roomName(b.roomId)}`

  function handleDecide(status: Status) {
    onDecide(b.id, status, note)
    onClose()
  }

  function handleRemove() {
    onRemove(b.id)
    onClose()
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
        aria-labelledby="detail-modal-title"
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className="sticky top-0 bg-white flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 id="detail-modal-title" className="font-bold">รายละเอียดการจอง</h3>
          <button
            onClick={onClose}
            aria-label="ปิด"
            className="w-10 h-10 flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-500"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-2.5">
          {role === 'requester' ? (
            <>
              <p className="text-sm text-slate-500">ช่วงเวลานี้ถูกจองแล้ว</p>
              <p className="text-sm text-slate-600 flex items-center gap-1.5">
                <CalendarDays size={14} /> {thaiFull(b.date)}
              </p>
              <p className="text-sm text-slate-600 flex items-center gap-1.5">
                <Clock size={14} /> {b.start}–{b.end}
              </p>
              <p className="text-sm text-slate-600 flex items-center gap-1.5">
                <MapPin size={14} /> {roomName(b.roomId)}
              </p>
              <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full border ${S.chip}`}>
                {S.label}
              </span>
            </>
          ) : (
            <>
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
            </>
          )}

          {b.bookingCode && (
            <div className="flex items-center gap-2 bg-buu-tint border border-buu/20 rounded-lg px-3 py-2">
              <span className="text-xs text-buu-mid">รหัสการจอง</span>
              <span className="font-mono font-bold text-sm text-buu tracking-wider">{b.bookingCode}</span>
              {b.checkedIn && (
                <span className="ml-auto flex items-center gap-1 text-[11px] font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                  <Check size={11} /> เช็คอินแล้ว
                </span>
              )}
            </div>
          )}

          {b.bookingCode && (
            <button
              onClick={() => void handleDownloadPdf()}
              disabled={downloadingPdf}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:border-buu-subtle hover:text-buu transition disabled:opacity-60 w-full justify-center"
            >
              <FileDown size={13} aria-hidden="true" />
              {downloadingPdf ? 'กำลังสร้าง PDF…' : 'ดาวน์โหลด PDF (แบบฟอร์มขอใช้ห้อง)'}
            </button>
          )}

          {b.status === 'approved' && !b.checkedIn && (
            <div className="flex flex-col items-center gap-2 py-2">
              <QRCodeSVG value={b.bookingCode || b.id} size={140} includeMargin />
              <p className="text-xs text-slate-400 flex items-center gap-1">
                <ScanLine size={12} aria-hidden="true" /> ให้แอดมินสแกนเพื่อยืนยันการใช้ห้อง
              </p>
            </div>
          )}

          {b.status === 'approved' && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => downloadIcs(b, roomName(b.roomId), calTitle)}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:border-buu-subtle hover:text-buu transition"
              >
                <CalendarPlus size={13} aria-hidden="true" /> บันทึก .ics
              </button>
              <a
                href={googleCalUrl(b, roomName(b.roomId), calTitle)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:border-buu-subtle hover:text-buu transition"
              >
                <ExternalLink size={13} aria-hidden="true" /> Google Calendar
              </a>
            </div>
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
                  className="flex-1 text-sm font-medium py-2 min-h-[44px] rounded-md bg-green-600 text-white hover:bg-green-700 flex items-center justify-center gap-1"
                >
                  <Check size={15} aria-hidden="true" /> อนุมัติ
                </button>
                <button
                  onClick={() => handleDecide('rejected')}
                  className="flex-1 text-sm font-medium py-2 min-h-[44px] rounded-md bg-rose-100 text-rose-700 hover:bg-rose-200 flex items-center justify-center gap-1"
                >
                  <X size={15} aria-hidden="true" /> ปฏิเสธ
                </button>
              </div>
            </div>
          )}

          {/* Delete / cancel */}
          {canDelete && (
            deleteConfirm ? (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-rose-600">
                  {role === 'approver' ? 'ลบรายการนี้?' : 'ยกเลิกคำขอนี้?'}
                </span>
                <button
                  onClick={handleRemove}
                  className="text-xs font-medium text-rose-600 hover:underline"
                >
                  ยืนยัน
                </button>
                <button
                  onClick={() => setDeleteConfirm(false)}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  ยกเลิก
                </button>
              </div>
            ) : (
              <button
                onClick={() => setDeleteConfirm(true)}
                className="text-xs text-slate-400 hover:text-rose-600 mt-1 flex items-center gap-1 transition"
              >
                <Trash2 size={13} aria-hidden="true" />
                {role === 'approver' ? 'ลบรายการ' : 'ยกเลิกคำขอนี้'}
              </button>
            )
          )}
        </div>
      </div>
    </div>
  )
}
