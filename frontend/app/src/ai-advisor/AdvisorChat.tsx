import { useTranslation } from 'react-i18next'
import { useAdvisor } from './advisorContext'
import { ChatWidget } from './ChatWidget'

/** The conversation, wired to the app-wide advisor state. */
export function AdvisorChat({ onClose }: { onClose?: () => void }) {
  const { t } = useTranslation('advisor')
  const { chat, status, statusLoading, available } = useAdvisor()
  const { turns, isStreaming, send, stop, clear, retry, model, selectModel } = chat

  return (
    <ChatWidget
      turns={turns}
      isStreaming={isStreaming}
      onSend={send}
      onStop={stop}
      onRetry={retry}
      onClear={turns.length > 0 ? clear : undefined}
      onClose={onClose}
      disabled={statusLoading || !available}
      disabledReason={t('aiAdvisor.unavailableReason')}
      showInvestmentPrompts={status?.investment_tools_enabled ?? false}
      model={model}
      onModelChange={selectModel}
    />
  )
}
