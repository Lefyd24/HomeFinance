import { useQuery } from '@tanstack/react-query'
import { PageContainer } from '../ui/PageContainer'
import { PageHeader } from '../ui/PageHeader'
import { ListCard } from '../ui/ListCard'
import { ProgressBar } from '../ui/ProgressBar'
import { StatCard, StatStrip } from '../ui/StatStrip'
import { formatCurrency } from '../lib/format'
import * as advisorApi from './advisorApi'

export function AdvisorPage() {
  const { data: netWorth, isLoading: netWorthLoading } = useQuery({
    queryKey: ['advisor', 'net-worth'],
    queryFn: advisorApi.getNetWorth,
  })
  const { data: emergencyFund, isLoading: fundLoading } = useQuery({
    queryKey: ['advisor', 'emergency-fund'],
    queryFn: advisorApi.getEmergencyFundRecommendation,
  })

  const recommended = emergencyFund?.recommendations.recommended ?? 0
  const current = emergencyFund?.current_liquid_assets ?? 0
  const coveragePct =
    recommended > 0 ? Math.min((current / recommended) * 100, 100) : 0

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        title="Financial Advisor"
        description="Net worth snapshot and emergency fund coverage."
      />

      {(netWorthLoading || fundLoading) && (
        <p className="text-muted-foreground">Loading advisor insights…</p>
      )}

      {netWorth && (
        <StatStrip>
          <StatCard label="Net worth" value={formatCurrency(netWorth.net_worth)} tone="primary" />
          <StatCard label="Assets" value={formatCurrency(netWorth.total_assets)} />
          <StatCard label="Liabilities" value={formatCurrency(netWorth.total_liabilities)} />
        </StatStrip>
      )}

      {emergencyFund && (
        <ListCard as="div">
          <p className="font-semibold text-foreground mb-1">Emergency fund</p>
          <p className="text-sm text-muted-foreground mb-3">
            {`${formatCurrency(current)} saved of a recommended ${formatCurrency(recommended)}`}
          </p>
          <ProgressBar value={coveragePct} variant="success" />
          <p className="text-xs text-muted-foreground mt-2">{emergencyFund.message}</p>
        </ListCard>
      )}
    </PageContainer>
  )
}
