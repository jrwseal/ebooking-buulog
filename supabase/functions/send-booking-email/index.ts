import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SMTPClient } from 'npm:denomailer@1.6.0'

type EmailEvent = 'submitted' | 'approved' | 'rejected'

const MONTHS_TH = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']

function thaiDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return `${d} ${MONTHS_TH[m - 1]} ${y + 543}`
}

interface BookingWithRoom {
  booking_code: string
  title: string
  requester: string
  requester_email: string
  date: string
  start_time: string
  end_time: string
  review_note: string
  rooms: { name: string } | null
  room_id: string
}

function detailRows(b: BookingWithRoom): string {
  const roomName = b.rooms?.name ?? b.room_id
  return `
    <tr><td style="padding:6px 0;color:#64748b;width:120px">รหัสการจอง</td>
        <td style="padding:6px 0;font-weight:700;color:#1e3a5f;font-family:monospace">${b.booking_code}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b">หัวข้อ</td>
        <td style="padding:6px 0;font-weight:600">${b.title}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b">ผู้จอง</td>
        <td style="padding:6px 0">${b.requester}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b">วันที่</td>
        <td style="padding:6px 0">${thaiDate(b.date)}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b">เวลา</td>
        <td style="padding:6px 0">${b.start_time} – ${b.end_time}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b">ห้อง</td>
        <td style="padding:6px 0">${roomName}</td></tr>
  `
}

function buildEmail(event: EmailEvent, b: BookingWithRoom): { subject: string; html: string } {
  const roomName = b.rooms?.name ?? b.room_id

  if (event === 'submitted') {
    return {
      subject: `[${b.booking_code}] ได้รับคำขอจองห้อง ${roomName} แล้ว — รอการอนุมัติ`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <div style="background:#1e3a5f;padding:16px 24px;border-radius:8px 8px 0 0">
            <h1 style="color:#fff;font-size:16px;margin:0">ระบบจองห้องเรียน | คณะโลจิสติกส์ ม.บูรพา</h1>
          </div>
          <div style="border:1px solid #e2e8f0;border-top:none;padding:24px;border-radius:0 0 8px 8px">
            <h2 style="color:#1e3a5f;font-size:18px;margin:0 0 16px">ได้รับคำขอจองแล้ว — รอการอนุมัติ</h2>
            <table style="width:100%;border-collapse:collapse;font-size:14px">${detailRows(b)}</table>
            <p style="font-size:12px;color:#94a3b8;margin-top:24px">ระบบจะส่งอีเมลแจ้งผลอีกครั้งเมื่อคำขอนี้ได้รับการอนุมัติหรือปฏิเสธ กรุณาเก็บรหัสการจองไว้เพื่อใช้ตรวจสอบสถานะ</p>
          </div>
        </div>
      `,
    }
  }

  if (event === 'approved') {
    return {
      subject: `[${b.booking_code}] การจองห้อง ${roomName} ได้รับการอนุมัติ`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <div style="background:#1e3a5f;padding:16px 24px;border-radius:8px 8px 0 0">
            <h1 style="color:#fff;font-size:16px;margin:0">ระบบจองห้องเรียน | คณะโลจิสติกส์ ม.บูรพา</h1>
          </div>
          <div style="border:1px solid #e2e8f0;border-top:none;padding:24px;border-radius:0 0 8px 8px">
            <h2 style="color:#1e3a5f;font-size:18px;margin:0 0 16px">การจองได้รับการอนุมัติแล้ว ✓</h2>
            <table style="width:100%;border-collapse:collapse;font-size:14px">
              ${detailRows(b)}
              ${b.review_note && b.review_note !== 'ตารางสอนอาจารย์' ? `<tr><td style="padding:6px 0;color:#64748b">หมายเหตุ</td><td style="padding:6px 0">${b.review_note}</td></tr>` : ''}
            </table>
            <p style="font-size:12px;color:#94a3b8;margin-top:24px">กรุณาเก็บรหัสการจองไว้เพื่อใช้ตรวจสอบสถานะในระบบ</p>
          </div>
        </div>
      `,
    }
  }

  // rejected
  return {
    subject: `[${b.booking_code}] คำขอจองห้อง ${roomName} ถูกปฏิเสธ`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <div style="background:#1e3a5f;padding:16px 24px;border-radius:8px 8px 0 0">
          <h1 style="color:#fff;font-size:16px;margin:0">ระบบจองห้องเรียน | คณะโลจิสติกส์ ม.บูรพา</h1>
        </div>
        <div style="border:1px solid #e2e8f0;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <h2 style="color:#dc2626;font-size:18px;margin:0 0 16px">คำขอจองถูกปฏิเสธ</h2>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            ${detailRows(b)}
            <tr><td style="padding:6px 0;color:#64748b">เหตุผล</td>
                <td style="padding:6px 0">${b.review_note || '-'}</td></tr>
          </table>
        </div>
      </div>
    `,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' } })
  }

  try {
    const { bookingId, event } = await req.json() as { bookingId: string; event: EmailEvent }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: booking, error } = await supabase
      .from('bookings')
      .select('*, rooms(name)')
      .eq('id', bookingId)
      .single()

    if (error || !booking) return new Response('booking not found', { status: 404 })
    if (!booking.requester_email) return new Response('no email', { status: 200 })

    const { data: configRow } = await supabase
      .from('email_config')
      .select('gmail_app_password')
      .eq('id', 1)
      .single()
    const appPassword = configRow?.gmail_app_password ?? ''
    if (!appPassword) return new Response('not configured', { status: 200 })

    const { data: settingRow } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'notify_gmail_address')
      .single()
    const gmailAddress = settingRow?.value ?? ''
    if (!gmailAddress) return new Response('not configured', { status: 200 })

    const { subject, html } = buildEmail(event, booking as BookingWithRoom)

    const client = new SMTPClient({
      connection: {
        hostname: 'smtp.gmail.com',
        port: 465,
        tls: true,
        auth: { username: gmailAddress, password: appPassword },
      },
    })

    await client.send({
      from: gmailAddress,
      to: booking.requester_email,
      subject,
      content: 'auto',
      html,
    })
    await client.close()

    return new Response('sent', { status: 200 })
  } catch (err) {
    console.error('[send-booking-email]', err)
    return new Response('error', { status: 500 })
  }
})
