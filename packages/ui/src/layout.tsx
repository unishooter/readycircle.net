import type { HTMLAttributes } from 'react';
import { cx } from './cx.js';

export function Container({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8', className)} {...props} />;
}

export interface SectionProps extends HTMLAttributes<HTMLElement> {
  eyebrow?: string;
  title?: string;
  description?: string;
}

export function Section({ eyebrow, title, description, className, children, ...props }: SectionProps) {
  return (
    <section className={cx('py-16 sm:py-20', className)} {...props}>
      <Container>
        {(eyebrow || title || description) && (
          <div className="mx-auto max-w-2xl text-center">
            {eyebrow ? (
              <p className="text-sm font-semibold uppercase tracking-wide text-navy-700">{eyebrow}</p>
            ) : null}
            {title ? <h2 className="mt-2 text-2xl font-semibold text-ink sm:text-3xl">{title}</h2> : null}
            {description ? <p className="mt-4 text-base text-ink/70">{description}</p> : null}
          </div>
        )}
        {children}
      </Container>
    </section>
  );
}
