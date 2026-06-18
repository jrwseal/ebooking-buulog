import { useState } from 'react'
import { X, KeyRound } from 'lucide-react'
import { useFocusTrap } from '../../hooks/useFocusTrap'

interface ChangePinModalProps {
  onClose: () => void
  onSubmit: (current: string, next: string) => void
}

export default function ChangePinModal({ onClose, onSubmit }: ChangePinModalProps) {
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
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
        aria-labelledby="change-pin-title"
        className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className="sticky top-0 bg-white flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 id="change-pin-title" className="font-bold flex items-center gap-2">
            <KeyRound size={16} className="text-buu" aria-hidden="true" /> เปลี่ยนรหัสผ่าน
          </h3>
          <button
            onClick={onClose}
            aria-label="ปิด"
            className="w-10 h-10 flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-500"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">รหัสผ่านปัจจุบัน</span>
            <input
              type="password"
              value={cur}
              autoFocus
              onChange={(e) => setCur(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSubmit(cur, next)}
              className="input"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">
              รหัสผ่านใหม่ (อย่างน้อย 4 หลัก)
            </span>
            <input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSubmit(cur, next)}
              className="input"
            />
          </label>
          <button
            onClick={() => onSubmit(cur, next)}
            className="w-full py-2.5 min-h-[44px] rounded-lg bg-buu text-white font-semibold hover:bg-buu-dark"
          >
            บันทึกรหัสใหม่
          </button>
          <p className="text-xs text-slate-400">รหัสจะถูกบันทึกใน Supabase settings table</p>
        </div>
      </div>
    </div>
  )
}
