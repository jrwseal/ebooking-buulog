import { useState } from 'react'
import { X, Plus, Trash2, AlertCircle } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import type { Room } from '../../types'

const ROOM_TYPES = ['บรรยาย', 'สัมมนา', 'แล็บ', 'ปฏิบัติการ', 'ประชุม']

const EMPTY: Omit<Room, never> = { id: '', name: '', type: 'บรรยาย', capacity: 30 }

export default function RoomManagerModal({ onClose }: { onClose(): void }) {
  const { rooms, addRoom, removeRoom } = useStore()
  const trapRef = useFocusTrap<HTMLDivElement>()
  const [form, setForm] = useState(EMPTY)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  function setField<K extends keyof Room>(k: K, v: Room[K]) {
    setForm((f) => ({ ...f, [k]: v }))
    setErr('')
  }

  async function handleAdd() {
    const id = form.id.trim().toUpperCase()
    const name = form.name.trim()
    if (!id) { setErr('กรอกรหัสห้อง'); return }
    if (!name) { setErr('กรอกชื่อห้อง'); return }
    if (rooms.some((r) => r.id === id)) { setErr(`รหัส ${id} มีอยู่แล้ว`); return }
    if (form.capacity < 1) { setErr('ความจุต้องมากกว่า 0'); return }
    setBusy(true)
    try {
      await addRoom({ id, name, type: form.type, capacity: Number(form.capacity) })
      setForm(EMPTY)
    } catch {
      setErr('เพิ่มไม่สำเร็จ ลองอีกครั้ง')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(id: string, name: string) {
    if (!window.confirm(`ลบ "${name}"?\nการจองที่อ้างถึงห้องนี้อาจได้รับผลกระทบ`)) return
    setBusy(true)
    try {
      await removeRoom(id)
    } catch {
      setErr(`ลบไม่สำเร็จ — อาจมีการจองที่อ้างถึง ${id} อยู่`)
    } finally {
      setBusy(false)
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
        aria-labelledby="room-manager-title"
        className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
          <h3 id="room-manager-title" className="font-bold">จัดการห้อง</h3>
          <button
            onClick={onClose}
            aria-label="ปิด"
            className="w-10 h-10 flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-500"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {/* Room list */}
          <div className="space-y-0.5">
            {rooms.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-slate-50 group"
              >
                <span className="font-mono text-xs text-slate-400 shrink-0 w-20">{r.id}</span>
                <span className="text-sm font-medium flex-1 min-w-0 truncate">{r.name}</span>
                <span className="text-xs text-slate-400 shrink-0">{r.type} · {r.capacity} ที่นั่ง</span>
                <button
                  onClick={() => void handleRemove(r.id, r.name)}
                  disabled={busy}
                  className="w-9 h-9 flex items-center justify-center rounded-md text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-30"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {rooms.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-4">ยังไม่มีห้อง</p>
            )}
          </div>

          {/* Add form */}
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">เพิ่มห้องใหม่</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="block text-xs font-medium text-slate-500 mb-1">
                  รหัสห้อง <span className="text-rose-400">*</span>
                </span>
                <input
                  className="input"
                  placeholder="เช่น LOG-301"
                  value={form.id}
                  onChange={(e) => setField('id', e.target.value)}
                />
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-slate-500 mb-1">
                  ความจุ (ที่นั่ง) <span className="text-rose-400">*</span>
                </span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={form.capacity}
                  onChange={(e) => setField('capacity', Number(e.target.value))}
                />
              </label>
            </div>
            <label className="block">
              <span className="block text-xs font-medium text-slate-500 mb-1">
                ชื่อห้อง <span className="text-rose-400">*</span>
              </span>
              <input
                className="input"
                placeholder="เช่น ห้องบรรยาย 301"
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void handleAdd()}
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-500 mb-1">ประเภท</span>
              <select
                className="input"
                value={form.type}
                onChange={(e) => setField('type', e.target.value)}
              >
                {ROOM_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>

            {err && (
              <p className="flex items-center gap-1.5 text-sm text-rose-600">
                <AlertCircle size={14} /> {err}
              </p>
            )}

            <button
              onClick={() => void handleAdd()}
              disabled={busy}
              className="flex items-center gap-1.5 w-full justify-center py-2.5 rounded-lg bg-[#1b3a6b] text-white font-semibold hover:bg-[#122a52] disabled:opacity-50 transition"
            >
              <Plus size={16} /> เพิ่มห้อง
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
