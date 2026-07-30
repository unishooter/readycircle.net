import type { HTMLAttributes } from 'react';
import { cx } from './cx.js';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx('rounded-xl border border-black/5 bg-white p-6 shadow-soft', className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cx('text-lg font-semibold text-ink', className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cx('mt-1 text-sm text-ink/70', className)} {...props} />;
}
