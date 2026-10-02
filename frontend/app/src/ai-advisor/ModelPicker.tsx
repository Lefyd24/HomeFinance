import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { ModelInfo } from './aiChatApi'
import { formatAgo, formatPrice, formatTokens, shortModel } from './format'
import { useAiModels, useRefreshAiModels } from './useAiModels'

export type ModelSort = 'name' | 'price' | 'context'

const SORTS: { id: ModelSort; labelKey: string }[] = [
  { id: 'name', labelKey: 'aiAdvisor.models.sortName' },
  { id: 'price', labelKey: 'aiAdvisor.models.sortPrice' },
  { id: 'context', labelKey: 'aiAdvisor.models.sortContext' },
]

export function compareModels(sort: ModelSort): (a: ModelInfo, b: ModelInfo) => number {
  // Unknown prices sort last when cheapest-first.
  const price = (m: ModelInfo) => m.prompt_per_m ?? Number.POSITIVE_INFINITY
  if (sort === 'price') return (a, b) => price(a) - price(b) || a.name.localeCompare(b.name)
  if (sort === 'context')
    return (a, b) => b.context_length - a.context_length || a.name.localeCompare(b.name)
  return (a, b) => a.name.localeCompare(b.name)
}

export function filterModels(models: ModelInfo[], query: string, sort: ModelSort): ModelInfo[] {
  const needle = query.trim().toLowerCase()
  const matches = needle
    ? models.filter((m) => `${m.id} ${m.name}`.toLowerCase().includes(needle))
    : models
  return [...matches].sort(compareModels(sort))
}

function PriceLine({ model }: { model: ModelInfo }) {
  const { t } = useTranslation('advisor')
  const free = model.prompt_per_m === 0 && model.completion_per_m === 0
  const price = free
    ? t('aiAdvisor.models.free')
    : (formatPrice(model.prompt_per_m, model.completion_per_m) ??
      t('aiAdvisor.models.priceUnknown'))
  return (
    <span className="text-[10px] text-muted-foreground tabular-nums">
      {price} {free ? '' : t('aiAdvisor.models.perMillion')} ·{' '}
      {t('aiAdvisor.models.contextLength', { size: formatTokens(model.context_length) })}
    </span>
  )
}

/** Searchable picker over OpenRouter's tool-capable catalogue (cached a day server-side). */
export function ModelPicker({
  model,
  fallback = [],
  disabled,
  onChange,
}: {
  model: string
  /** Known info for models the catalogue may not list (the configured default). */
  fallback?: ModelInfo[]
  disabled?: boolean
  onChange: (model: string) => void
}) {
  const { t } = useTranslation('advisor')
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<ModelSort>('name')
  const catalog = useAiModels()
  const refresh = useRefreshAiModels()

  const models = catalog.data?.models
  const visible = useMemo(
    () => filterModels(models ?? fallback, query, sort),
    [models, fallback, query, sort],
  )

  function pick(id: string) {
    onChange(id)
    setOpen(false)
    setQuery('')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        aria-label={t('aiAdvisor.models.pickerLabel')}
        className="inline-flex h-7 max-w-40 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] text-muted-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
      >
        <span className="truncate">{model ? shortModel(model) : '…'}</span>
        <ChevronDown className="size-3 shrink-0" />
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-80 gap-0 p-0">
        <div className="flex flex-col gap-2 border-b p-2">
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('aiAdvisor.models.search')}
            aria-label={t('aiAdvisor.models.search')}
            className="h-7 text-xs md:text-xs"
          />
          <div className="flex gap-1" role="group">
            {SORTS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={sort === option.id}
                onClick={() => setSort(option.id)}
                className={cn(
                  'rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted',
                  sort === option.id && 'bg-muted font-medium text-foreground',
                )}
              >
                {t(option.labelKey)}
              </button>
            ))}
          </div>
        </div>
        <ul
          role="listbox"
          aria-label={t('aiAdvisor.models.pickerLabel')}
          className="max-h-72 overflow-y-auto p-1"
        >
          {catalog.isPending && (
            <li className="px-2 py-3 text-xs text-muted-foreground">
              {t('aiAdvisor.models.loading')}
            </li>
          )}
          {catalog.isError && (
            <li className="px-2 py-1.5 text-xs text-destructive">
              {t('aiAdvisor.models.unavailable')}
            </li>
          )}
          {!catalog.isPending && visible.length === 0 && (
            <li className="px-2 py-3 text-xs text-muted-foreground">
              {t('aiAdvisor.models.empty')}
            </li>
          )}
          {visible.map((m) => (
            <li key={m.id} role="option" aria-selected={m.id === model}>
              <button
                type="button"
                onClick={() => pick(m.id)}
                className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-start hover:bg-muted"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-xs font-medium">{m.name}</span>
                  <span className="truncate text-[10px] text-muted-foreground">{m.id}</span>
                  <PriceLine model={m} />
                </span>
                {m.id === model && <Check className="mt-0.5 size-3.5 shrink-0" />}
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2 border-t px-2 py-1.5 text-[10px] text-muted-foreground">
          <span className="min-w-0 flex-1 truncate">
            {catalog.data?.fetched_at
              ? t('aiAdvisor.models.updated', { when: formatAgo(catalog.data.fetched_at) })
              : t('aiAdvisor.models.count', { count: visible.length })}
          </span>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            aria-label={t('aiAdvisor.models.refresh')}
            title={t('aiAdvisor.models.refresh')}
          >
            <RefreshCw className={cn('size-3', refresh.isPending && 'animate-spin')} />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
