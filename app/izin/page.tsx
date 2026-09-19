'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createLeaveRequest } from '@/app/actions/leave'

type LeaveRequest = {
  id: number
  jenis: string
  tanggal_mulai: string
  tanggal_selesai: string
  alasan: string | null
  status: string
  catatan_manajer: string | null
  pengganti_type: string | null
  pengganti_nama_manual: string | null
  pengganti_user_id: string | null
}

type CrewOption = { id: string; nama: string }

export default function IzinPage() {
  const [list, setList] = useState<LeaveRequest[]>([])
  const [crewOptions, setCrewOptions] = useState<CrewOption[]>([])
  const [jenis, setJenis] = useState<'sakit' | 'keperluan_pribadi'>('sakit')
  const [tanggalMulai, setTanggalMulai] = useState('')
  const [tanggalSelesai, setTanggalSelesai] = useState('')
  const [alasan, setAlasan] = useState('')
  const [penggantiType, setPenggantiType] = useState<'crew' | 'freelance'>('crew')
  const [penggantiUserId, setPenggantiUserId] = useState('')
  const [penggantiNamaManual, setPenggantiNamaManual] = useState('')
  const [message, setMessage] = useState('')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  async function loadData() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setCurrentUserId(user.id)

    const { data: leaveData } = await supabase
      .from('leave_request')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    setList(leaveData || [])

    const { data: crewData } = await supabase
      .from('users')
      .select('id, nama')
      .eq('role', 'crew')
      .eq('status_aktif', true)
      .neq('id', user.id) // exclude diri sendiri dari daftar pengganti
      .order('nama')
    setCrewOptions(crewData || [])
  }

  useEffect(() => {
    loadData()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const result = await createLeaveRequest(
      jenis,
      tanggalMulai,
      tanggalSelesai,
      alasan,
      penggantiType,
      penggantiType === 'crew' ? penggantiUserId : null,
      penggantiType === 'freelance' ? penggantiNamaManual : null
    )
    if (!result.success) {
      setMessage('Error: ' + result.message)
      return
    }
    setMessage('Pengajuan berhasil dikirim')
    setTanggalMulai('')
    setTanggalSelesai('')
    setAlasan('')
    setPenggantiUserId('')
    setPenggantiNamaManual('')
    loadData()
  }

  const statusColor: Record<string, string> = {
    pending: 'orange',
    disetujui: 'green',
    ditolak: 'red',
  }

  function formatPengganti(item: LeaveRequest) {
    if (item.pengganti_type === 'crew') {
      const crew = crewOptions.find((c) => c.id === item.pengganti_user_id)
      return crew?.nama || '(crew)'
    }
    if (item.pengganti_type === 'freelance') {
      return `Freelance, ${item.pengganti_nama_manual}`
    }
    return '-'
  }

  return (
    <div>
      <h1>Ajukan Izin</h1>

      <form onSubmit={handleSubmit}>
        <select value={jenis} onChange={(e) => setJenis(e.target.value as 'sakit' | 'keperluan_pribadi')}>
          <option value="sakit">Sakit</option>
          <option value="keperluan_pribadi">Keperluan Pribadi</option>
        </select>
        <input type="date" value={tanggalMulai} onChange={(e) => setTanggalMulai(e.target.value)} required />
        <input type="date" value={tanggalSelesai} onChange={(e) => setTanggalSelesai(e.target.value)} required />
        <textarea placeholder="Alasan (opsional)" value={alasan} onChange={(e) => setAlasan(e.target.value)} />

        <div>
          <label>Digantikan dengan:</label>
          <select value={penggantiType} onChange={(e) => setPenggantiType(e.target.value as 'crew' | 'freelance')}>
            <option value="crew">Crew Lain</option>
            <option value="freelance">Freelance</option>
          </select>

          {penggantiType === 'crew' ? (
            <select value={penggantiUserId} onChange={(e) => setPenggantiUserId(e.target.value)} required>
              <option value="">-- Pilih Crew --</option>
              {crewOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.nama}</option>
              ))}
            </select>
          ) : (
            <input
              placeholder="Nama freelance (ketik manual)"
              value={penggantiNamaManual}
              onChange={(e) => setPenggantiNamaManual(e.target.value)}
              required
            />
          )}
        </div>

        <button type="submit">Ajukan</button>
      </form>

      {message && <p>{message}</p>}

      <h2>Riwayat Pengajuan</h2>
      <ul>
        {list.map((item) => (
          <li key={item.id}>
            <span style={{ color: statusColor[item.status] }}>[{item.status.toUpperCase()}]</span>{' '}
            {item.jenis} — {item.tanggal_mulai} s.d. {item.tanggal_selesai}
            {item.alasan && ` — "${item.alasan}"`}
            <div>Digantikan dengan: {formatPengganti(item)}</div>
            {item.catatan_manajer && <div>Catatan manajer: {item.catatan_manajer}</div>}
          </li>
        ))}
      </ul>
    </div>
  )
}