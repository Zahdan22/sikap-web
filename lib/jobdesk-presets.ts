export type JobdeskPreset = { id: number; nama: string; jobdeskIds: number[] }

export function jobdeskPresetError(message: string) {
  return /schema cache|does not exist|could not find/i.test(message)
    ? 'Jalankan migrasi 202610110003_jobdesk_presets.sql di Supabase, lalu muat ulang preset.'
    : message
}
