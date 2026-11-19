import { NextResponse } from 'next/server'
import { purgeCompletedMealAllowanceData } from '@/lib/meal-allowance-cleanup'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  try {
    const summary = await purgeCompletedMealAllowanceData()
    return NextResponse.json({ ok: true, ...summary })
  } catch (error) {
    console.error('[meal allowance cleanup]', error)
    return NextResponse.json({ message: 'Pembersihan jatah makan gagal.' }, { status: 500 })
  }
}
