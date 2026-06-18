import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'noreply@buulog.ac.th'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' } })
  }

  try {
    const { bookingId } = await req.json() as { bookingId: string }

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

    const roomName = (booking.rooms as { name: string } | null)?.name ?? booking.room_id
    const [y, m, d] = (booking.date as string).split('-').map(Number)
    const thaiDate = `${d} ${['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'][m - 1]} ${y + 543}`

    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <div style="background:#1e3a5f;padding:16px 24px;border-radius:8px 8px 0 0">
          <h1 style="color:#fff;font-size:16px;margin:0">ระบบจองห้องเรียน | คณะโลจิสติกส์ ม.บูรพา</h1>
        </div>
        <div style="border:1px solid #e2e8f0;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <h2 style="color:#1e3a5f;font-size:18px;margin:0 0 16px">การจองได้รับการอนุมัติแล้ว ✓</h2>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr><td style="padding:6px 0;color:#64748b;width:120px">รหัสการจอง</td>
                <td style="padding:6px 0;font-weight:700;color:#1e3a5f;font-family:monospace">${booking.booking_code}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b">หัวข้อ</td>
                <td style="padding:6px 0;font-weight:600">${booking.title}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b">ผู้จอง</td>
                <td style="padding:6px 0">${booking.requester}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b">วันที่</td>
                <td style="padding:6px 0">${thaiDate}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b">เวลา</td>
                <td style="padding:6px 0">${booking.start_time} – ${booking.end_time}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b">ห้อง</td>
                <td style="padding:6px 0">${roomName}</td></tr>
            ${booking.review_note && booking.review_note !== 'ตารางสอนอาจารย์' ? `<tr><td style="padding:6px 0;color:#64748b">หมายเหตุ</td><td style="padding:6px 0">${booking.review_note}</td></tr>` : ''}
          </table>
          <p style="font-size:12px;color:#94a3b8;margin-top:24px">กรุณาเก็บรหัสการจองไว้เพื่อใช้ตรวจสอบสถานะในระบบ</p>
        </div>
      </div>
    `

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: booking.requester_email,
        subject: `[${booking.booking_code}] การจองห้อง ${roomName} ได้รับการอนุมัติ`,
        html,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[send-approval-email] Resend error:', err)
      return new Response(err, { status: 500 })
    }

    return new Response('sent', { status: 200 })
  } catch (err) {
    console.error('[send-approval-email]', err)
    return new Response('error', { status: 500 })
  }
})
