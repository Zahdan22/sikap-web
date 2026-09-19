'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { respondSwapRequest } from '@/app/actions/shift-swap'

type SwapRequest = {
  id: number
  tanggal: string
  alasan: string | null
  status: string
  requester: { nama: string } | null
  target: { nama: string } | null
}

export default function ManagerTukarShiftPage() {
  const [list, setList] = useState<SwapRequest[]>([])
  const [catatan, setCatatan] = useState<Record<number, string>>({})

  async function loadList() {
    const supabase = createClient()
    const { data } = await supabase
      .from('shift_swap_request')
      .select('*, requester:requester_id (nama), target:target_id (nama)')
      .order('created_at', { ascending: false })
    setList((data as any) || [])
  }

  useEffect(() => { loadList() }, [])

  async function handleRespond(id: number, status: 'disetujui' | 'ditolak') {
    const result = await respondSwapRequest(id, status, catatan[id] || '')
    if (!result.success) { alert('Error: ' + result.message); return }
    loadList()
  }

  return (
    <div>
      <h1>Kelola Tukar Shift</h1>
      <ul>
        {list.map((item) => (
          <li key={item.id} style={{ marginBottom: 16, borderBottom: '1px solid gray', paddingBottom: 8 }}>
            <strong>{item.requester?.nama}</strong> ↔ <strong>{item.target?.nama}</strong> — {item.tanggal}
            {item.alasan && <div>Alasan: {item.alasan}</div>}
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