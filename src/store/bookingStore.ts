import { create } from 'zustand'
import type { Booking, Room } from '../types'

interface BookingStore {
  rooms: Room[]
  bookings: Booking[]
  isAdmin: boolean
}

export const useBookingStore = create<BookingStore>(() => ({
  rooms: [],
  bookings: [],
  isAdmin: false,
}))
