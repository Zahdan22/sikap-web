import { NextResponse } from 'next/server'
import { purgeCompletedMealAllowanceData } from '@/lib/meal-allowance-cleanup'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { data: outlets, error } = await supabaseAdmin.from('outlets').select('id').eq('is_active', true)
    if (error) throw error
    const summaries = await Promise.all((outlets || []).map((outlet) => purgeCompletedMealAllowanceData(outlet.id)))
    const summary = summaries.reduce((total, item) => ({
      periods: total.periods + item.periods,
      missingViolations: total.missingViolations + item.missingViolations,
      claims: total.claims + item.claims,
      photos: total.photos + item.photos,
    }), { periods: 0, missingViolations: 0, claims: 0, photos: 0 })
    return NextResponse.json({ ok: true, ...summary })
  } catch (error) {
    console.error('[meal allowance cleanup]', error)
    return NextResponse.json({ message: 'Pembersihan jatah makan gagal.' }, { status: 500 })
  }
}
