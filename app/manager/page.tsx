import Link from 'next/link'
import BottomNav from '@/components/BottomNav'

const tools = [
  { href: '/manager/karyawan', label: 'Manajemen Karyawan', desc: 'Tambah & kelola akun crew' },
  { href: '/manager/jadwal', label: 'Kelola Jadwal', desc: 'Grid jadwal mingguan' },
  { href: '/manager/jam-kerja', label: 'Kelola Jam Kerja', desc: 'Preset opsi shift' },
  { href: '/manager/jobdesk', label: 'Kelola Jobdesk', desc: 'Master daftar tugas' },
  { href: '/manager/izin', label: 'Kelola Izin', desc: 'Setujui/tolak pengajuan izin' },
  { href: '/manager/tukar-shift', label: 'Kelola Tukar Shift', desc: 'Setujui/tolak tukar shift' },
  { href: '/manager/periode', label: 'Kelola Periode Kerja', desc: 'Siklus gajian custom' },
  { href: '/manager/laporan', label: 'Laporan & Rekap', desc: 'Rekap kehadiran + export Excel' },
]

export default function ManagerHubPage() {
  return (
    <div className="flex min-h-full flex-col bg-cream pb-24">
      <div className="px-5 pt-6">
        <h1 className="text-lg font-semibold text-ink">Kelola</h1>
        <p className="text-xs text-muted">Menu khusus manager</p>
      </div>

      <div className="mt-4 space-y-2 px-5">
        {tools.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className="flex items-center justify-between rounded-2xl border border-cream-dim bg-cream-card px-5 py-4"
          >
            <div>
              <p className="text-sm font-semibold text-ink">{tool.label}</p>
              <p className="text-xs text-muted">{tool.desc}</p>
            </div>
            <span className="text-brand">→</span>
          </Link>
        ))}
      </div>

      <BottomNav />
    </div>
  )
}