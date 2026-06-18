import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { Booking, Room, Status } from '../types'

// ---- DB row shape --------------------------------------------------------

interface BookingRow {
  id: string
  room_id: string
  title: string
  requester: string
  date: string
  start_time: string
  end_time: string
  purpose: string
  status: string
  review_note: string
  created_at: string
}

// ---- Public input type ---------------------------------------------------

export type BookingInput = Omit<Booking, 'id' | 'status' | 'reviewNote' | 'createdAt'>

// ---- Mappers -------------------------------------------------------------

function rowToBooking(row: BookingRow): Booking {
  return {
    id: row.id,
    roomId: row.room_id,
    title: row.title,
    requester: row.requester,
    date: row.date,
    start: row.start_time,
    end: row.end_time,
    purpose: row.purpose,
    status: row.status as Status,
    reviewNote: row.review_note,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  }
}

function inputToRow(input: BookingInput) {
  return {
    room_id: input.roomId,
    title: input.title,
    requester: input.requester,
    date: input.date,
    start_time: input.start,
    end_time: input.end,
    purpose: input.purpose,
    status: 'pending' as const,
    review_note: '',
  }
}

// ---- Store ---------------------------------------------------------------

interface StoreState {
  rooms: Room[]
  bookings: Booking[]
  loading: boolean
  pin: string

  fetchRooms(): Promise<void>
  fetchBookings(from?: string, to?: string): Promise<void>
  fetchPin(): Promise<void>
  addBooking(input: BookingInput): Promise<void>
  addSchedule(input: BookingInput): Promise<void>
  updateStatus(id: string, status: Status, note?: string): Promise<void>
  removeBooking(id: string): Promise<void>
  addRoom(room: Room): Promise<void>
  removeRoom(id: string): Promise<void>
  changePin(next: string): Promise<void>
  clearBookings(): Promise<void>
}

export const useStore = create<StoreState>((set) => ({
  rooms: [],
  bookings: [],
  loading: false,
  pin: '123456',

  async fetchRooms() {
    set({ loading: true })
    try {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .order('id')
      if (error) throw error
      set({ rooms: (data ?? []) as Room[] })
    } catch (err) {
      console.error('[fetchRooms]', err)
    } finally {
      set({ loading: false })
    }
  },

  async fetchBookings(from?: string, to?: string) {
    set({ loading: true })
    try {
      let query = supabase
        .from('bookings')
        .select('*')
        .order('date')
        .order('start_time')
      if (from) query = query.gte('date', from)
      if (to)   query = query.lte('date', to)
      const { data, error } = await query
      if (error) throw error
      set({ bookings: ((data ?? []) as BookingRow[]).map(rowToBooking) })
    } catch (err) {
      console.error('[fetchBookings]', err)
    } finally {
      set({ loading: false })
    }
  },

  async fetchPin() {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'approver_pin')
        .single()
      if (error) throw error
      if (data?.value) set({ pin: data.value as string })
    } catch (err) {
      console.error('[fetchPin]', err)
    }
  },

  async addBooking(input: BookingInput) {
    set({ loading: true })
    try {
      const { data, error } = await supabase
        .from('bookings')
        .insert(inputToRow(input))
        .select()
        .single()
      if (error) throw error
      const booking = rowToBooking(data as BookingRow)
      set((state) => ({ bookings: [...state.bookings, booking] }))
    } catch (err) {
      console.error('[addBooking]', err)
      throw err
    } finally {
      set({ loading: false })
    }
  },

  async addSchedule(input: BookingInput) {
    set({ loading: true })
    try {
      const { data: inserted, error: e1 } = await supabase
        .from('bookings')
        .insert(inputToRow(input))
        .select()
        .single()
      if (e1) throw e1
      const { data: approved, error: e2 } = await supabase
        .from('bookings')
        .update({ status: 'approved', review_note: 'ตารางสอนอาจารย์' })
        .eq('id', (inserted as BookingRow).id)
        .select()
        .single()
      if (e2) throw e2
      set((state) => ({ bookings: [...state.bookings, rowToBooking(approved as BookingRow)] }))
    } catch (err) {
      console.error('[addSchedule]', err)
      throw err
    } finally {
      set({ loading: false })
    }
  },

  async updateStatus(id: string, status: Status, note = '') {
    set({ loading: true })
    try {
      const { data, error } = await supabase
        .from('bookings')
        .update({ status, review_note: note })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      const updated = rowToBooking(data as BookingRow)
      set((state) => ({
        bookings: state.bookings.map((b) => (b.id === id ? updated : b)),
      }))
    } catch (err) {
      console.error('[updateStatus]', err)
      throw err
    } finally {
      set({ loading: false })
    }
  },

  async removeBooking(id: string) {
    set({ loading: true })
    try {
      const { error } = await supabase
        .from('bookings')
        .delete()
        .eq('id', id)
      if (error) throw error
      set((state) => ({
        bookings: state.bookings.filter((b) => b.id !== id),
      }))
    } catch (err) {
      console.error('[removeBooking]', err)
      throw err
    } finally {
      set({ loading: false })
    }
  },

  async addRoom(room: Room) {
    set({ loading: true })
    try {
      const { data, error } = await supabase
        .from('rooms')
        .insert({ id: room.id, name: room.name, type: room.type, capacity: room.capacity })
        .select()
        .single()
      if (error) throw error
      set((state) => ({
        rooms: [...state.rooms, data as Room].sort((a, b) => a.id.localeCompare(b.id)),
      }))
    } catch (err) {
      console.error('[addRoom]', err)
      throw err
    } finally {
      set({ loading: false })
    }
  },

  async removeRoom(id: string) {
    set({ loading: true })
    try {
      const { error } = await supabase.from('rooms').delete().eq('id', id)
      if (error) throw error
      set((state) => ({ rooms: state.rooms.filter((r) => r.id !== id) }))
    } catch (err) {
      console.error('[removeRoom]', err)
      throw err
    } finally {
      set({ loading: false })
    }
  },

  async changePin(next: string) {
    const { error } = await supabase
      .from('settings')
      .update({ value: next })
      .eq('key', 'approver_pin')
    if (error) throw error
    set({ pin: next })
  },

  async clearBookings() {
    set({ loading: true })
    try {
      const { error } = await supabase
        .from('bookings')
        .delete()
        .in('status', ['pending', 'approved', 'rejected'])
      if (error) throw error
      set({ bookings: [] })
    } catch (err) {
      console.error('[clearBookings]', err)
      throw err
    } finally {
      set({ loading: false })
    }
  },
}))
