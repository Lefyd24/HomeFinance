import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bot, Undo2, User } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ApiError } from '../lib/apiClient'
import { ListCard } from '../ui/ListCard'
import { PageContainer } from '../ui/PageContainer'
import { PageHeader } from '../ui/PageHeader'
import { Select } from '../ui/Select'
import type { InvestorProfile, InvestorProfileUpdate } from './investorProfileApi'
import {
  useInvestorProfile,
  useInvestorProfileOptions,
  useInvestorProfileRevisions,
  useUndoInvestorProfileRevision,
  useUpdateInvestorProfile,
} from './useInvestorProfile'

const ALLOCATION_ORDER = ['equity', 'bond', 'cash', 'crypto', 'other'] as const

/** Local form state — everything a string, so a half-typed number stays typeable. */
interface FormState {
  risk_tolerance: string
  primary_objective: string
  horizon_years: string
  liquidity_needs_months: string
  max_single_position_pct: string
  excluded_sectors: string
  excluded_symbols: string
  income_stability: string
  experience_level: string
  base_currency: string
  tax_residency: string
  notes: string
  allocation: Record<string, string>
}

function toForm(profile: InvestorProfile | undefined): FormState {
  const allocation: Record<string, string> = {}
  for (const key of ALLOCATION_ORDER) {
    const value = profile?.target_allocation?.[key]
    allocation[key] = value === undefined || value === null ? '' : String(value)
  }
  return {
    risk_tolerance: profile?.risk_tolerance ?? '',
    primary_objective: profile?.primary_objective ?? '',
    horizon_years: profile?.horizon_years?.toString() ?? '',
    liquidity_needs_months: profile?.liquidity_needs_months?.toString() ?? '',
    max_single_position_pct: profile?.max_single_position_pct?.toString() ?? '',
    excluded_sectors: (profile?.excluded_sectors ?? []).join(', '),
    excluded_symbols: (profile?.excluded_symbols ?? []).join(', '),
    income_stability: profile?.income_stability ?? '',
    experience_level: profile?.experience_level ?? '',
    base_currency: profile?.base_currency ?? '',
    tax_residency: profile?.tax_residency ?? '',
    notes: profile?.notes ?? '',
    allocation,
  }
}

function parseList(text: string): string[] | null {
  const items = text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return items.length ? items : null
}

function parseNumber(text: string): number | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}

function toPayload(form: FormState): InvestorProfileUpdate {
  const allocation: Record<string, number> = {}
  for (const [key, value] of Object.entries(form.allocation)) {
    const parsed = parseNumber(value)
    if (parsed !== null) allocation[key] = parsed
  }

  return {
    risk_tolerance: (form.risk_tolerance || null) as InvestorProfileUpdate['risk_tolerance'],
    primary_objective: (form.primary_objective ||
      null) as InvestorProfileUpdate['primary_objective'],
    horizon_years: parseNumber(form.horizon_years),
    liquidity_needs_months: parseNumber(form.liquidity_needs_months),
    max_single_position_pct: parseNumber(form.max_single_position_pct),
    excluded_sectors: parseList(form.excluded_sectors),
    excluded_symbols: parseList(form.excluded_symbols),
    income_stability: (form.income_stability || null) as InvestorProfileUpdate['income_stability'],
    experience_level: (form.experience_level || null) as InvestorProfileUpdate['experience_level'],
    base_currency: form.base_currency.trim() || null,
    tax_residency: form.tax_residency.trim() || null,
    notes: form.notes.trim() || null,
    // Sending {} would fail the server's "sums to 100" check for no reason.
    target_allocation: Object.keys(allocation).length ? allocation : null,
  }
}

/**
 * Who the advisor thinks you are.
 *
 * Everything here feeds the AI advisor's system prompt on every turn, which is
 * why the revision log sits at the bottom: the advisor can write to this page
 * itself, and a change to the basis of all future advice should never be
 * something you find out about by accident.
 */
export function InvestorProfilePage() {
  const { t } = useTranslation('advisor')
  const { data: profile, isLoading } = useInvestorProfile()

  return (
    <PageContainer>
      <PageHeader
        title={t('investorProfile.title')}
        description={t('investorProfile.description')}
      />

      {isLoading && <p className="text-muted-foreground">{t('investorProfile.loading')}</p>}

      {profile && (
        // Keyed on the server's last-write stamp so the form re-seeds from
        // scratch whenever the profile changes underneath it — after an undo
        // here, or after the advisor edits it from the chat. A remount is the
        // honest way to say "your edits are stale"; syncing state in an effect
        // would cascade renders and quietly fight the user's typing.
        <InvestorProfileForm key={profile.updated_at ?? 'unset'} profile={profile} />
      )}
    </PageContainer>
  )
}

