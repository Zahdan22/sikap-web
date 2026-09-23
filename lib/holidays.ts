// lib/holidays.ts
// Sumber: SKB 3 Menteri No. 1497/2025, No. 2/2025, No. 5/2025 tentang Hari Libur Nasional
// dan Cuti Bersama Tahun 2026 (ditetapkan 19 September 2025)

export type Holiday = { date: string; nama: string; type: 'libur' | 'cuti_bersama' }

export const holidays2026: Holiday[] = [
  { date: '2026-01-01', nama: 'Tahun Baru Masehi', type: 'libur' },
  { date: '2026-01-16', nama: 'Isra Mikraj Nabi Muhammad SAW', type: 'libur' },
  { date: '2026-02-16', nama: 'Cuti Bersama Imlek', type: 'cuti_bersama' },
  { date: '2026-02-17', nama: 'Tahun Baru Imlek 2577', type: 'libur' },
  { date: '2026-03-18', nama: 'Cuti Bersama Nyepi', type: 'cuti_bersama' },
  { date: '2026-03-19', nama: 'Hari Suci Nyepi', type: 'libur' },
  { date: '2026-03-20', nama: 'Cuti Bersama Idulfitri', type: 'cuti_bersama' },
  { date: '2026-03-21', nama: 'Idulfitri 1447 H', type: 'libur' },
  { date: '2026-03-22', nama: 'Idulfitri 1447 H', type: 'libur' },
  { date: '2026-03-23', nama: 'Cuti Bersama Idulfitri', type: 'cuti_bersama' },
  { date: '2026-03-24', nama: 'Cuti Bersama Idulfitri', type: 'cuti_bersama' },
  { date: '2026-04-03', nama: 'Wafat Yesus Kristus', type: 'libur' },
  { date: '2026-04-05', nama: 'Kebangkitan Yesus Kristus (Paskah)', type: 'libur' },
  { date: '2026-05-01', nama: 'Hari Buruh Internasional', type: 'libur' },
  { date: '2026-05-14', nama: 'Kenaikan Yesus Kristus', type: 'libur' },
  { date: '2026-05-15', nama: 'Cuti Bersama Kenaikan Yesus Kristus', type: 'cuti_bersama' },
  { date: '2026-05-27', nama: 'Iduladha 1447 H', type: 'libur' },
  { date: '2026-05-28', nama: 'Cuti Bersama Iduladha', type: 'cuti_bersama' },
  { date: '2026-05-31', nama: 'Hari Raya Waisak 2570', type: 'libur' },
  { date: '2026-06-01', nama: 'Hari Lahir Pancasila', type: 'libur' },
  { date: '2026-06-16', nama: '1 Muharam / Tahun Baru Islam 1448 H', type: 'libur' },
  { date: '2026-08-17', nama: 'Hari Kemerdekaan RI', type: 'libur' },
  { date: '2026-08-25', nama: 'Maulid Nabi Muhammad SAW', type: 'libur' },
  { date: '2026-12-24', nama: 'Cuti Bersama Natal', type: 'cuti_bersama' },
  { date: '2026-12-25', nama: 'Hari Raya Natal', type: 'libur' },
]

export function getHoliday(dateStr: string): Holiday | undefined {
  return holidays2026.find((h) => h.date === dateStr)
}