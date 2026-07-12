// src/components/modals/LoginModal.tsx
import { useState } from 'react'
import { X, Lock } from 'lucide-react'
import { useFocusTrap } from '../../hooks/useFocusTrap'

interface LoginModalProps {
  onClose: () => void
  onSubmit: (username: string, password: string) => Promise<void>
}

export default function LoginModal({ onClose, onSubmit }: LoginModalProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const trapRef = useFocusTrap<HTMLDivElement>()

  async function submit() {
    if (!username.trim() || !password || submitting) return
    setSubmitting(true)
    try {
      await onSubmit(username.trim(), password)
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
            <span className="block text-xs font-medium text-slate-500 mb-1">ชื่อผู้ใช้</span>
            <input
              type="text"
              value={username}
              autoFocus
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void submit()}
              placeholder="ชื่อผู้ใช้"
              className="input"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">รหัสผ่าน</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void submit()}
              placeholder="กรอกรหัสผ่าน"
              className="input"
            />
          </label>
          <button
            onClick={() => void submit()}
            disabled={submitting}
            className="w-full py-2.5 rounded-lg bg-buu text-white font-semibold hover:bg-buu-dark disabled:opacity-60"
          >
            {submitting ? 'กำลังตรวจสอบ…' : 'เข้าสู่ระบบ'}
          </button>
        </div>
      </div>
    </div>
  )
}
