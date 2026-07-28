import { cn } from "@/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import { Loading03Icon } from "@hugeicons/core-free-icons"

// Props follow HugeiconsIcon rather than <svg>: its width/height are numeric
// only, so the raw SVG prop types the registry ships with do not typecheck.
type SpinnerProps = Omit<React.ComponentProps<typeof HugeiconsIcon>, "icon">

function Spinner({ className, ...props }: SpinnerProps) {
  return (
    <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} data-slot="spinner" role="status" aria-label="Loading" className={cn("size-4 animate-spin", className)} {...props} />
  )
}

export { Spinner }
