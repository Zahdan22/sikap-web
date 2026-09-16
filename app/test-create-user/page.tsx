// app/test-create-user/page.tsx
'use client'

import { createCrewAccount } from '@/app/actions/create-user'

export default function TestCreateUser() {
  async function handleClick() {
    const result = await createCrewAccount('manager1', 'password123', 'parto', 'manager')
    console.log(result)
    alert(JSON.stringify(result))
  }

  return <button onClick={handleClick}>Buat Akun Manager Test</button>
}