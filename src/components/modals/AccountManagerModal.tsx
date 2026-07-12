import { useState } from 'react'
import { X, Plus, Trash2, AlertCircle, ShieldCheck } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { useFocusTrap } from '../../hooks/useFocusTrap'

interface AccountManagerModalProps {
  onClose: () => void
  currentUsername: string
}

const EMPTY = { username: '', displayName: '', password: '', isAdmin: false }

export default function AccountManagerModal({ onClose, currentUsername }: AccountManagerModalProps) {
  const { approvers, addApprover, removeApprover, setApproverActive } = useStore()
  const trapRef = useFocusTrap<HTMLDivElement>()
  const [form, setForm] = useState(EMPTY)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const activeAdminCount = approvers.filter((a) => a.isAdmin && a.active).length

  function setField<K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
    setErr('')
  }

  async function handleAdd() {
    const username = form.username.trim()
    const displayName = form.displayName.trim()
    if (!username) { setErr('กรอกชื่อผู้ใช้'); return }
    if (!displayName) { setErr('กรอกชื่อที่แสดง'); return }
    if (form.password.length < 4) { setErr('รหัสผ่านต้องอย่างน้อย 4 หลัก'); return }
    if (approvers.some((a) => a.username.toLowerCase() === username.toLowerCase())) {
      setErr(`ชื่อผู้ใช้ ${username} มีอยู่แล้ว`)
      return
    }
    setBusy(true)
    try {
      await addApprover(username, displayName, form.password, form.isAdmin)
      setForm(EMPTY)
    } catch {
      setErr('เพิ่มไม่สำเร็จ ลองอีกครั้ง')
    } finally {
      setBusy(false)
    }
  }

  async function handleToggleActive(id: string, username: string, isAdmin: boolean, active: boolean) {
    if (username === currentUsername) { setErr('ปิดการใช้งานบัญชีตัวเองไม่ได้'); return }
    if (active && isAdmin && activeAdminCount <= 1) { setErr('ต้องมีแอดมินที่ใช้งานได้อย่างน้อย 1 คน'); return }
    setBusy(true)
    try {
      await setApproverActive(id, !active)
    } catch {
      setErr('บันทึกไม่สำเร็จ ลองอีกครั้ง')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(id: string, username: string, isAdmin: boolean) {
    if (username === currentUsername) { setErr('ลบบัญชีตัวเองไม่ได้'); return }
    if (isAdmin && activeAdminCount <= 1) { setErr('ต้องมีแอดมินที่ใช้งานได้อย่างน้อย 1 คน'); return }
    if (deleteConfirmId !== id) { setDeleteConfirmId(id); return }
    setDeleteConfirmId(null)
    setBusy(true)
    try {
      await removeApprover(id)
    } catch {
      setErr('ลบไม่สำเร็จ ลองอีกครั้ง')
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
        aria-labelledby="account-manager-title"
        className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
          <h3 id="account-manager-title" className="font-bold">จัดการบัญชีผู้อนุมัติ</h3>
          <button
            onClick={onClose}
            aria-label="ปิด"
            className="w-10 h-10 flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-500"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          <div className="space-y-0.5">
            {approvers.map((a) => (
              <div key={a.id} className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-slate-50 group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium truncate">{a.displayName}</span>
                    {a.isAdmin && (
                      <span className="flex items-center gap-0.5 text-[10px] font-bold text-buu bg-buu-tint px-1.5 py-0.5 rounded">
                        <ShieldCheck size={10} /> แอดมิน
                      </span>
                    )}
                    {a.username === currentUsername && (
                      <span className="text-[10px] text-slate-400">(คุณ)</span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 font-mono">{a.username}</span>
                </div>
                <label className="flex items-center gap-1.5 text-xs text-slate-500 shrink-0">
                  <input
                    type="checkbox"
                    checked={a.active}
                    disabled={busy}
                    onChange={() => void handleToggleActive(a.id, a.username, a.isAdmin, a.active)}
                    className="w-4 h-4 accent-buu rounded"
                  />
                  ใช้งาน
                </label>
                {deleteConfirmId === a.id ? (
                  <div className="flex items-center gap-2 shrink-0 text-xs">
                    <button
                      onClick={() => void handleRemove(a.id, a.username, a.isAdmin)}
                      className="font-medium text-rose-600 hover:underline"
                    >
                      ลบ
                    </button>
                    <button onClick={() => setDeleteConfirmId(null)} className="text-slate-400 hover:text-slate-600">
                      ยกเลิก
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => void handleRemove(a.id, a.username, a.isAdmin)}
                    disabled={busy}
                    aria-label={`ลบ ${a.displayName}`}
                    className="w-9 h-9 flex items-center justify-center rounded-md text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 focus:opacity-100 disabled:opacity-30"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
            {approvers.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-4">ยังไม่มีบัญชี</p>
            )}
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">เพิ่มบัญชีใหม่</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="block text-xs font-medium text-slate-500 mb-1">
                  ชื่อผู้ใช้ <span className="text-rose-400">*</span>
                </span>
                <input
                  className="input"
                  placeholder="เช่น kanya.k"
                  value={form.username}
                  onChange={(e) => setField('username', e.target.value)}
                />
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-slate-500 mb-1">
                  ชื่อที่แสดง <span className="text-rose-400">*</span>
                </span>
                <input
                  className="input"
                  placeholder="เช่น กัญญา คงดี"
                  value={form.displayName}
                  onChange={(e) => setField('displayName', e.target.value)}
                />
              </label>
            </div>
            <label className="block">
              <span className="block text-xs font-medium text-slate-500 mb-1">
                รหัสผ่าน (อย่างน้อย 4 หลัก) <span className="text-rose-400">*</span>
              </span>
              <input
                className="input"
                type="password"
                value={form.password}
                onChange={(e) => setField('password', e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void handleAdd()}
              />
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.isAdmin}
                onChange={(e) => setField('isAdmin', e.target.checked)}
                className="w-4 h-4 accent-buu rounded"
              />
              <span className="text-sm text-slate-600">เป็นแอดมิน (จัดการบัญชีอื่นได้)</span>
            </label>

            {err && (
              <p className="flex items-center gap-1.5 text-sm text-rose-600">
                <AlertCircle size={14} aria-hidden="true" /> {err}
              </p>
            )}

            <button
              onClick={() => void handleAdd()}
              disabled={busy}
              className="flex items-center gap-1.5 w-full justify-center py-2.5 rounded-lg bg-buu text-white font-semibold hover:bg-buu-dark disabled:opacity-50 transition"
            >
              <Plus size={16} aria-hidden="true" /> เพิ่มบัญชี
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
