import { Section } from '@readycircle/ui';

const notes = [
  'ReadyCircle does not replace official emergency services -- always contact emergency responders directly for life-threatening situations.',
  'Radio communication may be subject to licensing requirements (e.g. GMRS registration, amateur radio licensing) depending on the equipment and frequencies you use.',
  'ReadyCircle helps you organize and plan; it does not control, monitor, or guarantee radio transmissions.',
];

export function SafetyLimitations() {
  return (
    <Section
      id="safety"
      eyebrow="Safety & limitations"
      title="What ReadyCircle is -- and isn't"
      className="bg-white/60"
    >
      <div className="mx-auto mt-10 max-w-2xl space-y-4">
        {notes.map((note) => (
          <p key={note} className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {note}
          </p>
        ))}
      </div>
    </Section>
  );
}