function InvestorProfileForm({ profile }: { profile: InvestorProfile }) {
  const { t } = useTranslation('advisor')
  const { data: options } = useInvestorProfileOptions()
  const { data: revisions } = useInvestorProfileRevisions()
  const save = useUpdateInvestorProfile()
  const undo = useUndoInvestorProfileRevision()

  const [form, setForm] = useState<FormState>(() => toForm(profile))
  const [saved, setSaved] = useState(false)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
    setSaved(false)
  }

  const allocationTotal = useMemo(
    () =>
      Object.values(form.allocation).reduce((total, value) => total + (parseNumber(value) ?? 0), 0),
    [form.allocation],
  )
  const allocationEntered = Object.values(form.allocation).some((value) => value.trim() !== '')
  const allocationOff = allocationEntered && Math.abs(allocationTotal - 100) > 2

  const selectOptions = (values: string[] | undefined) =>
    (values ?? []).map((value) => ({
      value,
      label: t(`investorProfile.values.${value}`, { defaultValue: value }),
    }))

  const errorMessage =
    save.error instanceof ApiError
      ? save.error.message
      : save.error
        ? t('investorProfile.saveFailed')
        : null

  function handleSave() {
    save.mutate(toPayload(form), { onSuccess: () => setSaved(true) })
  }

  return (
    <>
      {!profile.is_set && (
        <Alert className="mb-4">
          <AlertDescription>{t('investorProfile.notSetYet')}</AlertDescription>
        </Alert>
      )}

      <ListCard as="div" className="mb-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="risk_tolerance">{t('investorProfile.fields.riskTolerance')}</Label>
            <Select
              value={form.risk_tolerance || undefined}
              onValueChange={(value) => set('risk_tolerance', value)}
              options={selectOptions(options?.risk_tolerances)}
              placeholder={t('investorProfile.choose')}
            />
          </div>

          <div>
            <Label htmlFor="primary_objective">{t('investorProfile.fields.primaryObjective')}</Label>
            <Select
              value={form.primary_objective || undefined}
              onValueChange={(value) => set('primary_objective', value)}
              options={selectOptions(options?.primary_objectives)}
              placeholder={t('investorProfile.choose')}
            />
          </div>

          <div>
            <Label htmlFor="horizon_years">{t('investorProfile.fields.horizonYears')}</Label>
            <Input
              id="horizon_years"
              inputMode="numeric"
              value={form.horizon_years}
              onChange={(event) => set('horizon_years', event.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {t('investorProfile.hints.horizonYears')}
            </p>
          </div>

          <div>
            <Label htmlFor="liquidity_needs_months">
              {t('investorProfile.fields.liquidityNeedsMonths')}
            </Label>
            <Input
              id="liquidity_needs_months"
              inputMode="numeric"
              value={form.liquidity_needs_months}
              onChange={(event) => set('liquidity_needs_months', event.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="max_single_position_pct">
              {t('investorProfile.fields.maxSinglePosition')}
            </Label>
            <Input
              id="max_single_position_pct"
              inputMode="decimal"
              value={form.max_single_position_pct}
              onChange={(event) => set('max_single_position_pct', event.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {t('investorProfile.hints.maxSinglePosition')}
            </p>
          </div>

          <div>
            <Label htmlFor="income_stability">{t('investorProfile.fields.incomeStability')}</Label>
            <Select
              value={form.income_stability || undefined}
              onValueChange={(value) => set('income_stability', value)}
              options={selectOptions(options?.income_stabilities)}
              placeholder={t('investorProfile.choose')}
            />
          </div>

          <div>
            <Label htmlFor="experience_level">{t('investorProfile.fields.experienceLevel')}</Label>
            <Select
              value={form.experience_level || undefined}
              onValueChange={(value) => set('experience_level', value)}
              options={selectOptions(options?.experience_levels)}
              placeholder={t('investorProfile.choose')}
            />
          </div>

          <div>
            <Label htmlFor="base_currency">{t('investorProfile.fields.baseCurrency')}</Label>
            <Input
              id="base_currency"
              value={form.base_currency}
              onChange={(event) => set('base_currency', event.target.value)}
              placeholder="EUR"
            />
          </div>

          <div>
            <Label htmlFor="tax_residency">{t('investorProfile.fields.taxResidency')}</Label>
            <Input
              id="tax_residency"
              maxLength={2}
              value={form.tax_residency}
              onChange={(event) => set('tax_residency', event.target.value.toUpperCase())}
              placeholder="GR"
            />
          </div>
        </div>
      </ListCard>

      <ListCard as="div" className="mb-4">
        <p className="text-sm font-medium text-foreground">
          {t('investorProfile.fields.targetAllocation')}
        </p>
        <p className="mt-1 mb-3 text-xs text-muted-foreground">
          {t('investorProfile.hints.targetAllocation')}
        </p>

        <div className="grid gap-3 sm:grid-cols-5">
          {ALLOCATION_ORDER.map((assetClass) => (
            <div key={assetClass}>
              <Label htmlFor={`allocation-${assetClass}`}>
                {t(`investorProfile.assetClasses.${assetClass}`)}
              </Label>
              <Input
                id={`allocation-${assetClass}`}
                inputMode="decimal"
                value={form.allocation[assetClass] ?? ''}
                onChange={(event) =>
                  set('allocation', { ...form.allocation, [assetClass]: event.target.value })
                }
              />
            </div>
          ))}
        </div>

        {allocationEntered && (
          <p
            className={
              allocationOff ? 'mt-2 text-xs text-destructive' : 'mt-2 text-xs text-muted-foreground'
            }
          >
            {t('investorProfile.allocationTotal', { total: Math.round(allocationTotal * 10) / 10 })}
          </p>
        )}
      </ListCard>

      <ListCard as="div" className="mb-4">
        <div className="grid gap-4">
          <div>
            <Label htmlFor="excluded_sectors">{t('investorProfile.fields.excludedSectors')}</Label>
            <Input
              id="excluded_sectors"
              value={form.excluded_sectors}
              onChange={(event) => set('excluded_sectors', event.target.value)}
              placeholder={t('investorProfile.hints.commaSeparated')}
            />
          </div>
          <div>
            <Label htmlFor="excluded_symbols">{t('investorProfile.fields.excludedSymbols')}</Label>
            <Input
              id="excluded_symbols"
              value={form.excluded_symbols}
              onChange={(event) => set('excluded_symbols', event.target.value)}
              placeholder={t('investorProfile.hints.commaSeparated')}
            />
          </div>
          <div>
            <Label htmlFor="notes">{t('investorProfile.fields.notes')}</Label>
            <Textarea
              id="notes"
              rows={3}
              value={form.notes}
              onChange={(event) => set('notes', event.target.value)}
              placeholder={t('investorProfile.hints.notes')}
            />
          </div>
        </div>
      </ListCard>

      {errorMessage && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      <div className="mb-8 flex items-center gap-3">
        <Button onClick={handleSave} disabled={save.isPending}>
          {save.isPending ? t('investorProfile.saving') : t('investorProfile.save')}
        </Button>
        {saved && !save.isPending && (
          <span className="text-sm text-muted-foreground">{t('investorProfile.saved')}</span>
        )}
      </div>

      {revisions && revisions.length > 0 && (
        <ListCard as="div">
          <p className="text-sm font-medium text-foreground">{t('investorProfile.history.title')}</p>
          <p className="mt-1 mb-3 text-xs text-muted-foreground">
            {t('investorProfile.history.description')}
          </p>

          <ul className="flex flex-col gap-2">
            {revisions.map((revision) => (
              <li
                key={revision.id}
                className="flex flex-wrap items-center gap-2 border-b border-border/40 pb-2 text-xs last:border-0"
              >
                {revision.source === 'agent' ? (
                  <Bot className="size-3.5 shrink-0 text-primary" aria-hidden />
                ) : (
                  <User className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <span className="font-medium text-foreground">
                  {t(`aiAdvisor.profileUpdate.fields.${revision.field}`, {
                    defaultValue: revision.field.replace(/_/g, ' '),
                  })}
                </span>
                <span className="text-muted-foreground">
                  {formatValue(revision.old_value)} → {formatValue(revision.new_value)}
                </span>
                {revision.created_at && (
                  <span className="text-muted-foreground">
                    {new Date(revision.created_at).toLocaleDateString()}
                  </span>
                )}
                {revision.reason && (
                  <span className="w-full text-muted-foreground italic">“{revision.reason}”</span>
                )}
                {revision.undone_at ? (
                  <span className="text-muted-foreground">
                    {t('aiAdvisor.profileUpdate.undone')}
                  </span>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-xs"
                    disabled={undo.isPending}
                    onClick={() => undo.mutate(revision.id)}
                  >
                    <Undo2 className="size-3" aria-hidden />
                    {t('aiAdvisor.profileUpdate.undo')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </ListCard>
      )}
    </>
  )
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—'
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => `${key} ${entry}%`)
      .join(', ')
  }
  return String(value)
}
