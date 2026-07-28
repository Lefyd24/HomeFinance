import { useState } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageContainer } from '../ui/PageContainer'
import { PageHeader } from '../ui/PageHeader'
import { InvestmentTool } from './InvestmentTool'
import { LoanTool } from './LoanTool'
import { EmergencyFundTool } from './EmergencyFundTool'
import { NetWorthTool } from './NetWorthTool'

type ToolId = 'investment' | 'loan' | 'emergency' | 'networth'

const TOOLS: { id: ToolId; label: string }[] = [
  { id: 'investment', label: 'Investment' },
  { id: 'loan', label: 'Loan' },
  { id: 'emergency', label: 'Emergency fund' },
  { id: 'networth', label: 'Net worth' },
]

const TOOL_COMPONENT: Record<ToolId, () => React.JSX.Element> = {
  investment: InvestmentTool,
  loan: LoanTool,
  emergency: EmergencyFundTool,
  networth: NetWorthTool,
}

export function AdvisorPage() {
  const [tool, setTool] = useState<ToolId>('investment')
  const ActiveTool = TOOL_COMPONENT[tool]

  return (
    <PageContainer wide className="flex flex-col gap-5">
      <PageHeader
        title="Financial Advisor"
        description="Run financial calculations for investments, loans, emergency funds, and net worth."
      />

      <Tabs value={tool} onValueChange={(v) => setTool(v as ToolId)}>
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 sm:w-fit">
          {TOOLS.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="px-3.5 py-1.5">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <ActiveTool />
    </PageContainer>
  )
}
