import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog } from '../ui/Dialog'
import { Select } from '../ui/Select'
import { useCreateCategory } from './useCategories'

const categorySchema = z.object({
  name: z.string().min(1, 'Category name is required').max(100),
  type: z.enum(['income', 'expense', 'transfer']),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Use a hex color like #3B82F6'),
})

type CategoryForm = z.infer<typeof categorySchema>

const TYPE_OPTIONS = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
]

export function CategoryFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const createCategory = useCreateCategory()
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CategoryForm>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: '', type: 'expense', color: '#3B82F6' },
  })

  const onSubmit = handleSubmit(async (data) => {
    await createCategory.mutateAsync(data)
    onOpenChange(false)
  })

  return (
    <Dialog open={open} title="Add category" onOpenChange={onOpenChange}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="name">Category name</Label>
          <Input id="name" {...register('name')} />
          {errors.name && <p className="text-destructive text-sm">{errors.name.message}</p>}
        </div>
        <div className="space-y-2">
          <Label>Type</Label>
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={field.onChange}
                options={TYPE_OPTIONS}
                placeholder="Choose a type"
              />
            )}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="color">Color</Label>
          <Input id="color" type="color" className="h-10 w-full p-1" {...register('color')} />
          {errors.color && <p className="text-destructive text-sm">{errors.color.message}</p>}
        </div>
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          Save
        </Button>
      </form>
    </Dialog>
  )
}
