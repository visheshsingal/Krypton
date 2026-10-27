import { NextRequest, NextResponse } from 'next/server';
import { sendLeadNotification } from '@/lib/email';

export async function POST(req: NextRequest) {
  try {
    const { name, email, company, seatsNeeded = 25, message } = await req.json();

    if (!name || !email || !company) {
      return NextResponse.json({ error: 'Name, work email, and company are required.' }, { status: 400 });
    }

    console.log(`[Demo Contact Request] Inbound from ${name} (${email}) at ${company} - Seats: ${seatsNeeded}`);
    await sendLeadNotification(name, email, company, seatsNeeded, message || 'Interested in Krypton DLP Enterprise demo');

    return NextResponse.json({
      message: 'Thank you for reaching out! A Krypton AI security specialist will contact you shortly.',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
