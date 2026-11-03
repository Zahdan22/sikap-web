type PayrollAccumulationTableProps = {
  grossBasePay: number
  referralBonus: number
  operationalBonus: number
  noLateReward: number
  cashAdvance: number
  operationalFine: number
  lateFine: number
}

const idr = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})

/**
 * Ringkasan ini sengaja bukan "gaji bersih". Lembur dan penyesuaian payroll
 * lain tetap berada di rincian slip agar angka ringkasan tidak disalahartikan.
 */
export default function PayrollAccumulationTable({
  grossBasePay,
  referralBonus,
  operationalBonus,
  noLateReward,
  cashAdvance,
  operationalFine,
  lateFine,
}: PayrollAccumulationTableProps) {
  const subtotal = grossBasePay
    + referralBonus
    + operationalBonus
    + noLateReward
    - cashAdvance
    - operationalFine
    - lateFine

  return (
    <section className="rounded-2xl border border-cream-dim bg-cream-card p-4">
      <h2 className="text-sm font-semibold text-ink">Akumulasi periode</h2>
      <div className="mt-3 overflow-hidden rounded-xl border border-cream-dim">
        <table className="w-full text-left text-xs">
          <tbody>
            <tr className="border-b border-cream-dim">
              <th className="bg-cream px-3 py-2 font-medium text-muted">Total gaji pokok</th>
              <td className="px-3 py-2 text-right font-semibold text-ink">{idr.format(grossBasePay)}</td>
            </tr>
            <tr className="border-b border-cream-dim">
              <th className="bg-cream px-3 py-2 font-medium text-muted">Bonus bawa teman</th>
              <td className="px-3 py-2 text-right font-semibold text-success">{idr.format(referralBonus)}</td>
            </tr>
            <tr className="border-b border-cream-dim">
              <th className="bg-cream px-3 py-2 font-medium text-muted">Bonus operasional</th>
              <td className="px-3 py-2 text-right font-semibold text-success">{idr.format(operationalBonus)}</td>
            </tr>
            <tr className="border-b border-cream-dim">
              <th className="bg-cream px-3 py-2 font-medium text-muted">Reward tidak telat</th>
              <td className="px-3 py-2 text-right font-semibold text-success">{idr.format(noLateReward)}</td>
            </tr>
            <tr className="border-b border-cream-dim">
              <th className="bg-cream px-3 py-2 font-medium text-muted">Denda Operasional</th>
              <td className="px-3 py-2 text-right font-semibold text-warning">−{idr.format(operationalFine)}</td>
            </tr>
            <tr className="border-b border-cream-dim">
              <th className="bg-cream px-3 py-2 font-medium text-muted">Denda Telat</th>
              <td className="px-3 py-2 text-right font-semibold text-warning">−{idr.format(lateFine)}</td>
            </tr>
            <tr className="border-b border-cream-dim">
              <th className="bg-cream px-3 py-2 font-medium text-muted">Kasbon</th>
              <td className="px-3 py-2 text-right font-semibold text-warning">−{idr.format(cashAdvance)}</td>
            </tr>
            <tr>
              <th className="bg-brand/10 px-3 py-2 font-semibold text-brand">Total akumulasi periode</th>
              <td className="px-3 py-2 text-right font-bold text-brand">{idr.format(subtotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-muted">Total gaji pokok mencakup shift, tunjangan Senior+, dan gelar management. Lembur serta penyesuaian lain tetap ada di rincian slip.</p>
    </section>
  )
}
