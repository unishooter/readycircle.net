import { Link } from 'react-router-dom';
import { Container } from '@readycircle/ui';
import { CircleIllustration } from '../CircleIllustration.js';

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pb-16 pt-14 sm:pb-24 sm:pt-20">
      <Container className="grid items-center gap-12 lg:grid-cols-2">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-navy-700">
            Local radio communications planning
          </p>
          <h1 className="mt-4 text-4xl font-bold leading-tight text-ink sm:text-5xl">
            Build your local radio communications plan before you need it.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-ink/70">
            ReadyCircle helps families, neighbors, churches, workplaces, and radio operators organize
            their stations into a Radio Circle, practice reaching each other, and keep a clear plan
            ready for when cellular, internet, or power service goes down.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              to="/login"
              className="inline-flex items-center justify-center rounded-lg bg-navy-700 px-6 py-3 text-base font-medium text-white shadow-soft transition-colors hover:bg-navy-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-700"
            >
              Start your first station
            </Link>
            <a href="#how-it-works" className="text-base font-medium text-ink/70 hover:text-ink">
              See how it works &darr;
            </a>
          </div>
          <p className="mt-6 text-sm text-ink/50">
            No radio license required to get started. Works alongside FRS, GMRS, and amateur radio.
          </p>
        </div>
        <div className="flex justify-center text-navy-500" aria-hidden={false}>
          <CircleIllustration />
        </div>
      </Container>
    </section>
  );
}
