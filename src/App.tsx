import { useState, useEffect, useMemo } from 'react'
import {
  Plus, Lock, LogOut, KeyRound,
  LayoutGrid, CalendarRange, CalendarDays, List, User,
  CheckCircle2, Hourglass, MapPin, X,
  ClipboardCheck, Trash2, DoorOpen, ChevronDown, GraduationCap, ScanLine, Table2,
} from 'lucide-react'
import { useFocusTrap } from './hooks/useFocusTrap'
import { useStore } from './store/useStore'
import MonthView from './components/views/MonthView'
import WeekView from './components/views/WeekView'
import DayView from './components/views/DayView'
import OverviewView from './components/views/OverviewView'
import AgendaView from './components/views/AgendaView'
import MyBookingsView from './components/views/MyBookingsView'
import BookingModal from './components/modals/BookingModal'
import BookingDetailModal from './components/modals/BookingDetailModal'
import ApprovalQueue from './components/modals/ApprovalQueue'
import ChangePinModal from './components/modals/ChangePinModal'
import RoomManagerModal from './components/modals/RoomManagerModal'
import QrScannerModal from './components/modals/QrScannerModal'
import { pad, fmtDate, todayStr } from './utils/datetime'
import type { Booking, Status } from './types'

type ViewMode = 'month' | 'week' | 'day' | 'overview' | 'agenda' | 'mine'
type ToastState = { msg: string; kind: 'ok' | 'error' }

