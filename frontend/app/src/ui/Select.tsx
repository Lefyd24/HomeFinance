import {
  Select as ShadcnSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  value: string | undefined
  onValueChange: (value: string) => void
  options: SelectOption[]
  placeholder: string
}

export function Select({ value, onValueChange, options, placeholder }: SelectProps) {
  return (
    <ShadcnSelect value={value} onValueChange={onValueChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </ShadcnSelect>
  )
}
