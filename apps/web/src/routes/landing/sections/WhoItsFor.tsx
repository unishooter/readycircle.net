import { Section } from '@readycircle/ui';

const audiences = [
  { title: 'Families', body: 'Keep in touch with relatives across town or across the yard when cell service is unreliable.' },
  { title: 'Neighborhoods', body: 'Coordinate welfare checks and share local information block by block.' },
  { title: 'Churches & community organizations', body: 'Give a congregation or member base a shared communications plan for emergencies and events.' },
  { title: 'Workplaces', body: 'Keep a site or team connected when normal phone and network systems are down.' },
  { title: 'New radio owners', body: 'Learn what your equipment can actually do by using it with people who need to hear from you.' },
  { title: 'Experienced operators', body: 'Put your license and gear to work as a relay or net control for people who depend on you.' },
];

export function WhoItsFor() {
  return (
    <Section
      id="who-its-for"
      eyebrow="Who it's for"
      title="Built for real groups of people, not just individual operators"
    >
      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {audiences.map((item) => (
          <div key={item.title} className="rounded-xl border border-black/5 bg-white p-6 shadow-soft">
            <h3 className="text-base font-semibold text-ink">{item.title}</h3>
            <p className="mt-2 text-sm text-ink/70">{item.body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
