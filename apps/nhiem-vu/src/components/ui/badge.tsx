import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] font-medium leading-5 whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'bg-ink-soft text-primary',
        outline: 'border border-border text-muted-foreground',
        done: 'bg-done-soft text-done',
        soon: 'bg-soon-soft text-soon',
        flag: 'bg-flag-soft text-flag',
        muted: 'bg-muted text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

// eslint-disable-next-line react-refresh/only-export-components
export { Badge, badgeVariants }
