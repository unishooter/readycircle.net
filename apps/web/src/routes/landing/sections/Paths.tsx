import { Section } from '@readycircle/ui';

export function Paths() {
  return (
    <Section eyebrow="Wherever you're starting" title="Two paths in, same destination">
      <div className="mt-12 grid gap-6 sm:grid-cols-2">
        <div className="rounded-xl border border-black/5 bg-white p-8 shadow-soft">
          <h3 className="text-lg font-semibold text-ink">New to radio</h3>
          <p className="mt-3 text-sm text-ink/70">
            Start with a low-cost FRS handheld or two, add your station in a couple minutes, and join a
            neighborhood or family Circle. No license or prior experience required to get going.
          </p>
        </div>
        <div className="rounded-xl border border-black/5 bg-white p-8 shadow-soft">
          <h3 className="text-lg font-semibold text-ink">Experienced operator</h3>
          <p className="mt-3 text-sm text-ink/70">
            Register your station&apos;s full capabilities, offer to relay or serve as net control, and help
            coordinate a Circle for people who are counting on someone who already knows what they&apos;re doing.
          </p>
        </div>
      </div>
    </Section>
  );
}
