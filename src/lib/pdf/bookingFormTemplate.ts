export interface BookingFormData {
  refCode: string
  studentName: string
  studentId: string
  major: string
  year: string
  phone: string
  roomName: string
  purpose: string
  courseCode: string
  courseName: string
  courseGroup: string
  day: string
  month: string
  yearBE: string
  startTime: string
  endTime: string
  instructorName: string
}

function textSpan(text: string): HTMLSpanElement {
  const s = document.createElement('span')
  s.textContent = text
  return s
}

function blankSpan(value: string, minWidth = '90px'): HTMLSpanElement {
  const s = document.createElement('span')
  s.textContent = value || ' '
  s.style.cssText =
    `display:inline-block;min-width:${minWidth};border-bottom:1px solid #000;` +
    'padding:0 4px;font-weight:600;text-align:center;'
  return s
}

function row(...spans: HTMLSpanElement[]): HTMLDivElement {
  const r = document.createElement('div')
  r.style.cssText = 'display:flex;flex-wrap:wrap;align-items:baseline;gap:4px;margin:8px 0;font-size:15px;line-height:1.7;'
  spans.forEach((s) => r.appendChild(s))
  return r
}

export function buildBookingFormElement(data: BookingFormData): HTMLDivElement {
  const page = document.createElement('div')
  page.style.cssText = [
    'width:794px',
    'min-height:1123px',
    'box-sizing:border-box',
    'padding:56px 64px',
    'background:#ffffff',
    'color:#000000',
    "font-family:'Sarabun',sans-serif",
    'position:fixed',
    'left:-9999px',
    'top:0',
  ].join(';')

  const refLine = document.createElement('div')
  refLine.style.cssText = 'text-align:right;font-size:13px;margin-bottom:4px;'
  refLine.textContent = `เลขที่อ้างอิงติดตามสถานะ: ${data.refCode}`
  page.appendChild(refLine)

  const header = document.createElement('div')
  header.style.cssText = 'display:flex;align-items:center;gap:16px;margin-bottom:8px;'
  const logo = document.createElement('img')
  logo.src = '/buulog.png'
  logo.style.cssText = 'width:56px;height:56px;object-fit:contain;'
  const titleWrap = document.createElement('div')
  titleWrap.style.cssText = 'flex:1;text-align:center;'
  const title = document.createElement('div')
  title.textContent = 'บันทึกข้อความ'
  title.style.cssText = 'font-size:22px;font-weight:700;'
  titleWrap.appendChild(title)
  const spacer = document.createElement('div')
  spacer.style.cssText = 'width:56px;'
  header.appendChild(logo)
  header.appendChild(titleWrap)
  header.appendChild(spacer)
  page.appendChild(header)

  page.appendChild(row(textSpan('ส่วนงาน คณะโลจิสติกส์ โทร. ๓๑๐๒ - ๓๑๐๓')))
  page.appendChild(row(textSpan('ที่ อว 8112.1/'), blankSpan('', '160px')))
  page.appendChild(row(textSpan('เรื่อง ขอใช้ห้องคณะโลจิสติกส์')))
  page.appendChild(row(textSpan('เรียน คณบดีคณะโลจิสติกส์')))

  page.appendChild(row(
    textSpan('ด้วยข้าพเจ้า ชื่อ'), blankSpan(data.studentName, '220px'),
    textSpan('รหัสนิสิต'), blankSpan(data.studentId, '140px'),
  ))
  page.appendChild(row(
    textSpan('เป็นนิสิตสาขาวิชา/แขนงวิชา'), blankSpan(data.major, '220px'),
    textSpan('ชั้นปีที่'), blankSpan(data.year, '50px'),
    textSpan('เบอร์โทรศัพท์'), blankSpan(data.phone, '140px'),
  ))
  page.appendChild(row(
    textSpan('มีความประสงค์ขอใช้ห้อง'), blankSpan(data.roomName, '160px'),
    textSpan('เพื่อ'), blankSpan(data.purpose, '260px'),
  ))
  page.appendChild(row(
    textSpan('ในรายวิชา รหัสวิชา'), blankSpan(data.courseCode, '140px'),
    textSpan('ชื่อวิชา'), blankSpan(data.courseName, '220px'),
    textSpan('กลุ่ม'), blankSpan(data.courseGroup, '60px'),
  ))
  page.appendChild(row(
    textSpan('ในวันที่'), blankSpan(data.day, '50px'),
    textSpan('เดือน'), blankSpan(data.month, '140px'),
    textSpan('พ.ศ.'), blankSpan(data.yearBE, '70px'),
    textSpan('เวลา'), blankSpan(data.startTime, '70px'), textSpan('น.'),
  ))
  page.appendChild(row(
    textSpan('ถึงวันที่'), blankSpan(data.day, '50px'),
    textSpan('เดือน'), blankSpan(data.month, '140px'),
    textSpan('พ.ศ.'), blankSpan(data.yearBE, '70px'),
    textSpan('เวลา'), blankSpan(data.endTime, '70px'), textSpan('น.'),
  ))

  const consent = document.createElement('p')
  consent.style.cssText = 'font-size:15px;line-height:1.9;margin:16px 0;'
  consent.textContent =
    'ในการนี้ ข้าพเจ้าจะดูแลและรับผิดชอบอุปกรณ์ทุกอย่างภายในห้องหากเกิดความเสียหาย ให้อยู่ในสภาพดีดังเดิม ' +
    'หากมีความเสียหายเกิดขึ้น ข้าพเจ้ายินดีรับผิดชอบค่าเสียหายที่เกิดขึ้นทั้งหมดแก่คณะโลจิสติกส์ ' +
    'จึงเรียนมาเพื่อโปรดให้ความอนุเคราะห์ในการนี้ด้วย จักขอบคุณยิ่ง'
  page.appendChild(consent)

  const sigWrap = document.createElement('div')
  sigWrap.style.cssText = 'display:flex;justify-content:flex-end;margin-top:24px;font-size:14px;text-align:center;'
  const sigBlock = document.createElement('div')
  const sigLabel1 = document.createElement('div')
  sigLabel1.textContent = 'นิสิตผู้ขอใช้ห้อง'
  const sigDots1 = document.createElement('div')
  sigDots1.textContent = '................................................'
  sigDots1.style.cssText = 'margin-top:24px;'
  const sigName1 = document.createElement('div')
  sigName1.textContent = `(${data.studentName || '...............................................'})`
  sigBlock.appendChild(sigLabel1)
  sigBlock.appendChild(sigDots1)
  sigBlock.appendChild(sigName1)
  sigWrap.appendChild(sigBlock)
  page.appendChild(sigWrap)

  const instructorNote = document.createElement('p')
  instructorNote.style.cssText = 'font-size:14px;margin-top:24px;'
  instructorNote.textContent = 'อาจารย์ประจำวิชาขอรับรองว่าใช้เพื่อวัตถุประสงค์ข้างต้นจริง'
  page.appendChild(instructorNote)

  const sigWrap2 = document.createElement('div')
  sigWrap2.style.cssText = 'margin-top:36px;font-size:14px;'
  const sigDots2 = document.createElement('div')
  sigDots2.textContent = '.................................................'
  const sigName2 = document.createElement('div')
  sigName2.textContent = `(${data.instructorName || '...............................................'})`
  const sigLabel2 = document.createElement('div')
  sigLabel2.textContent = 'อาจารย์ประจำวิชาผู้รับรอง'
  sigLabel2.style.cssText = 'margin-top:4px;'
  sigWrap2.appendChild(sigDots2)
  sigWrap2.appendChild(sigName2)
  sigWrap2.appendChild(sigLabel2)
  page.appendChild(sigWrap2)

  const footNote = document.createElement('p')
  footNote.style.cssText = 'font-size:13px;font-weight:600;margin-top:32px;'
  footNote.textContent =
    '*หมายเหตุ* หากอาจารย์ประจำวิชาผู้รับรองอนุญาตให้ใช้ห้องหลังเวลาราชการ (ตั้งแต่ 16.30 - 20.30 น.) ' +
    'ต้องเป็นผู้ดูแลรับผิดชอบในอุปกรณ์ และการเปิด – ปิดห้องด้วยตนเอง'
  page.appendChild(footNote)

  return page
}
