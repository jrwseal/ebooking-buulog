import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { randomSalt, hashPassword } from '../lib/auth/hash'
import type { Approver, Booking, Room, Status } from '../types'

// ---- DB row shape --------------------------------------------------------

interface BookingRow {
  id: string
  room_id: string
  title: string
  requester: string
  requester_email: string
  date: string
  start_time: string
  end_time: string
  purpose: string
  student_id: string
  major: string
  year_level: string
  phone: string
  course_code: string
  course_group: string
  instructor_name: string
  status: string
  review_note: string
  booking_code: string
  checked_in: boolean
  created_at: string
}

interface ApproverRow {
  id: string
  username: string
  password_hash: string
  salt: string
  display_name: string
  is_admin: boolean
  active: boolean
}

function rowToApprover(row: ApproverRow): Approver {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    salt: row.salt,
    displayName: row.display_name,
    isAdmin: row.is_admin,
    active: row.active,
  }
}

// ---- Public input type ---------------------------------------------------

export type BookingInput = Omit<Booking, 'id' | 'status' | 'reviewNote' | 'bookingCode' | 'checkedIn' | 'createdAt'>

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function generateCode(): string {
  return 'LOG-' + Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('')
}

// ---- Mappers -------------------------------------------------------------

function rowToBooking(row: BookingRow): Booking {
  return {
    id: row.id,
    roomId: row.room_id,
    title: row.title,
    requester: row.requester,
    email: row.requester_email ?? '',
    date: row.date,
    start: row.start_time,
    end: row.end_time,
    purpose: row.purpose,
    studentId: row.student_id ?? '',
    major: row.major ?? '',
    year: row.year_level ?? '',
    phone: row.phone ?? '',
    courseCode: row.course_code ?? '',
    courseGroup: row.course_group ?? '',
    instructorName: row.instructor_name ?? '',
    status: row.status as Status,
    reviewNote: row.review_note,
    bookingCode: row.booking_code ?? '',
    checkedIn: row.checked_in ?? false,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  }
}

function inputToRow(input: BookingInput) {
  return {
    room_id: input.roomId,
    title: input.title,
    requester: input.requester,
    requester_email: input.email ?? '',
    date: input.date,
    start_time: input.start,
    end_time: input.end,
    purpose: input.purpose,
    student_id: input.studentId,
    major: input.major,
    year_level: input.year,
    phone: input.phone,
    course_code: input.courseCode,
    course_group: input.courseGroup,
    instructor_name: input.instructorName,
    status: 'pending' as const,
    review_note: '',
    booking_code: generateCode(),
  }
}

// ---- Store ---------------------------------------------------------------

interface StoreState {
  rooms: Room[]
  bookings: Booking[]
  approvers: Approver[]
  loading: boolean

  fetchRooms(): Promise<void>
  fetchBookings(from?: string, to?: string): Promise<void>
  fetchApprovers(): Promise<void>
  addBooking(input: BookingInput): Promise<Booking>
  addSchedule(input: BookingInput): Promise<void>
  addSchedules(inputs: BookingInput[]): Promise<void>
  updateStatus(id: string, status: Status, note?: string): Promise<void>
  notifyStatusChange(id: string, event: 'submitted' | 'approved' | 'rejected'): Promise<void>
  notifyGmailAddress: string
  fetchEmailSettings(): Promise<void>
  saveEmailSettings(gmailAddress: string, appPassword: string): Promise<void>
  checkIn(id: string): Promise<void>
  removeBooking(id: string): Promise<void>
  addRoom(room: Room): Promise<void>
  removeRoom(id: string): Promise<void>
  addApprover(username: string, displayName: string, password: string, isAdmin: boolean): Promise<void>
  removeApprover(id: string): Promise<void>
  setApproverActive(id: string, active: boolean): Promise<void>
  changeOwnPassword(id: string, currentPassword: string, newPassword: string): Promise<void>
  clearBookings(): Promise<void>
}

