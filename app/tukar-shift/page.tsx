'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createSwapRequest } from '@/app/actions/shift-swap'

type SwapRequest = {
  id: number
  tanggal: string
  alasan: string | null
  status: string
  requester_id: string
  target_id: string
  requester: { nama: string } | null
  target: { nama: string } | null
}

type CrewOption = { id: string; nama: string }

export default function TukarShiftPage() {
  const [list, setList] = useState<SwapRequest[]>([])
  const [crewOptions, setCrewOptions] = useState<CrewOption[]>([])
  const [tanggal, setTanggal] = useState('')
  const [targetId, setTargetId] = useState('')
  const [alasan, setAlasan] = useState('')
  const [message, setMessage] = useState('')
  const [userId, setUserId] = useState<string | null>(null)

  async function loadData() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const { data: swapData } = await supabase
      .from('shift_swap_request')
      .select('*, requester:requester_id (nama), target:target_id (nama)')
      .or(`requester_id.eq.${user.id},target_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
    setList((swapData as any) || [])

    const { data: crewData } = await supabase
      .from('users').select('id, nama').eq('role', 'crew').neq('id', user.id).order('nama')
    setCrewOptions(crewData || [])
  }

  useEffect(() => { loadData() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const result = await createSwapRequest(tanggal, targetId, alasan)
    if (!result.success) { setMessage('Error: ' + result.message); return }
    setMessage('Pengajuan tukar shift berhasil dikirim')
    setTanggal(''); setTargetId(''); setAlasan('')
    loadData()
  }

  const statusColor: Record<string, string> = { pending: 'orange', disetujui: 'green', ditolak: 'red' }

  return (
    <div>
      <h1>Tukar Shift</h1>

      <form onSubmit={handleSubmit}>
        <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} required />
        <select value={targetId} onChange={(e) => setTargetId(e.target.value)} required>
          <option value="">-- Pilih Rekan --</option>
          {crewOptions.map((c) => <option key={c.id} value={c.id}>{c.nama}</option>)}
        </select>
        <input placeholder="Alasan" value={alasan} onChange={(e) => setAlasan(e.target.value)} />
        <button type="submit">Ajukan Tukar Shift</button>
      </form>

      {message && <p>{message}</p>}

      <h2>Riwayat</h2>
      <ul>
        {list.map((item) => (
          <li key={item.id}>
            <span style={{ color: statusColor[item.status] }}>[{item.status.toUpperCase()}]</span>{' '}
            {item.tanggal} — {item.requester?.nama} ↔ {item.target?.nama}
            {item.requester_id === userId ? ' (kamu mengajukan)' : ' (kamu diminta)'}
            {item.alasan && ` — "${item.alasan}"`}
          </li>
        ))}
      </ul>
    </div>
  )
}