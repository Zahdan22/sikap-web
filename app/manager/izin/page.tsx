'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { respondLeaveRequest } from '@/app/actions/leave'

type LeaveRequestWithUser = {
  id: number
  jenis: string
  tanggal_mulai: string
  tanggal_selesai: string
  alasan: string | null
  status: string
  users: { nama: string } | null
  pengganti_type: string | null
  pengganti_nama_manual: string | null
  pengganti_user_id: string | null
}

type CrewOption = { id: string; nama: string }

export default function ManagerIzinPage() {
  const [list, setList] = useState<LeaveRequestWithUser[]>([])
  const [crewOptions, setCrewOptions] = useState<CrewOption[]>([])
  const [catatan, setCatatan] = useState<Record<number, string>>({})

  async function loadData() {
    const supabase = createClient()

    const { data: leaveData } = await supabase
      .from('leave_request')
      .select(
        'id, jenis, tanggal_mulai, tanggal_selesai, alasan, status, users:user_id (nama), pengganti_type, pengganti_nama_manual, pengganti_user_id'
      )
      .order('created_at', { ascending: false })
    setList((leaveData as any) || [])

    const { data: crewData } = await supabase.from('users').select('id, nama').eq('role', 'crew')
    setCrewOptions(crewData || [])
  }

  useEffect(() => {
    loadData()
  }, [])

  async function handleRespond(id: number, status: 'disetujui' | 'ditolak') {
    const result = await respondLeaveRequest(id, status, catatan[id] || '')
    if (!result.success) {
      alert('Error: ' + result.message)
      return
    }
    loadData()
  }

  function formatPengganti(item: LeaveRequestWithUser) {
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
      <h1>Kelola Pengajuan Izin</h1>
      <ul>
        {list.map((item) => (
          <li key={item.id} style={{ marginBottom: 16, borderBottom: '1px solid gray', paddingBottom: 8 }}>
            <strong>{item.users?.nama}</strong> — {item.jenis} — {item.tanggal_mulai} s.d. {item.tanggal_selesai}
            {item.alasan && <div>Alasan: {item.alasan}</div>}
            <div>Digantikan dengan: {formatPengganti(item)}</div>
            <div>Status: {item.status}</div>

            {item.status === 'pending' && (
              <div>
                <input
                  placeholder="Catatan (opsional)"
                  value={catatan[item.id] || ''}
                  onChange={(e) => setCatatan((prev) => ({ ...prev, [item.id]: e.target.value }))}
                />
                <button onClick={() => handleRespond(item.id, 'disetujui')}>Setujui</button>
                <button onClick={() => handleRespond(item.id, 'ditolak')}>Tolak</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}