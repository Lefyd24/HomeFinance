import type { TFunction } from 'i18next'
import type { CategoryRule, RuleCondition, RuleOperator } from './rulesApi'

export function describeCondition(
  condition: RuleCondition,
  t: TFunction<'rules'>,
  accountName?: (id: number) => string,
): string {
  const fieldLabel = t(`summary.fields.${condition.field}` as 'summary.fields.description')
  let value = condition.value ?? ''
  if (condition.field === 'account_id' && condition.value && accountName) {
    value = accountName(Number(condition.value))
  }

  const op = condition.operator as RuleOperator
  if (op === 'between') {
    return t('summary.between', {
      field: fieldLabel,
      value,
      valueTo: condition.value_to ?? '',
    })
  }

  const key = `summary.${op}` as const
  return t(key, { field: fieldLabel, value })
}

export function describeRule(
  rule: CategoryRule,
  t: TFunction<'rules'>,
  accountName?: (id: number) => string,
): string {
  const joiner = rule.match_type === 'any' ? t('summary.or') : t('summary.and')
  const conditions = (rule.conditions || [])
    .map((c) => describeCondition(c, t, accountName))
    .join(joiner)
  const category = rule.category_name || `#${rule.category_id}`
  return `${conditions} ${t('list.arrow')} ${category}`
}
