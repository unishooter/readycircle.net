import { Link } from 'react-router-dom';
import logoHorizontal from '../../assets/readycircle-logo-horizontal.png';

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-black/5 bg-paper/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href="#top" className="flex items-center">
          <img src={logoHorizontal} alt="ReadyCircle.net" className="h-8 w-auto" />
        </a>
        <nav className="hidden items-center gap-6 text-sm font-medium text-ink/70 md:flex" aria-label="Primary">
          <a href="#how-it-works" className="hover:text-ink">How it works</a>
          <a href="#who-its-for" className="hover:text-ink">Who it&apos;s for</a>
          <a href="#privacy" className="hover:text-ink">Privacy</a>
          <a href="#safety" className="hover:text-ink">Safety</a>
        </nav>
        <div className="flex items-center gap-3">
          <Link to="/login" className="text-sm font-medium text-ink/70 hover:text-ink">
            Log in
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center justify-center rounded-lg bg-navy-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-navy-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-700"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}
