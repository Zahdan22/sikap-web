'use client'

import { useCallback, useEffect, useState } from 'react'
import PageHeader from '@/components/PageHeader'
import { useDialog } from '@/components/ui/DialogProvider'
import { loadOutletInfo, updateOutletInfo } from '@/app/actions/outlet'
import { getCurrentPosition, reverseGeocode } from '@/lib/geo'

type Outlet = { nama: string; alamat: string; latitude: number | null; longitude: number | null; radiusMeter: number }

export default function OutletSettingsPage() {
  const { toast, promptPassword } = useDialog()
  const [outlet, setOutlet] = useState<Outlet | null>(null)
  const [nama, setNama] = useState('')
  const [alamat, setAlamat] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [loading, setLoading] = useState(true)
  const [locating, setLocating] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await loadOutletInfo()
    setLoading(false)
    if (!result.success) { toast(result.message, 'error'); return }
    setOutlet(result.outlet)
    setNama(result.outlet.nama)
    setAlamat(result.outlet.alamat)
    setLatitude(result.outlet.latitude === null ? '' : String(result.outlet.latitude))
    setLongitude(result.outlet.longitude === null ? '' : String(result.outlet.longitude))
  }, [toast])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  async function chooseDeviceLocation() {
    setLocating(true)
    try {
      const position = await getCurrentPosition()
      setLatitude(position.latitude.toFixed(8))
      setLongitude(position.longitude.toFixed(8))
      const resolvedAddress = await reverseGeocode(position.latitude, position.longitude)
      if (resolvedAddress) setAlamat(resolvedAddress)
      else toast('Titik GPS berhasil diambil. Keterangan alamat belum tersedia, silakan isi bila diperlukan.', 'info')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Lokasi perangkat belum dapat diambil.', 'error')
    } finally { setLocating(false) }
  }

  async function save() {
    const parsedLatitude = Number(latitude)
    const parsedLongitude = Number(longitude)
    if (!Number.isFinite(parsedLatitude) || !Number.isFinite(parsedLongitude)) {
      toast('Titik GPS harus berupa angka yang valid.', 'error')
      return
    }
    const password = await promptPassword({
      title: 'Konfirmasi perubahan lokasi',
      description: 'Masukkan password akun kamu. Perubahan titik GPS akan langsung memengaruhi validasi absensi crew.',
    })
    if (!password) return

    setSaving(true)
    const result = await updateOutletInfo({ nama, alamat, latitude: parsedLatitude, longitude: parsedLongitude, password })
    setSaving(false)
    if (!result.success) { toast(result.message, 'error'); return }
    toast('Informasi outlet berhasil disimpan.', 'success')
    await load()
  }

  return (
    <div className="min-h-full bg-cream pb-10">
      <PageHeader title="Informasi Outlet" backHref="/dashboard" />
      <main className="space-y-4 px-5 pt-5">
        <section className="rounded-2xl border border-cream-dim bg-cream-card p-4 text-sm leading-relaxed text-muted">
          Atur identitas dan titik absensi outlet ini. Radius absensi ditetapkan 50 meter. Outlet baru tidak bisa dipakai untuk absensi sebelum titik GPS disimpan.
        </section>

        <section className="rounded-2xl border border-cream-dim bg-cream-card p-5">
          {loading || !outlet ? <p className="text-sm text-muted">Memuat informasi outlet…</p> : <>
            <label className="mb-1 block text-xs font-medium text-muted">Nama outlet</label>
            <input value={nama} onChange={(event) => setNama(event.target.value)} maxLength={100}
              className="w-full rounded-xl border border-cream-dim bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-brand" />

            <div className="mt-5 flex items-center justify-between gap-3">
              <div><p className="text-sm font-semibold text-ink">Titik GPS outlet</p><p className="mt-1 text-xs leading-relaxed text-muted">Gunakan lokasi perangkat saat berada di titik tengah outlet.</p></div>
              <button type="button" onClick={() => void chooseDeviceLocation()} disabled={locating || saving}
                className="shrink-0 rounded-xl border border-brand px-3 py-2 text-xs font-semibold text-brand disabled:opacity-60">
                {locating ? 'Mengambil…' : 'Gunakan lokasi saya'}
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div><label className="mb-1 block text-xs font-medium text-muted">Latitude</label><input inputMode="decimal" value={latitude} onChange={(event) => setLatitude(event.target.value)} className="w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-brand" /></div>
              <div><label className="mb-1 block text-xs font-medium text-muted">Longitude</label><input inputMode="decimal" value={longitude} onChange={(event) => setLongitude(event.target.value)} className="w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-brand" /></div>
            </div>

            <div className="mt-3"><label className="mb-1 block text-xs font-medium text-muted">Keterangan alamat</label><textarea value={alamat} onChange={(event) => setAlamat(event.target.value)} rows={3} maxLength={500} placeholder="Alamat akan dicoba terisi otomatis dari titik GPS" className="w-full resize-none rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-brand" /></div>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-cream px-4 py-3"><span className="text-sm text-muted">Radius absensi</span><span className="text-sm font-semibold text-ink">{outlet.radiusMeter} meter</span></div>

            <button type="button" onClick={() => void save()} disabled={saving || locating} className="mt-5 w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? 'Menyimpan…' : 'Simpan informasi outlet'}
            </button>
          </>}
        </section>
      </main>
    </div>
  )
}
