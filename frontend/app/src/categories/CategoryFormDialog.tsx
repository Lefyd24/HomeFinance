import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog } from '../ui/Dialog'
import { Select } from '../ui/Select'
import { useCreateCategory, useUpdateCategory, useCategories } from './useCategories'
import { IconPicker } from './IconPicker'
import type { Category, CategoryType } from './categoriesApi'

interface CategoryFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  category?: Category | null
}

const NONE_PARENT = '__none__'

export function CategoryFormDialog({ open, onOpenChange, category }: CategoryFormDialogProps) {
  const { t } = useTranslation('categories')
  const isEdit = !!category
  const isSystem = category?.is_system ?? false

  const [name, setName] = useState('')
  const [type, setType] = useState<CategoryType>('expense')
  const [color, setColor] = useState('#3B82F6')
  const [icon, setIcon] = useState<string>('default')
  const [parentId, setParentId] = useState<string>(NONE_PARENT)

  const { data: categories = [] } = useCategories()
  const createMutation = useCreateCategory()
  const updateMutation = useUpdateCategory()

  useEffect(() => {
    if (!open) return
    if (category) {
      setName(category.name)
      setType(category.type)
      setColor(category.color)
      setIcon(category.icon || 'default')
      setParentId(category.parent_id ? String(category.parent_id) : NONE_PARENT)
    } else {
      setName('')
      setType('expense')
      setColor('#3B82F6')
      setIcon('default')
      setParentId(NONE_PARENT)
    }
  }, [open, category])

  const parentOptions = [
    { value: NONE_PARENT, label: t('form.noneTopLevel') },
    ...categories
      .filter((cat) => !cat.parent_id && cat.type === type && cat.id !== category?.id)
      .map((cat) => ({ value: String(cat.id), label: cat.name })),
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (isSystem) {
      toast.error(t('toasts.systemEditError'))
      return
    }

    const input = {
      name: name.trim(),
      type,
      color,
      icon: icon || undefined,
      parent_id: parentId && parentId !== NONE_PARENT ? Number(parentId) : null,
    }

    try {
      if (isEdit && category) {
        await updateMutation.mutateAsync({ id: category.id, input })
        toast.success(t('toasts.updated'))
      } else {
        await createMutation.mutateAsync(input)
        toast.success(t('toasts.created'))
      }
      onOpenChange(false)
    } catch {
      toast.error(isEdit ? t('toasts.updateError') : t('toasts.createError'))
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <Dialog
      open={open}
      title={isEdit ? t('form.editTitle') : t('form.addTitle')}
      onOpenChange={onOpenChange}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">{t('form.name')}</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('form.namePlaceholder')}
            disabled={isSystem || isPending}
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>{t('form.type')}</Label>
          <Select
            value={type}
            onValueChange={(value) => {
              setType(value as CategoryType)
              setParentId(NONE_PARENT)
            }}
            options={[
              { value: 'income', label: t('form.types.income') },
              { value: 'expense', label: t('form.types.expense') },
              { value: 'transfer', label: t('form.types.transfer') },
            ]}
            placeholder={t('form.selectType')}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="color">{t('form.color')}</Label>
          <div className="flex items-center gap-2">
            <Input
              id="color"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              disabled={isSystem || isPending}
              className="h-10 w-20 cursor-pointer"
            />
            <Input
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="#3B82F6"
              disabled={isSystem || isPending}
              className="flex-1 font-mono text-sm"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label>{t('form.icon')}</Label>
          <IconPicker
            value={icon}
            onChange={setIcon}
            color={color}
            disabled={isSystem || isPending}
          />
        </div>
        {parentOptions.length > 1 && (
          <div className="flex flex-col gap-2">
            <Label>{t('form.parentCategory')}</Label>
            <Select
              value={parentId}
              onValueChange={setParentId}
              options={parentOptions}
              placeholder={t('form.selectParent')}
            />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            {t('form.cancel')}
          </Button>
          <Button type="submit" disabled={isSystem || isPending || !name.trim()}>
            {isPending ? t('form.saving') : isEdit ? t('form.save') : t('form.create')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
