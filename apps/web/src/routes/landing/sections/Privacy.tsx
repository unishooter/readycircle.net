import { Section } from '@readycircle/ui';

const principles = [
  {
    title: 'You choose what to share, and with whom',
    body: 'Every station has its own visibility setting: private, shared with your Circle, coordinators only, or included in aggregate counts.',
  },
  {
    title: 'Precise location stays private',
    body: 'Your exact coordinates are never shown to anyone but you. Others only ever see a generalized area or an approximate grid square, if you choose to share location at all.',
  },
  {
    title: 'Conservative defaults',
    body: 'New stations start private. You opt in to sharing with a Circle -- ReadyCircle never shares your information by default.',
  },
];

export function Privacy() {
  return (
    <Section
      id="privacy"
      eyebrow="Privacy"
      title="Your location and details stay under your control"
      description="Radio already broadcasts more than most apps ever will -- ReadyCircle is designed to not make that worse."
    >
      <div className="mt-12 grid gap-6 sm:grid-cols-3">
        {principles.map((item) => (
          <div key={item.title} className="rounded-xl border border-teal-100 bg-teal-50/60 p-6">
            <h3 className="text-base font-semibold text-ink">{item.title}</h3>
            <p className="mt-2 text-sm text-ink/70">{item.body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
