import { Link } from 'react-router-dom';
import { Container } from '@readycircle/ui';

export function FinalCta() {
  return (
    <section className="bg-navy-800 py-16 text-white sm:py-20">
      <Container className="text-center">
        <h2 className="text-2xl font-semibold sm:text-3xl">Ready to build your first Radio Circle?</h2>
        <p className="mx-auto mt-4 max-w-xl text-navy-100">
          It starts with one station. Add yours, and see who else is ready to stay connected with you.
        </p>
        <Link
          to="/login"
          className="mt-8 inline-flex items-center justify-center rounded-lg bg-white px-6 py-3 text-base font-medium text-navy-800 shadow-soft transition-colors hover:bg-navy-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Get started for free
        </Link>
      </Container>
    </section>
  );
}
