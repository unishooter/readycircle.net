import { Section } from '@readycircle/ui';

const outputs = [
  'A roster of who is in your Circle and how to reach them',
  'The agreed-upon channel, frequency, or check-in schedule',
  'Roles: who coordinates, who relays, who is net control',
  'A simple reference sheet you can print or keep offline',
];

export function PlanOutputs() {
  return (
    <Section
      eyebrow="Where this leads"
      title="A plan you can actually use, not just a form you filled out"
      description="Future milestones turn your stations and Circles into a generated plan that includes:"
    >
      <ul className="mx-auto mt-10 grid max-w-2xl gap-4 sm:grid-cols-2">
        {outputs.map((item) => (
          <li key={item} className="flex items-start gap-3 rounded-lg border border-black/5 bg-white p-4 text-sm text-ink/80 shadow-soft">
            <span className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-navy-600" aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>
    </Section>
  );
}
