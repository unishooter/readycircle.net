import { cx } from './cx.js';

export interface StepperProps {
  steps: string[];
  currentStep: number;
}

export function Stepper({ steps, currentStep }: StepperProps) {
  return (
    <ol className="flex flex-wrap gap-2" aria-label="Progress">
      {steps.map((step, index) => {
        const isComplete = index < currentStep;
        const isCurrent = index === currentStep;
        return (
          <li key={step} className="flex items-center gap-2">
            <span
              className={cx(
                'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold',
                isComplete && 'bg-navy-700 text-white',
                isCurrent && !isComplete && 'border-2 border-navy-700 text-navy-800',
                !isComplete && !isCurrent && 'border border-black/15 text-ink/50',
              )}
              aria-current={isCurrent ? 'step' : undefined}
            >
              {index + 1}
            </span>
            <span className={cx('text-sm', isCurrent ? 'font-semibold text-ink' : 'text-ink/60')}>{step}</span>
          </li>
        );
      })}
    </ol>
  );
}
