import type { Room } from '../types'

export const START_H = 8
export const END_H = 20
export const PXPM = 0.8
export const HOUR_H = 60 * PXPM        // 48px per hour
export const BODY_H = (END_H - START_H) * HOUR_H  // 576px
export const HEAD_H = 38
export const HOURS = Array.from({ length: END_H - START_H + 1 }, (_, i) => START_H + i)

export const DEFAULT_ROOMS: Room[] = [
  { id: 'LOG-101',  name: 'ห้องบรรยาย 101',               type: 'บรรยาย',      capacity: 40 },
  { id: 'LOG-102',  name: 'ห้องบรรยาย 102',               type: 'บรรยาย',      capacity: 40 },
  { id: 'LOG-201',  name: 'ห้องสัมมนา 201',               type: 'สัมมนา',      capacity: 25 },
  { id: 'LOG-LAB',  name: 'ห้องปฏิบัติการคอมพิวเตอร์',    type: 'แล็บ',        capacity: 30 },
  { id: 'LOG-SIM',  name: 'ห้องจำลองคลังสินค้า',          type: 'ปฏิบัติการ',  capacity: 20 },
  { id: 'LOG-MEET', name: 'ห้องประชุมคณะ',                type: 'ประชุม',      capacity: 15 },
]
