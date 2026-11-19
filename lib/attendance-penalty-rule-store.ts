import 'server-only'

import { supabaseAdmin } from '@/lib/supabase-admin'
import type { AttendancePenaltyRule, AttendancePenaltyPayrollEffect, AttendancePenaltyRuleAudience, AttendancePenaltyRuleKind } from '@/lib/attendance-penalty-rules'

type PenaltyRuleRow = {
  id: number
  rule_key: string
  label: string
  rule_kind: AttendancePenaltyRuleKind
  min_minutes: number | null
  max_minutes: number | null
  applies_to: AttendancePenaltyRuleAudience
  payroll_effect: AttendancePenaltyPayrollEffect
  points: number
  fine: number | string
  is_active: boolean
  effective_on: string
  created_at: string
}

function normalizeRule(row: PenaltyRuleRow): AttendancePenaltyRule {
  return {
    id: Number(row.id),
    ruleKey: row.rule_key,
    label: row.label,
    ruleKind: row.rule_kind,
    minMinutes: row.min_minutes === null ? null : Number(row.min_minutes),
    maxMinutes: row.max_minutes === null ? null : Number(row.max_minutes),
    appliesTo: row.applies_to,
    payrollEffect: row.payroll_effect,
    points: Number(row.points),
    fine: Number(row.fine),
    isActive: row.is_active !== false,
    effectiveOn: row.effective_on,
    createdAt: row.created_at,
  }
}

/** Server-only read: direct browser access to policy configuration is denied. */
export async function loadAttendancePenaltyRuleHistory(through?: string) {
  let query = supabaseAdmin
    .from('attendance_penalty_rule_history')
    .select('id,rule_key,label,rule_kind,min_minutes,max_minutes,applies_to,payroll_effect,points,fine,is_active,effective_on,created_at')
    .order('rule_key')
    .order('effective_on')
    .order('id')
  if (through) query = query.lte('effective_on', through)
  const { data, error } = await query
  if (error) return { data: [] as AttendancePenaltyRule[], error }
  return { data: ((data || []) as PenaltyRuleRow[]).map(normalizeRule), error: null }
}
