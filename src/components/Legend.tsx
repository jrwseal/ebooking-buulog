import { STATUS } from '../utils/datetime'

export default function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-xs text-slate-500 border-t border-slate-100">
      {(Object.entries(STATUS) as [keyof typeof STATUS, (typeof STATUS)[keyof typeof STATUS]][]).map(
        ([k, v]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: v.dot }} />
            {v.label}
          </span>
        ),
      )}
    </div>
  )
}