export default function App() {
  const {
    rooms, bookings, loading,
    fetchRooms, fetchBookings, fetchPin,
    pin, updateStatus, removeBooking, changePin, clearBookings, notifyApproval,
  } = useStore()

  const [role, setRole] = useState<'requester' | 'approver'>('requester')
  const [authed, setAuthed] = useState(false)
  const [view, setView] = useState<ViewMode>('month')
  const [cursor, setCursor] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [roomFilter, setRoomFilter] = useState('all')
  const [toast, setToast] = useState<ToastState | null>(null)

  const [clearConfirm, setClearConfirm] = useState(false)
  const [showBooking, setShowBooking] = useState(false)
  const [bookingAdminMode, setBookingAdminMode] = useState(false)
  const [bookingDefaultDate, setBookingDefaultDate] = useState(todayStr)
  const [bookingDefaultRoomId, setBookingDefaultRoomId] = useState<string | null>(null)
  const [bookingDefaultHour, setBookingDefaultHour] = useState<number | undefined>(undefined)

  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
  const [showApprovals, setShowApprovals] = useState(false)
  const [pinModal, setPinModal] = useState(false)
  const [showRoomManager, setShowRoomManager] = useState(false)
  const [showQrScanner, setShowQrScanner] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [myEmail, setMyEmail] = useState(() => localStorage.getItem('ebooking_email') ?? '')

  useEffect(() => {
    void fetchRooms()
    void fetchBookings()
    void fetchPin()
  }, [fetchRooms, fetchBookings, fetchPin])

  useEffect(() => {
    if (view === 'overview' && !(role === 'approver' && authed)) setView('month')
  }, [role, authed, view])

  const flash = (msg: string, kind: 'ok' | 'error' = 'ok') => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 2600)
  }

  const pending = useMemo(
    () =>
      bookings
        .filter((b) => b.status === 'pending')
        .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)),
    [bookings],
  )

  const stats = useMemo(() => {
    const ym = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}`
    return {
      approved: bookings.filter((b) => b.status === 'approved' && b.date.startsWith(ym)).length,
      pending: pending.length,
      rooms: rooms.length,
    }
  }, [bookings, cursor, rooms, pending])

  function switchRole(r: 'requester' | 'approver') {
    if (r === 'approver' && !authed) { setLoginOpen(true); return }
    setRole(r)
  }

  function tryLogin(input: string) {
    if (input === pin) {
      setAuthed(true)
      setRole('approver')
      setLoginOpen(false)
      flash('เข้าสู่ระบบผู้อนุมัติแล้ว')
    } else {
      flash('รหัสผ่านไม่ถูกต้อง', 'error')
    }
  }

  function logout() {
    setAuthed(false)
    setRole('requester')
    flash('ออกจากระบบแล้ว')
  }

  async function handleChangePin(current: string, next: string) {
    if (current !== pin) { flash('รหัสผ่านปัจจุบันไม่ถูกต้อง', 'error'); return }
    if (next.length < 4) { flash('รหัสใหม่ต้องอย่างน้อย 4 หลัก', 'error'); return }
    try {
      await changePin(next)
      setPinModal(false)
      flash('เปลี่ยนรหัสผ่านแล้ว')
    } catch {
      flash('บันทึกไม่สำเร็จ ลองอีกครั้ง', 'error')
    }
  }

  async function handleDecide(id: string, status: Status, note: string) {
    try {
      await updateStatus(id, status, note)
      flash(status === 'approved' ? 'อนุมัติคำขอแล้ว' : 'ปฏิเสธคำขอแล้ว')
      if (status === 'approved') void notifyApproval(id)
    } catch {
      flash('บันทึกไม่สำเร็จ ลองอีกครั้ง', 'error')
    }
  }

  async function handleRemove(id: string) {
    try {
      await removeBooking(id)
      flash('ลบรายการแล้ว')
    } catch {
      flash('ลบไม่สำเร็จ ลองอีกครั้ง', 'error')
    }
  }

  async function handleClearAll() {
    try {
      await clearBookings()
      setClearConfirm(false)
      flash('ล้างข้อมูลแล้ว')
    } catch {
      flash('ล้างไม่สำเร็จ ลองอีกครั้ง', 'error')
    }
  }

  function openBooking(date: string, roomId?: string | null, hour?: number) {
    setBookingAdminMode(false)
    setBookingDefaultDate(date)
    setBookingDefaultRoomId(roomId ?? null)
    setBookingDefaultHour(hour)
    setShowBooking(true)
  }

  function openTeacherSchedule() {
    setBookingAdminMode(true)
    setBookingDefaultDate(todayStr)
    setBookingDefaultRoomId(null)
    setBookingDefaultHour(undefined)
    setShowBooking(true)
  }

  function openDetail(b: Booking) {
    setSelectedBooking(b)
  }

  function handleNewBooking() {
    setSelectedDate(fmtDate(new Date()))
    openBooking(todayStr)
  }

  if (loading && rooms.length === 0 && bookings.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 text-sm">
        กำลังโหลดข้อมูลการจอง…
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Loading bar — shows on re-fetch after initial load */}
      {loading && (rooms.length > 0 || bookings.length > 0) && (
        <div className="fixed top-0 inset-x-0 h-0.5 z-50 bg-buu/20 overflow-hidden motion-safe:animate-pulse">
          <div className="h-full bg-buu w-1/2 motion-safe:animate-[slide_1.2s_ease-in-out_infinite]" />
        </div>
      )}

      {/* ── Header ── */}
      <header className="bg-buu text-white">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 mr-auto">
            <img
              src="/buulog.png"
              alt="คณะโลจิสติกส์ มหาวิทยาลัยบูรพา"
              width="40"
              height="40"
              className="h-10 w-auto object-contain"
            />
            <div className="border-l border-white/25 pl-3">
              <h1 className="text-sm sm:text-base font-bold leading-tight">ระบบจองห้องเรียน</h1>
              <p className="text-buu-on-muted text-xs">คณะโลจิสติกส์</p>
            </div>
          </div>

          <div className="flex items-center bg-white/10 rounded-lg p-0.5 text-sm">
            <button
              onClick={() => switchRole('requester')}
              className={`px-3 py-1.5 rounded-md font-medium transition ${
                role === 'requester' ? 'bg-white text-buu' : 'text-buu-on hover:text-white'
              }`}
            >
              ผู้จอง
            </button>
            <button
              onClick={() => switchRole('approver')}
              className={`px-3 py-1.5 rounded-md font-medium transition flex items-center gap-1 ${
                role === 'approver' ? 'bg-white text-buu' : 'text-buu-on hover:text-white'
              }`}
            >
              {!authed && <Lock size={13} />} ผู้อนุมัติ
            </button>
          </div>

          {role === 'approver' && authed && (
            <button
              onClick={logout}
              title="ออกจากระบบ"
              className="text-buu-on hover:text-white p-2 rounded-md hover:bg-white/10"
            >
              <LogOut size={17} />
            </button>
          )}

          <button
            onClick={handleNewBooking}
            className="flex items-center gap-1.5 bg-amber-400 hover:bg-amber-300 text-buu font-semibold text-sm px-3.5 py-2 rounded-lg transition"
          >
            <Plus size={17} /> จองห้อง
          </button>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="max-w-6xl mx-auto px-4 py-5">
        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-5">
          <StatCard
            icon={<CheckCircle2 size={18} />}
            value={stats.approved}
            label="อนุมัติแล้ว (เดือนนี้)"
            tone="text-green-700 bg-green-50"
          />
          <StatCard
            icon={<Hourglass size={18} />}
            value={stats.pending}
            label="รออนุมัติทั้งหมด"
            tone="text-amber-700 bg-amber-50"
          />
          <StatCard
            icon={<MapPin size={18} />}
            value={stats.rooms}
            label="ห้องในระบบ"
            tone="text-buu bg-buu-tint"
          />
        </div>

        {/* Tab bar + admin toolbar */}
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <div
            role="tablist"
            aria-label="มุมมองตาราง"
            className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5"
            onKeyDown={(e) => {
              const modes: ViewMode[] = role === 'approver' && authed
                ? ['overview', 'day', 'week', 'month', 'agenda', 'mine']
                : ['day', 'week', 'month', 'agenda', 'mine']
              const i = modes.indexOf(view)
              if (e.key === 'ArrowRight') { e.preventDefault(); setView(modes[(i + 1) % modes.length]) }
              else if (e.key === 'ArrowLeft') { e.preventDefault(); setView(modes[(i + modes.length - 1) % modes.length]) }
            }}
          >
            {role === 'approver' && authed && (
              <ToolTab id="tab-overview" controls="panel-overview" active={view === 'overview'} onClick={() => setView('overview')} icon={<Table2 size={15} aria-hidden="true" />} label="ภาพรวม" />
            )}
            <ToolTab id="tab-day" controls="panel-day" active={view === 'day'} onClick={() => setView('day')} icon={<CalendarDays size={15} aria-hidden="true" />} label="วัน" />
            <ToolTab id="tab-week" controls="panel-week" active={view === 'week'} onClick={() => setView('week')} icon={<CalendarRange size={15} aria-hidden="true" />} label="สัปดาห์" />
            <ToolTab id="tab-month" controls="panel-month" active={view === 'month'} onClick={() => setView('month')} icon={<LayoutGrid size={15} aria-hidden="true" />} label="เดือน" />
            <ToolTab id="tab-agenda" controls="panel-agenda" active={view === 'agenda'} onClick={() => setView('agenda')} icon={<List size={15} aria-hidden="true" />} label="รายการ" />
            <ToolTab id="tab-mine" controls="panel-mine" active={view === 'mine'} onClick={() => setView('mine')} icon={<User size={15} aria-hidden="true" />} label="ของฉัน" />
          </div>

          {role === 'approver' && authed && (
            <>
              <button
                onClick={openTeacherSchedule}
                className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 min-h-[44px] sm:min-h-0 rounded-lg bg-white border border-slate-200 hover:border-buu-subtle hover:text-buu transition"
              >
                <GraduationCap size={16} aria-hidden="true" /> ตารางสอน
              </button>
              <button
                onClick={() => setShowQrScanner(true)}
                className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 min-h-[44px] sm:min-h-0 rounded-lg bg-white border border-slate-200 hover:border-buu-subtle hover:text-buu transition"
              >
                <ScanLine size={16} aria-hidden="true" /> สแกน QR
              </button>
              <button
                onClick={() => setShowApprovals(true)}
                className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 min-h-[44px] sm:min-h-0 rounded-lg bg-white border border-slate-200 hover:border-buu-subtle hover:text-buu transition"
              >
                <ClipboardCheck size={16} aria-hidden="true" /> คำขอรออนุมัติ
                {pending.length > 0 && (
                  <span className="ml-0.5 bg-amber-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5 leading-none">
                    {pending.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setShowRoomManager(true)}
                className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 min-h-[44px] sm:min-h-0 rounded-lg bg-white border border-slate-200 hover:border-buu-subtle hover:text-buu transition"
              >
                <DoorOpen size={16} aria-hidden="true" /> ห้อง
              </button>
              <button
                onClick={() => setPinModal(true)}
                className="flex items-center gap-1.5 text-sm px-3 py-2 min-h-[44px] sm:min-h-0 rounded-lg bg-white border border-slate-200 hover:border-slate-300 text-slate-600 transition"
              >
                <KeyRound size={15} aria-hidden="true" /> รหัสผ่าน
              </button>
            </>
          )}



          {role === 'approver' && authed && (
            clearConfirm ? (
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-xs text-slate-500">ล้างทั้งหมด?</span>
                <button
                  onClick={() => void handleClearAll()}
                  className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition"
                >
                  ยืนยัน
                </button>
                <button
                  onClick={() => setClearConfirm(false)}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
                >
                  ยกเลิก
                </button>
              </div>
            ) : (
              <button
                onClick={() => setClearConfirm(true)}
                className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg text-slate-400 hover:text-rose-600 transition ml-auto"
              >
                <Trash2 size={15} aria-hidden="true" /> ล้างข้อมูล
              </button>
            )
          )}
        </div>

        {/* Room filter */}
        <div className="relative inline-flex items-center min-h-[44px] mb-3">
          <select
            value={roomFilter}
            onChange={(e) => setRoomFilter(e.target.value)}
            className="appearance-none text-sm font-medium text-slate-600 bg-transparent pr-5 py-2 cursor-pointer outline-none hover:text-slate-900 transition"
          >
            <option value="all">ทุกห้อง</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <ChevronDown size={13} className="pointer-events-none absolute right-0 text-slate-400" />
        </div>

        {/* Views */}
        {view === 'month' && (
          <div id="panel-month" role="tabpanel" aria-labelledby="tab-month">
            <MonthView
              cursor={cursor}
              setCursor={setCursor}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              role={role}
              roomFilter={roomFilter}
              onSwitchToDayView={() => setView('day')}
              onBookRoom={openBooking}
            />
          </div>
        )}
        {view === 'week' && (
          <div id="panel-week" role="tabpanel" aria-labelledby="tab-week">
            <WeekView
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              role={role}
              roomFilter={roomFilter}
              onBookRoom={openBooking}
              onOpenDetail={openDetail}
            />
          </div>
        )}
        {view === 'day' && (
          <div id="panel-day" role="tabpanel" aria-labelledby="tab-day">
            <DayView
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              role={role}
              roomFilter={roomFilter}
              onBookRoom={openBooking}
              onOpenDetail={openDetail}
            />
          </div>
        )}
        {view === 'overview' && (
          <div id="panel-overview" role="tabpanel" aria-labelledby="tab-overview">
            <OverviewView
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              role={role}
              onBookRoom={openBooking}
              onOpenDetail={openDetail}
            />
          </div>
        )}
        {view === 'agenda' && (
          <div id="panel-agenda" role="tabpanel" aria-labelledby="tab-agenda">
            <AgendaView role={role} onOpenDetail={openDetail} />
          </div>
        )}
        {view === 'mine' && (
          <div id="panel-mine" role="tabpanel" aria-labelledby="tab-mine">
            <MyBookingsView onOpenDetail={openDetail} />
          </div>
        )}
      </main>

      {/* Booking modal */}
      {showBooking && (
        <BookingModal
          defaultDate={bookingDefaultDate}
          defaultRoomId={bookingDefaultRoomId}
          defaultHour={bookingDefaultHour}
          adminMode={bookingAdminMode}
          onClose={() => setShowBooking(false)}
          onSuccess={(msg) => {
            flash(msg)
            setMyEmail(localStorage.getItem('ebooking_email') ?? '')
          }}
          onError={(msg) => flash(msg, 'error')}
        />
      )}

      {/* Detail modal */}
      {selectedBooking && (
        <BookingDetailModal
          booking={selectedBooking}
          role={role}
          isOwner={selectedBooking.email === myEmail}
          onClose={() => setSelectedBooking(null)}
          onDecide={async (id, status, note) => {
            await handleDecide(id, status, note)
            setSelectedBooking(null)
          }}
          onRemove={async (id) => {
            await handleRemove(id)
            setSelectedBooking(null)
          }}
          onError={(msg) => flash(msg, 'error')}
        />
      )}

      {/* Approval queue */}
      {showApprovals && (
        <ApprovalQueue
          onClose={() => setShowApprovals(false)}
          onDecide={async (id, status, note) => {
            await handleDecide(id, status, note)
          }}
        />
      )}

      {/* Room manager modal */}
      {showRoomManager && (
        <RoomManagerModal onClose={() => setShowRoomManager(false)} />
      )}

      {/* QR scanner modal */}
      {showQrScanner && (
        <QrScannerModal
          onClose={() => setShowQrScanner(false)}
          onOpenDetail={(b) => { setShowQrScanner(false); openDetail(b) }}
        />
      )}

      {/* Change PIN modal */}
      {pinModal && (
        <ChangePinModal
          onClose={() => setPinModal(false)}
          onSubmit={(current, next) => void handleChangePin(current, next)}
        />
      )}

      {/* Admin login modal */}
      {loginOpen && (
        <LoginModal
          onClose={() => setLoginOpen(false)}
          onSubmit={tryLogin}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg text-white text-sm font-medium shadow-lg ${
            toast.kind === 'error' ? 'bg-rose-600' : 'bg-slate-800'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Screen-reader announcements */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {toast?.msg}
      </div>
    </div>
  )
}

// ── Sub-components ──

function StatCard({
  icon, value, label, tone,
}: {
  icon: React.ReactNode
  value: number
  label: string
  tone: string
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-2 sm:p-4">
      <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center mb-2 ${tone}`}>{icon}</div>
      <div className="text-xl sm:text-2xl font-bold leading-none">{value}</div>
      <div className="text-[11px] sm:text-xs text-slate-500 mt-1 leading-tight">{label}</div>
    </div>
  )
}


