import {cva, type VariantProps} from 'class-variance-authority'
import {cn} from '@/lib/utils'
const v = cva('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs whitespace-nowrap', {variants: {kind: {
  verified: 'border-teal-600/60 text-teal-700 dark:border-teal-300/60 dark:text-teal-300', calculated: 'border-amber-600/60 text-amber-700 dark:border-amber-300/60 dark:text-amber-300', assumption: 'border-sky-600/60 text-sky-700 dark:border-sky-300/60 dark:text-sky-300', unresolved: 'border-red-600/70 text-red-600 dark:border-red-400/70 dark:text-red-400', stated: 'border-fg/30 text-fg/60'}}})
export const Badge = ({kind, className, children}: VariantProps<typeof v> & {className?: string; children: React.ReactNode}) => <span className={cn(v({kind}), className)}>{children}</span>
