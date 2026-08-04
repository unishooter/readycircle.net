import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { cx } from './cx.js';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-navy-700 text-white hover:bg-navy-800 focus-visible:outline-navy-700',
  secondary: 'bg-white text-navy-800 border border-navy-200 hover:bg-navy-50 focus-visible:outline-navy-700',
  ghost: 'bg-transparent text-ink hover:bg-black/5 focus-visible:outline-navy-700',
  danger:
    'bg-transparent text-red-700 border border-red-300 hover:bg-red-50 focus-visible:outline-red-600',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'text-sm px-3 py-1.5 rounded-md',
  md: 'text-sm px-4 py-2.5 rounded-lg',
  lg: 'text-base px-6 py-3 rounded-lg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className, ...props }, ref) => (
    <button
      ref={ref}
      className={cx(
        'inline-flex items-center justify-center gap-2 font-medium transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
