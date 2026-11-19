export type AttendancePenaltyRuleKind = 'late_checkin' | 'late_checkout' | 'missing_checkin' | 'missing_meal'
export type AttendancePenaltyRuleAudience = 'all' | 'senior_plus' | 'non_senior_plus'
export type AttendancePenaltyPayrollEffect = 'deduction' | 'unpaid' | 'disciplinary'

export type AttendancePenaltyRule = {
  id: number
  ruleKey: string
  label: string
  ruleKind: AttendancePenaltyRuleKind
  minMinutes: number | null
  maxMinutes: number | null
  appliesTo: AttendancePenaltyRuleAudience
  payrollEffect: AttendancePenaltyPayrollEffect
  points: number
  fine: number
  isActive: boolean
  effectiveOn: string
  createdAt?: string
}

export type AttendancePenaltyRuleLookup = {
  kind: AttendancePenaltyRuleKind
  minutesLate?: number
  supportsSeniorPlus?: boolean
}

function versionCompare(a: AttendancePenaltyRule, b: AttendancePenaltyRule) {
  return a.effectiveOn.localeCompare(b.effectiveOn) || a.id - b.id
}

/**
 * Returns the most recent version of one rule that was already effective on a
 * particular work date. It deliberately keeps inactive versions so the
 * settings screen can show that a rule was turned off on a certain date.
 */
export function attendancePenaltyRuleVersionOn(history: AttendancePenaltyRule[], ruleKey: string, date: string) {
  return history
    .filter((rule) => rule.ruleKey === ruleKey && rule.effectiveOn <= date)
    .sort(versionCompare)
    .at(-1) || null
}

/**
 * Produces the active rule set for a work date. A new version only affects
 * shifts on or after its effective date, preserving prior draft calculations.
 */
export function activeAttendancePenaltyRulesOn(history: AttendancePenaltyRule[], date: string) {
  const currentByKey = new Map<string, AttendancePenaltyRule>()
  for (const rule of history) {
    if (rule.effectiveOn > date) continue
    const previous = currentByKey.get(rule.ruleKey)
    if (!previous || versionCompare(previous, rule) < 0) currentByKey.set(rule.ruleKey, rule)
  }
  return [...currentByKey.values()].filter((rule) => rule.isActive)
}

function audienceMatches(rule: AttendancePenaltyRule, supportsSeniorPlus: boolean | undefined) {
  if (rule.appliesTo === 'all') return true
  if (supportsSeniorPlus === undefined) return false
  return rule.appliesTo === 'senior_plus' ? supportsSeniorPlus : !supportsSeniorPlus
}

function minutesMatch(rule: AttendancePenaltyRule, minutesLate: number | undefined) {
  if (rule.minMinutes === null && rule.maxMinutes === null) return true
  if (!Number.isFinite(minutesLate)) return false
  const minutes = Number(minutesLate)
  return (rule.minMinutes === null || minutes >= rule.minMinutes) && (rule.maxMinutes === null || minutes <= rule.maxMinutes)
}

/**
 * Resolves the user-configurable points and nominal based on a fixed SOP time
 * band. The caller still owns fixed business consequences such as a non-Senior
 * crew member working unpaid after 30 minutes late.
 */
export function resolveAttendancePenaltyRule(history: AttendancePenaltyRule[], date: string, lookup: AttendancePenaltyRuleLookup) {
  const candidates = activeAttendancePenaltyRulesOn(history, date)
    .filter((rule) => rule.ruleKind === lookup.kind)
    .filter((rule) => audienceMatches(rule, lookup.supportsSeniorPlus))
    .filter((rule) => minutesMatch(rule, lookup.minutesLate))

  candidates.sort((a, b) => {
    const audienceSpecificity = Number(b.appliesTo !== 'all') - Number(a.appliesTo !== 'all')
    if (audienceSpecificity !== 0) return audienceSpecificity
    const minimum = Number(b.minMinutes ?? -1) - Number(a.minMinutes ?? -1)
    if (minimum !== 0) return minimum
    return versionCompare(b, a)
  })
  return candidates[0] || null
}
