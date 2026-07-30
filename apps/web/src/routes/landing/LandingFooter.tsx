import { Container } from '@readycircle/ui';

export function LandingFooter() {
  return (
    <footer className="border-t border-black/5 py-10 text-sm text-ink/60">
      <Container className="flex flex-col items-center justify-between gap-4 sm:flex-row">
        <p>&copy; {new Date().getFullYear()} ReadyCircle. All rights reserved.</p>
        <p>Not a replacement for official emergency services.</p>
      </Container>
    </footer>
  );
}