export const useStore = create<StoreState>((set) => ({
  rooms: [],
  bookings: [],
  approvers: [],
  loading: false,
  notifyGmailAddress: '',

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

  async fetchApprovers() {
    try {
      const { data, error } = await supabase
        .from('approvers')
        .select('*')
        .order('username')
      if (error) throw error
      set({ approvers: ((data ?? []) as ApproverRow[]).map(rowToApprover) })
    } catch (err) {
      console.error('[fetchApprovers]', err)
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
      return booking
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

  async addSchedules(inputs: BookingInput[]) {
    if (inputs.length === 0) return
    set({ loading: true })
    try {
      const { data: inserted, error: e1 } = await supabase
        .from('bookings')
        .insert(inputs.map(inputToRow))
        .select()
      if (e1) throw e1
      const ids = (inserted as BookingRow[]).map((r) => r.id)
      const { data: approved, error: e2 } = await supabase
        .from('bookings')
        .update({ status: 'approved', review_note: 'ตารางสอนอาจารย์' })
        .in('id', ids)
        .select()
      if (e2) throw e2
      const schedules = (approved as BookingRow[]).map(rowToBooking)
      set((state) => ({ bookings: [...state.bookings, ...schedules] }))
    } catch (err) {
      console.error('[addSchedules]', err)
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

  async notifyStatusChange(id: string, event: 'submitted' | 'approved' | 'rejected') {
    try {
      await supabase.functions.invoke('send-booking-email', { body: { bookingId: id, event } })
    } catch (err) {
      console.warn('[notifyStatusChange] email send failed:', err)
    }
  },

  async fetchEmailSettings() {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'notify_gmail_address')
        .maybeSingle()
      if (error) throw error
      set({ notifyGmailAddress: data?.value ?? '' })
    } catch (err) {
      console.error('[fetchEmailSettings]', err)
    }
  },

  async saveEmailSettings(gmailAddress: string, appPassword: string) {
    const { error: settingsError } = await supabase
      .from('settings')
      .upsert({ key: 'notify_gmail_address', value: gmailAddress })
    if (settingsError) throw settingsError
    set({ notifyGmailAddress: gmailAddress })

    if (appPassword) {
      const { error: configError } = await supabase
        .from('email_config')
        .update({ gmail_app_password: appPassword, updated_at: new Date().toISOString() })
        .eq('id', 1)
      if (configError) throw configError
    }
  },

  async checkIn(id: string) {
    const { data, error } = await supabase
      .from('bookings')
      .update({ checked_in: true })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    const updated = rowToBooking(data as BookingRow)
    set((state) => ({ bookings: state.bookings.map((b) => (b.id === id ? updated : b)) }))
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

  async addApprover(username: string, displayName: string, password: string, isAdmin: boolean) {
    set({ loading: true })
    try {
      const salt = randomSalt()
      const passwordHash = await hashPassword(password, salt)
      const { data, error } = await supabase
        .from('approvers')
        .insert({
          username,
          display_name: displayName,
          password_hash: passwordHash,
          salt,
          is_admin: isAdmin,
          active: true,
        })
        .select()
        .single()
      if (error) throw error
      set((state) => ({
        approvers: [...state.approvers, rowToApprover(data as ApproverRow)].sort((a, b) => a.username.localeCompare(b.username)),
      }))
    } catch (err) {
      console.error('[addApprover]', err)
      throw err
    } finally {
      set({ loading: false })
    }
  },

  async removeApprover(id: string) {
    set({ loading: true })
    try {
      const { error } = await supabase.from('approvers').delete().eq('id', id)
      if (error) throw error
      set((state) => ({ approvers: state.approvers.filter((a) => a.id !== id) }))
    } catch (err) {
      console.error('[removeApprover]', err)
      throw err
    } finally {
      set({ loading: false })
    }
  },

  async setApproverActive(id: string, active: boolean) {
    set({ loading: true })
    try {
      const { error } = await supabase.from('approvers').update({ active }).eq('id', id)
      if (error) throw error
      set((state) => ({
        approvers: state.approvers.map((a) => (a.id === id ? { ...a, active } : a)),
      }))
    } catch (err) {
      console.error('[setApproverActive]', err)
      throw err
    } finally {
      set({ loading: false })
    }
  },

  async changeOwnPassword(id: string, currentPassword: string, newPassword: string) {
    const { data, error } = await supabase.from('approvers').select('*').eq('id', id).single()
    if (error) throw error
    const row = data as ApproverRow
    const currentHash = await hashPassword(currentPassword, row.salt)
    if (currentHash !== row.password_hash) throw new Error('current password mismatch')
    const salt = randomSalt()
    const passwordHash = await hashPassword(newPassword, salt)
    const { error: updateError } = await supabase
      .from('approvers')
      .update({ password_hash: passwordHash, salt })
      .eq('id', id)
    if (updateError) throw updateError
    set((state) => ({
      approvers: state.approvers.map((a) => (a.id === id ? { ...a, passwordHash, salt } : a)),
    }))
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
