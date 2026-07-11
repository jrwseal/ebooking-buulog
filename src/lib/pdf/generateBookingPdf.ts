import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import { parseDate, TH_MONTHS } from '../../utils/datetime'
import { buildBookingFormElement } from './bookingFormTemplate'
import type { Booking, Room } from '../../types'

export async function downloadBookingPdf(booking: Booking, room: Room): Promise<void> {
  const d = parseDate(booking.date)

  const el = buildBookingFormElement({
    refCode: booking.bookingCode,
    studentName: booking.requester,
    studentId: booking.studentId,
    major: booking.major,
    year: booking.year,
    phone: booking.phone,
    roomName: room.name,
    purpose: booking.purpose,
    courseCode: booking.courseCode,
    courseName: booking.title,
    courseGroup: booking.courseGroup,
    day: String(d.getDate()),
    month: TH_MONTHS[d.getMonth()],
    yearBE: String(d.getFullYear() + 543),
    startTime: booking.start,
    endTime: booking.end,
    instructorName: booking.instructorName,
  })

  document.body.appendChild(el)
  try {
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const imgHeight = (canvas.height * pageWidth) / canvas.width
    pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, imgHeight)
    pdf.save(`booking-form-${booking.bookingCode || booking.id}.pdf`)
  } finally {
    document.body.removeChild(el)
  }
}
