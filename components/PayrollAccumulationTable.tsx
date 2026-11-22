type PayrollAccumulationTableProps = {
  grossBasePay: number
  managementTitlePay: number
  referralBonus: number
  operationalBonus: number
  noLateReward: number
  leavePay: number
  cashAdvance: number
  operationalFine: number
  lateFine: number
  adjustments: Array<{ id: number; adjustmentType: 'sp_deduction' | 'other_deduction' | 'addition'; amount: number; reason: string }>
}

const idr = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})

/**
 * Ringkasan ini sengaja bukan "gaji bersih" karena lembur tetap ditampilkan di
 * rincian slip. Komponen manual dan penyesuaian yang Finance masukkan sendiri
 * ditampilkan di sini agar perubahan nominalnya mudah ditelusuri.
 */
export default function PayrollAccumulationTable({
  grossBasePay,
  managementTitlePay,
  referralBonus,
  operationalBonus,
  noLateReward,
  leavePay,
  cashAdvance,
  operationalFine,
  lateFine,
  adjustments,
}: PayrollAccumulationTableProps) {
  const manualAdditions = adjustments.filter((item) => item.adjustmentType === 'addition').reduce((sum, item) => sum + item.amount, 0)
  const manualDeductions = adjustments.filter((item) => item.adjustmentType !== 'addition').reduce((sum, item) => sum + item.amount, 0)
  const subtotal = grossBasePay
    + managementTitlePay
    + referralBonus
    + operationalBonus
    + noLateReward
    + leavePay
    + manualAdditions
    - cashAdvance
    - operationalFine
    - lateFine
    - manualDeductions

  return (
    <section className="rounded-2xl border border-cream-dim bg-cream-card p-4">
      <h2 className="text-sm font-semibold text-ink">Akumulasi periode</h2>
      <div className="mt-3 overflow-hidden rounded-xl border border-cream-dim">
        <table className="w-full text-left text-xs">
          <tbody>
            <tr className="border-b border-cream-dim">
              <th className="bg-cream px-3 py-2 font-medium text-muted">Total gaji pokok operasional</th>
              <td className="px-3 py-2 text-right font-semibold text-ink">{idr.format(grossBasePay)}</td>
            </tr>
            {managementTitlePay > 0 && <tr className="border-b border-cream-dim">
              <th className="bg-cream px-3 py-2 font-medium text-muted">Total gaji manajemen</th>
              <td className="px-3 py-2 text-right font-semibold text-success">{idr.format(managementTitlePay)}</td>
            </tr>}
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
              <th className="bg-cream px-3 py-2 font-medium text-muted">Cuti</th>
              <td className="px-3 py-2 text-right font-semibold text-success">{idr.format(leavePay)}</td>
            </tr>
            {adjustments.map((adjustment) => {
              const addition = adjustment.adjustmentType === 'addition'
              const label = adjustment.adjustmentType === 'sp_deduction' ? 'Potongan SP' : addition ? 'Tambahan' : 'Potongan'
              return <tr key={adjustment.id} className="border-b border-cream-dim">
                <th className="bg-cream px-3 py-2 font-medium text-muted">{label} — {adjustment.reason}</th>
                <td className={'px-3 py-2 text-right font-semibold ' + (addition ? 'text-success' : 'text-warning')}>{addition ? '' : '−'}{idr.format(adjustment.amount)}</td>
              </tr>
            })}
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
    </section>
  )
}
