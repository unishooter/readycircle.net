import { Section } from '@readycircle/ui';

const levels = [
  {
    name: 'Station',
    body: 'A single radio setup -- a home base, a handheld, a vehicle rig, or an organization\u2019s fixed station -- with its own capabilities and goals.',
  },
  {
    name: 'Radio Circle',
    body: 'A group of stations that agree to communicate with each other: a family, a neighborhood, or an organization. Circles have coordinators and a shared area.',
  },
  {
    name: 'Radio Circle Network',
    body: 'Multiple Circles that can relay information between each other through shared or bridging stations -- the long-term direction for wider community coverage.',
  },
];

export function RadioCircleConcept() {
  return (
    <Section
      eyebrow="The core idea"
      title="Station \u2192 Radio Circle \u2192 Radio Circle Network"
      description="ReadyCircle organizes people around three simple, nested concepts."
    >
      <div className="mt-12 grid gap-0 overflow-hidden rounded-xl border border-black/5 bg-white shadow-soft sm:grid-cols-3">
        {levels.map((level, index) => (
          <div
            key={level.name}
            className={`p-6 ${index > 0 ? 'border-t border-black/5 sm:border-l sm:border-t-0' : ''}`}
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-navy-700">
              Level {index + 1}
            </span>
            <h3 className="mt-2 text-lg font-semibold text-ink">{level.name}</h3>
            <p className="mt-2 text-sm text-ink/70">{level.body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
