import type { Status } from '../types'

export const TH_DAYS: readonly string[] = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']
export const TH_DAYS_FULL: readonly string[] = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']
export const TH_MONTHS: readonly string[] = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

export const STATUS: Record<Status, { label: string; chip: string; dot: string }> = {
  pending:  { label: 'รออนุมัติ',   chip: 'bg-amber-100 text-amber-800 border-amber-200',           dot: 'oklch(67% 0.18 58)' },
  approved: { label: 'อนุมัติแล้ว', chip: 'bg-green-100 text-green-800 border-green-200',           dot: 'oklch(53% 0.15 150)' },
  rejected: { label: 'ไม่อนุมัติ',  chip: 'bg-rose-50 text-rose-700 border-rose-200 line-through', dot: 'oklch(59% 0.25 15)' },
}

export const pad = (n: number): string => String(n).padStart(2, '0')

export const fmtDate = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const todayStr = fmtDate(new Date())

export const toMin = (t: string): number => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export const overlaps = (s1: string, e1: string, s2: string, e2: string): boolean =>
  toMin(s1) < toMin(e2) && toMin(s2) < toMin(e1)

export function thaiFull(str: string): string {
  const [y, m, d] = str.split('-').map(Number)
  return `${d} ${TH_MONTHS[m - 1]} ${y + 543}`
}

export function parseDate(str: string): Date {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function weekDays(anchorStr: string): Date[] {
  const base = parseDate(anchorStr)
  const s = new Date(base)
  s.setDate(base.getDate() - base.getDay())
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(s)
    x.setDate(s.getDate() + i)
    return x
  })
}

export function buildMonth(cursor: Date): Date[] {
  const y = cursor.getFullYear()
  const m = cursor.getMonth()
  const firstDay = new Date(y, m, 1)
  const start = new Date(y, m, 1 - firstDay.getDay())
  const out: Date[] = []
  const d = new Date(start)
  for (let i = 0; i < 42; i++) {
    out.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }
  return out
}
