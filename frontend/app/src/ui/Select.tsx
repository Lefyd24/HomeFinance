import {
  Select as ShadcnSelect,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  value: string | undefined
  onValueChange: (value: string) => void
  options: SelectOption[]
  placeholder: string
  triggerClassName?: string
}

export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  triggerClassName,
}: SelectProps) {
  return (
    <ShadcnSelect value={value} onValueChange={onValueChange}>
      <SelectTrigger className={cn('w-full', triggerClassName)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper">
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </ShadcnSelect>
  )
}
