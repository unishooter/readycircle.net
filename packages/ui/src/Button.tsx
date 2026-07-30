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
  primary: 'bg-teal-700 text-white hover:bg-teal-800 focus-visible:outline-teal-700',
  secondary: 'bg-white text-teal-800 border border-teal-200 hover:bg-teal-50 focus-visible:outline-teal-700',
  ghost: 'bg-transparent text-ink hover:bg-black/5 focus-visible:outline-teal-700',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600',
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
