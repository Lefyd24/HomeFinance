import type { ComponentType, ReactNode } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Delete02Icon,
  MoneyReceiveSquareIcon,
  PencilEdit02Icon,
  ViewIcon,
} from '@hugeicons/core-free-icons'
import { canLinkReimbursement, type Transaction } from './transactionsApi'

export interface TransactionRowHandlers {
  onView: (transaction: Transaction) => void
  onEdit: (transaction: Transaction) => void
  onDelete: (transaction: Transaction) => void
  onLinkReimbursement: (transaction: Transaction) => void
}

type Translate = (key: string, options?: Record<string, unknown>) => string

/** The props both DropdownMenuItem and ContextMenuItem accept. */
type MenuItemComponent = ComponentType<{
  onClick?: () => void
  variant?: 'default' | 'destructive'
  children?: ReactNode
}>

/**
 * A transaction row's actions. Rendered by both the ⋮ dropdown and the row's
 * right-click menu, so the two can never offer different things.
 */
export function TransactionMenuItems({
  transaction,
  handlers,
  t,
  Item,
}: {
  transaction: Transaction
  handlers: TransactionRowHandlers
  t: Translate
  Item: MenuItemComponent
}) {
  return (
    <>
      <Item onClick={() => handlers.onView(transaction)}>
        <HugeiconsIcon icon={ViewIcon} strokeWidth={2} />
        {t('columns.menu.view')}
      </Item>
      <Item onClick={() => handlers.onEdit(transaction)}>
        <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
        {t('common:actions.edit')}
      </Item>
      {canLinkReimbursement(transaction) && (
        <Item onClick={() => handlers.onLinkReimbursement(transaction)}>
          <HugeiconsIcon icon={MoneyReceiveSquareIcon} strokeWidth={2} />
          {t(`reimbursement.menu.${transaction.type === 'income' ? 'income' : 'expense'}`)}
        </Item>
      )}
      <Item variant="destructive" onClick={() => handlers.onDelete(transaction)}>
        <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
        {t('common:actions.delete')}
      </Item>
    </>
  )
}
