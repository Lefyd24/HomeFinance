import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Analytics01Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  ChartLineData01Icon,
  Clock01Icon,
  Coins01Icon,
  Shield01Icon,
} from '@hugeicons/core-free-icons'
import type { Deflated } from '../scenariosApi'

const STORAGE_KEY = 'investments.backtest.honestyPanel'

interface StoredState {
  key: string
  collapsed: boolean
}

function readStoredCollapsed(resultKey: string): boolean {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    const stored = JSON.parse(raw) as StoredState
    return stored.key === resultKey ? stored.collapsed : false
  } catch {
    return false
  }
}

function Block({ icon, title, body }: { icon: typeof Clock01Icon; title: string; body: string }) {
  return (
    <div className="flex gap-2 border-l-2 border-border py-1 ps-3">
      <HugeiconsIcon icon={icon} strokeWidth={2} className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <div className="flex flex-col gap-0.5">
        <p className="text-xs font-medium text-foreground/90">{title}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  )
}

/**
 * Four static disclosures (hindsight, survivorship, costs, data basis) plus a
 * fifth when the backend has enough of the user's own trials to deflate a
 * Sharpe ratio. Always expanded on a fresh result — collapsing is something
 * the user opts into once they've read it, not the default — and re-expands
 * whenever a new scenario has just been run. The caller renders this with
 * `key={resultKey}` (see `BacktestPage`/`ScenarioDetailPage`), so a new
 * result remounts the panel rather than updating it in place — the state
 * resets naturally through the lazy initializer below, no effect needed.
 * See docs/investments/02-backtesting-sandbox.md §2.5 / §5.4.
 */
export function HonestyPanel({ deflated, resultKey }: { deflated: Deflated | null; resultKey: string }) {
  const { t } = useTranslation('investments')
  const [collapsed, setCollapsed] = useState(() => readStoredCollapsed(resultKey))

  function toggle() {
    const next = !collapsed
    setCollapsed(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ key: resultKey, collapsed: next }))
    } catch {
      // Best-effort persistence — a private-browsing quota error shouldn't block the toggle.
    }
  }

  const showDeflated = deflated != null && deflated.dsr != null

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-sm">
      <button
        type="button"
        onClick={toggle}
        className="flex items-center justify-between gap-2 text-left"
        aria-expanded={!collapsed}
      >
        <span className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {t('backtest.honesty.title')}
        </span>
        <HugeiconsIcon
          icon={collapsed ? ArrowDown01Icon : ArrowUp01Icon}
          strokeWidth={2}
          className="size-3.5 shrink-0 text-muted-foreground"
        />
      </button>
      {!collapsed && (
        <div className="flex flex-col gap-2">
          <Block icon={Clock01Icon} title={t('backtest.honesty.hindsight.title')} body={t('backtest.honesty.hindsight.body')} />
          <Block
            icon={Shield01Icon}
            title={t('backtest.honesty.survivorship.title')}
            body={t('backtest.honesty.survivorship.body')}
          />
          <Block icon={Coins01Icon} title={t('backtest.honesty.costs.title')} body={t('backtest.honesty.costs.body')} />
          <Block
            icon={ChartLineData01Icon}
            title={t('backtest.honesty.data.title')}
            body={t('backtest.honesty.data.body')}
          />
          {showDeflated && deflated && (
            <Block
              icon={Analytics01Icon}
              title={t('backtest.honesty.deflated.title')}
              body={t('backtest.honesty.deflated.body', {
                nTrials: deflated.n_trials,
                expected: deflated.expected_max_sharpe?.toFixed(2) ?? '—',
                actual: deflated.sharpe?.toFixed(2) ?? '—',
              })}
            />
          )}
        </div>
      )}
    </div>
  )
}
