import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageContainer } from '../ui/PageContainer'
import { PageHeader } from '../ui/PageHeader'
import { ViewSelect } from '../ui/ViewSelect'
import { InvestmentTool } from './InvestmentTool'
import { LoanTool } from './LoanTool'
import { EmergencyFundTool } from './EmergencyFundTool'
import { NetWorthTool } from './NetWorthTool'

type ToolId = 'investment' | 'loan' | 'emergency' | 'networth'

const TOOL_COMPONENT: Record<ToolId, () => React.JSX.Element> = {
  investment: InvestmentTool,
  loan: LoanTool,
  emergency: EmergencyFundTool,
  networth: NetWorthTool,
}

export function AdvisorPage() {
  const { t } = useTranslation('advisor')
  const [tool, setTool] = useState<ToolId>('investment')
  const ActiveTool = TOOL_COMPONENT[tool]

  const tools = useMemo(
    () =>
      (
        [
          { id: 'investment' as const, labelKey: 'tools.investment' },
          { id: 'loan' as const, labelKey: 'tools.loan' },
          { id: 'emergency' as const, labelKey: 'tools.emergency' },
          { id: 'networth' as const, labelKey: 'tools.networth' },
        ] as const
      ).map((item) => ({ id: item.id, label: t(item.labelKey) })),
    [t],
  )

  return (
    <PageContainer wide className="flex flex-col gap-5">
      <PageHeader title={t('page.title')} description={t('page.description')} />

      {/* Which tool you are in. On a phone that is a dropdown — "Emergency fund"
          and "Net worth" alone will not share a row with the other two. The
          strips *inside* each tool stay tabs: they switch a view within one
          calculator and are short enough to fit. */}
      <ViewSelect
        label={t('page.toolLabel')}
        value={tool}
        onValueChange={(v) => setTool(v as ToolId)}
        options={tools.map((item) => ({ value: item.id, label: item.label }))}
        className="sm:hidden"
      />

      <Tabs value={tool} onValueChange={(v) => setTool(v as ToolId)} className="max-sm:hidden">
        <TabsList fullWidth className="w-full">
          {tools.map((item) => (
            <TabsTrigger key={item.id} value={item.id} className="px-3.5">
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <ActiveTool />
    </PageContainer>
  )
}