function ToolTab({
  active, onClick, icon, label, id, controls,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  id?: string
  controls?: string
}) {
  return (
    <button
      id={id}
      role="tab"
      aria-selected={active}
      aria-controls={controls}
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 min-h-[44px] sm:min-h-0 rounded-md text-sm font-medium transition ${
        active ? 'bg-buu text-white' : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      {icon} {label}
    </button>
  )
}

function LoginModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (pin: string) => void }) {
  const [input, setInput] = useState('')
  const trapRef = useFocusTrap<HTMLDivElement>()
  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-modal-title"
        className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 id="login-modal-title" className="font-bold">เข้าสู่ระบบผู้อนุมัติ</h3>
          <button
            onClick={onClose}
            aria-label="ปิด"
            className="w-10 h-10 flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-500"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-sm text-slate-500 flex items-center gap-2">
            <Lock size={15} className="text-buu" /> เฉพาะผู้มีสิทธิ์อนุมัติเท่านั้น
          </p>
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">รหัสผ่าน</span>
            <input
              type="password"
              value={input}
              autoFocus
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSubmit(input)}
              placeholder="กรอกรหัสผ่าน"
              className="input"
            />
          </label>
          <button
            onClick={() => onSubmit(input)}
            className="w-full py-2.5 rounded-lg bg-buu text-white font-semibold hover:bg-buu-dark"
          >
            เข้าสู่ระบบ
          </button>
        </div>
      </div>
    </div>
  )
}
