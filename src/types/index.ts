export type Status = 'pending' | 'approved' | 'rejected'

export interface Room {
  id: string
  name: string
  type: string
  capacity: number
}

export interface Booking {
  id: string
  roomId: string
  title: string
  requester: string
  email: string
  date: string
  start: string
  end: string
  purpose: string
  status: Status
  reviewNote: string
  bookingCode: string
  checkedIn: boolean
  createdAt: number
}
