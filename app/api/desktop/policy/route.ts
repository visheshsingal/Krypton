import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { SecurityPolicy } from '@/models/SecurityPolicy';
import { authenticateRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (auth.error || !auth.user || !auth.user.companyId) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    await connectDB();
    const policy = await SecurityPolicy.findOne({ companyId: auth.user.companyId });
    return NextResponse.json({ policy });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
