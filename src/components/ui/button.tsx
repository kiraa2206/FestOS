import {cva, type VariantProps} from 'class-variance-authority'
import {forwardRef, type ButtonHTMLAttributes} from 'react'
import {cn} from '@/lib/utils'
const v = cva('inline-flex items-center justify-center rounded-full text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed', {
  variants: {variant: {default: 'bg-accent text-white hover:opacity-90', outline: 'border border-fg/25 text-fg hover:bg-fg/10', ghost: 'text-fg/60 hover:text-fg'}, size: {default: 'px-5 py-2', sm: 'px-3 py-1.5 text-xs'}},
  defaultVariants: {variant: 'default', size: 'default'}})
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof v>>(({className, variant, size, ...p}, ref) => <button ref={ref} className={cn(v({variant, size}), className)} {...p}/>)
