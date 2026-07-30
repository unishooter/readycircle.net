import { Section } from '@readycircle/ui';

const scenarios = [
  {
    title: 'Cellular networks get congested or fail',
    body: 'Severe weather, wildfires, and regional power outages regularly overload or knock out cell towers exactly when people need to reach each other most.',
  },
  {
    title: 'Internet-based apps depend on infrastructure that can go down',
    body: 'Group chats, video calls, and cloud-based check-in apps all assume working internet and power -- assumptions that fail during the events that matter most.',
  },
  {
    title: 'Most households have no local backup plan',
    body: 'Even people who own a radio rarely know who else nearby has one, what channel to use, or when to check in -- so the equipment sits unused when it counts.',
  },
];

export function Problem() {
  return (
    <Section
      eyebrow="Why this matters"
      title="Phones and internet aren't guaranteed to work when you need them most."
      description="ReadyCircle exists to close the gap between owning a radio and actually being able to use it with the people around you."
    >
      <div className="mt-12 grid gap-6 sm:grid-cols-3">
        {scenarios.map((item) => (
          <div key={item.title} className="rounded-xl border border-black/5 bg-white p-6 shadow-soft">
            <h3 className="text-base font-semibold text-ink">{item.title}</h3>
            <p className="mt-2 text-sm text-ink/70">{item.body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
