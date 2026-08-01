import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cx } from './cx.js';

const fieldBaseStyles =
  'w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-ink shadow-sm ' +
  'focus:border-navy-600 focus:outline focus:outline-2 focus:outline-navy-600/40 ' +
  'disabled:cursor-not-allowed disabled:bg-black/5';

export interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: (id: string) => ReactNode;
}

export function Field({ label, hint, error, required, children }: FieldProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
        {required ? <span aria-hidden="true" className="text-navy-700"> *</span> : null}
      </label>
      {children(id)}
      {hint && !error ? <p className="text-xs text-ink/60">{hint}</p> : null}
      {error ? (
        <p role="alert" className="text-xs font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cx(fieldBaseStyles, className)} {...props} />
  ),
);
TextInput.displayName = 'TextInput';

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cx(fieldBaseStyles, 'min-h-[6rem] resize-y', className)} {...props} />
  ),
);
TextArea.displayName = 'TextArea';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cx(fieldBaseStyles, 'bg-white', className)} {...props}>
      {children}
    </select>
  ),
);
Select.displayName = 'Select';

export interface CheckboxOptionProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  description?: string;
}

export function CheckboxOption({ label, description, className, ...props }: CheckboxOptionProps) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={cx(
        'flex cursor-pointer items-start gap-3 rounded-lg border border-black/10 bg-white p-3',
        'has-[:checked]:border-navy-600 has-[:checked]:bg-navy-50',
        className,
      )}
    >
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-black/20 text-navy-700 focus:ring-navy-600"
        {...props}
      />
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-ink/60">{description}</span> : null}
      </span>
    </label>
  );
}

export interface RadioOptionProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  description?: string;
}

export function RadioOption({ label, description, className, ...props }: RadioOptionProps) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={cx(
        'flex cursor-pointer items-start gap-3 rounded-lg border border-black/10 bg-white p-3',
        'has-[:checked]:border-navy-600 has-[:checked]:bg-navy-50',
        className,
      )}
    >
      <input
        id={id}
        type="radio"
        className="mt-0.5 h-4 w-4 flex-shrink-0 border-black/20 text-navy-700 focus:ring-navy-600"
        {...props}
      />
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-ink/60">{description}</span> : null}
      </span>
    </label>
  );
}

export function FieldLabel({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cx('text-sm font-medium text-ink', className)} {...props} />;
}
