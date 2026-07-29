import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import { AlphabetGreekIcon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const LANGUAGES = ['en', 'el'] as const

export function LanguageToggle() {
  const { t, i18n } = useTranslation('nav')
  const current = (i18n.resolvedLanguage ?? i18n.language ?? 'en').slice(0, 2)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('languageToggle.changeLanguage')}
          className="gap-1"
        >
          <HugeiconsIcon icon={AlphabetGreekIcon} strokeWidth={2} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        <DropdownMenuGroup>
          {LANGUAGES.map((lng) => (
            <DropdownMenuItem
              key={lng}
              onClick={() => void i18n.changeLanguage(lng)}
              data-active={current === lng}
              className="data-[active=true]:font-semibold"
            >
              {t(`common:languages.${lng}`)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
