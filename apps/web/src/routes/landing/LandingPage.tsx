import { LandingHeader } from './LandingHeader.js';
import { LandingFooter } from './LandingFooter.js';
import { Hero } from './sections/Hero.js';
import { Problem } from './sections/Problem.js';
import { HowItWorks } from './sections/HowItWorks.js';
import { WhoItsFor } from './sections/WhoItsFor.js';
import { RadioCircleConcept } from './sections/RadioCircleConcept.js';
import { Privacy } from './sections/Privacy.js';
import { PlanOutputs } from './sections/PlanOutputs.js';
import { PlanFreshness } from './sections/PlanFreshness.js';
import { Paths } from './sections/Paths.js';
import { SafetyLimitations } from './sections/SafetyLimitations.js';
import { FinalCta } from './sections/FinalCta.js';

export function LandingPage() {
  return (
    <div className="min-h-screen bg-paper">
      <LandingHeader />
      <main>
        <Hero />
        <Problem />
        <HowItWorks />
        <WhoItsFor />
        <RadioCircleConcept />
        <Privacy />
        <PlanOutputs />
        <PlanFreshness />
        <Paths />
        <SafetyLimitations />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}
