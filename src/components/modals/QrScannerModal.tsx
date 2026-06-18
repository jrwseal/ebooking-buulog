import { useEffect, useRef, useState } from 'react'
import { X, Check, ScanLine } from 'lucide-react'
import { Html5Qrcode } from 'html5-qrcode'
import { useStore } from '../../store/useStore'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { STATUS, thaiFull } from '../../utils/datetime'
import type { Booking } from '../../types'

interface QrScannerModalProps {
  onClose: () => void
  onOpenDetail: (b: Booking) => void
}

export default function QrScannerModal({ onClose, onOpenDetail }: QrScannerModalProps) {
  const { bookings, rooms, checkIn } = useStore()
  const trapRef = useFocusTrap<HTMLDivElement>()
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const [scanning, setScanning] = useState(true)
  const [found, setFound] = useState<Booking | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [checking, setChecking] = useState(false)
  const roomName = (id: string) => rooms.find((r) => r.id === id)?.name ?? id

  useEffect(() => {
    const scanner = new Html5Qrcode('qr-reader-el')
    scannerRef.current = scanner
    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 220, height: 220 } },
      (code) => {
        scanner.stop().catch(() => {})
        setScanning(false)
        const booking = bookings.find(
          (b) => b.bookingCode === code.trim() && b.status === 'approved',
        )
        if (booking) { setFound(booking); setNotFound(false) }
        else setNotFound(true)
      },
      () => {},
    ).catch(() => {})

    return () => { scanner.stop().catch(() => {}) }
  }, [bookings])

  async function handleCheckIn() {
    if (!found) return
    setChecking(true)
    try {
      await checkIn(found.id)
      setFound((prev) => prev ? { ...prev, checkedIn: true } : prev)
    } finally {
      setChecking(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="qr-scanner-title"
        className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 id="qr-scanner-title" className="font-bold flex items-center gap-2">
            <ScanLine size={16} className="text-buu" aria-hidden="true" /> สแกน QR
          </h3>
          <button
            onClick={onClose}
            aria-label="ปิด"
            className="w-10 h-10 flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-500"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {scanning && (
            <>
              <div id="qr-reader-el" className="w-full rounded-xl overflow-hidden" />
              <p className="text-xs text-slate-400 text-center">เล็งกล้องไปที่ QR code บนหน้าจอผู้จอง</p>
            </>
          )}

          {notFound && (
            <div className="text-center py-6 space-y-2">
              <p className="text-sm font-medium text-rose-600">ไม่พบรหัสการจองนี้ในระบบ</p>
              <p className="text-xs text-slate-400">QR อาจไม่ใช่ของระบบนี้ หรือสถานะยังไม่ได้อนุมัติ</p>
              <button
                onClick={() => { setNotFound(false); setScanning(true) }}
                className="text-sm font-medium text-buu hover:underline"
              >
                สแกนอีกครั้ง
              </button>
            </div>
          )}

          {found && (
            <div className="space-y-3">
              <div className="bg-buu-tint border border-buu/20 rounded-lg p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-sm text-buu">{found.bookingCode}</span>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${STATUS[found.status].chip}`}>
                    {STATUS[found.status].label}
                  </span>
                </div>
                <p className="font-semibold text-sm">{found.title}</p>
                <p className="text-xs text-slate-500">{thaiFull(found.date)} · {found.start}–{found.end}</p>
                <p className="text-xs text-slate-500">{roomName(found.roomId)} · {found.requester}</p>
              </div>

              {found.checkedIn ? (
                <div className="flex items-center justify-center gap-2 py-3 rounded-lg bg-green-50 text-green-700 font-medium text-sm border border-green-200">
                  <Check size={16} /> เช็คอินแล้ว
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={handleCheckIn}
                    disabled={checking}
                    className="flex-1 py-2.5 rounded-lg bg-buu text-white font-semibold hover:bg-buu-dark disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    <Check size={16} aria-hidden="true" />
                    {checking ? 'กำลังบันทึก…' : 'ยืนยันการใช้ห้อง'}
                  </button>
                  <button
                    onClick={() => { onOpenDetail(found!); onClose() }}
                    className="px-3 py-2.5 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50"
                  >
                    ดูรายละเอียด
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
