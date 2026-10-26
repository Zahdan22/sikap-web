import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (user && !request.nextUrl.pathname.startsWith('/api/')) {
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('status_aktif, role')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      // Fail closed without destroying a valid session on a temporary database outage.
      const response = new NextResponse('Layanan akun sementara tidak tersedia. Silakan muat ulang halaman.', { status: 503 })
      supabaseResponse.cookies.getAll().forEach(cookie => response.cookies.set(cookie))
      response.headers.set('Cache-Control', 'private, no-store')
      return response
    }
    if (!profile?.status_aktif) {
      await supabase.auth.signOut()
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = '/login'
      loginUrl.search = ''
      const redirectResponse = request.nextUrl.pathname === '/login'
        ? supabaseResponse : NextResponse.redirect(loginUrl)
      supabaseResponse.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie))
      return redirectResponse
    }
    if (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/') {
      const target = request.nextUrl.clone()
      target.pathname = profile.role === 'finance' ? '/finance' : '/dashboard'
      target.search = ''
      const response = NextResponse.redirect(target)
      supabaseResponse.cookies.getAll().forEach(cookie => response.cookies.set(cookie))
      response.headers.set('Cache-Control', 'private, no-store')
      return response
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons/|sw\\.js$|manifest\\.webmanifest$).*)'],
}
