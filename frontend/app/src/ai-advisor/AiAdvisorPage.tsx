import { useQuery } from '@tanstack/react-query'
import { PageContainer } from '../ui/PageContainer'
import { PageHeader } from '../ui/PageHeader'
import { ListCard } from '../ui/ListCard'
import { getChatStatus } from './aiChatApi'
import { ChatWidget } from './ChatWidget'

export function AiAdvisorPage() {
  const { data: status } = useQuery({
    queryKey: ['ai', 'status'],
    queryFn: getChatStatus,
  })

  return (
    <div className="h-[calc(100dvh-8rem)] lg:h-[calc(100dvh-3.5rem)] flex flex-col">
      <PageContainer className="pb-0 flex-none">
        <PageHeader
          title="AI Advisor"
          description={
            status?.configured === false
              ? 'AI chat is not configured on this server.'
              : 'Chat about your finances with live context from your data.'
          }
          className="mb-3"
        />
      </PageContainer>
      <ListCard as="div" className="flex-1 min-h-0 mx-3 sm:mx-4 lg:mx-6 mb-3 sm:mb-4 lg:mb-6 p-0 overflow-hidden max-w-6xl w-full self-center">
        <ChatWidget />
      </ListCard>
    </div>
  )
}
