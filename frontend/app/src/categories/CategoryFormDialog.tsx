import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog } from '../ui/Dialog'
import { Select } from '../ui/Select'
import { useCreateCategory, useUpdateCategory, useCategories } from './useCategories'
import { CategoryIcon, ICON_MAP, type IconKey } from './categoryIcons'
import { cn } from '@/lib/utils'
import type { Category, CategoryType } from './categoriesApi'

interface CategoryFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  category?: Category | null
}

const NONE_PARENT = '__none__'

export function CategoryFormDialog({ open, onOpenChange, category }: CategoryFormDialogProps) {
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
    { value: NONE_PARENT, label: 'None (top-level)' },
    ...categories
      .filter((cat) => !cat.parent_id && cat.type === type && cat.id !== category?.id)
      .map((cat) => ({ value: String(cat.id), label: cat.name })),
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (isSystem) {
      toast.error('System categories cannot be edited')
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
        toast.success('Category updated')
      } else {
        await createMutation.mutateAsync(input)
        toast.success('Category created')
      }
      onOpenChange(false)
    } catch {
      toast.error(isEdit ? 'Failed to update category' : 'Failed to create category')
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending
  const iconKeys = Object.keys(ICON_MAP) as IconKey[]

  return (
    <Dialog open={open} title={isEdit ? 'Edit category' : 'Add category'} onOpenChange={onOpenChange}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Category name"
            disabled={isSystem || isPending}
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Type</Label>
          <Select
            value={type}
            onValueChange={(value) => {
              setType(value as CategoryType)
              setParentId(NONE_PARENT)
            }}
            options={[
              { value: 'income', label: 'Income' },
              { value: 'expense', label: 'Expense' },
              { value: 'transfer', label: 'Transfer' },
            ]}
            placeholder="Select type"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="color">Color</Label>
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
          <Label>Icon</Label>
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-2">
            <CategoryIcon icon={icon} color={color} className="size-11" size={22} />
            <div className="min-w-0">
              <p className="text-sm font-medium capitalize">{icon}</p>
              <p className="text-xs text-muted-foreground">Preview with selected color</p>
            </div>
          </div>
          <ScrollArea className="h-44 rounded-lg border border-border">
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 p-2">
              {iconKeys.map((key) => {
                const selected = icon === key
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={isSystem || isPending}
                    onClick={() => setIcon(key)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-lg border p-2 transition-colors',
                      selected
                        ? 'border-primary bg-primary/15 ring-1 ring-primary/40'
                        : 'border-transparent hover:bg-muted',
                      (isSystem || isPending) && 'opacity-50 cursor-not-allowed',
                    )}
                    aria-pressed={selected}
                    aria-label={`Icon ${key}`}
                  >
                    <CategoryIcon icon={key} color={selected ? color : '#64748b'} size={18} />
                    <span className="text-[10px] capitalize text-muted-foreground truncate w-full text-center">
                      {key}
                    </span>
                  </button>
                )
              })}
            </div>
          </ScrollArea>
        </div>

        {parentOptions.length > 1 && (
          <div className="flex flex-col gap-2">
            <Label>Parent category (optional)</Label>
            <Select
              value={parentId}
              onValueChange={setParentId}
              options={parentOptions}
              placeholder="Select parent"
            />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSystem || isPending || !name.trim()}>
            {isPending ? 'Saving…' : isEdit ? 'Save' : 'Create'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
