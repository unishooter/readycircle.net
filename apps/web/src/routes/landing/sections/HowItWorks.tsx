import { Section } from '@readycircle/ui';

const steps = [
  {
    step: '1',
    title: 'Add your station',
    body: 'Tell ReadyCircle what radio gear you have, your experience level, and what you want to use it for -- takes about two minutes.',
  },
  {
    step: '2',
    title: 'Form or join a Radio Circle',
    body: 'A Radio Circle connects your station with nearby family, neighbors, or an organization so everyone knows who they can reach.',
  },
  {
    step: '3',
    title: 'Practice reaching each other',
    body: 'Schedule simple check-ins so a channel and a plan are already familiar before an actual outage.',
  },
  {
    step: '4',
    title: 'Keep a living plan',
    body: 'ReadyCircle keeps your Circle\u2019s plan current as members, stations, and goals change over time.',
  },
];

export function HowItWorks() {
  return (
    <Section
      id="how-it-works"
      eyebrow="How it works"
      title="From a single station to a working local network"
      description="Each step builds on the last -- there's no need to have everything figured out on day one."
    >
      <ol className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((item) => (
          <li key={item.step} className="rounded-xl border border-black/5 bg-white p-6 shadow-soft">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-700 text-sm font-bold text-white">
              {item.step}
            </span>
            <h3 className="mt-4 text-base font-semibold text-ink">{item.title}</h3>
            <p className="mt-2 text-sm text-ink/70">{item.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
