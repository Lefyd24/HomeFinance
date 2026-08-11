import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import { EyeIcon, EyeOffIcon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useBalanceVisibility } from '../ui/BalanceVisibilityContext'

/**
 * The shoulder-surfing guard every finance dashboard offers, pinned in the
 * top bar so it's reachable from anywhere rather than buried in a settings
 * page — it needs to be a one-tap reflex on a train or in an open office.
 */
export function BalanceVisibilityToggle() {
  const { t } = useTranslation('nav')
  const { hidden, toggle } = useBalanceVisibility()
  const label = hidden ? t('balanceToggle.show') : t('balanceToggle.hide')

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-9"
          onClick={toggle}
          aria-label={label}
          aria-pressed={hidden}
        >
          <HugeiconsIcon icon={hidden ? EyeOffIcon : EyeIcon} strokeWidth={2} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}
