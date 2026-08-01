import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Badge, cx } from '@readycircle/ui';
import { useLogout, useSession } from '../../features/session/api.js';

const navItems = [
  { to: '/app', label: 'Dashboard', end: true },
  { to: '/app/stations', label: 'My Stations' },
  { to: '/app/circles', label: 'My Radio Circles' },
  { to: '/app/plans', label: 'Plans', comingSoon: true },
  { to: '/app/nets', label: 'Nets', comingSoon: true },
  { to: '/app/contacts', label: 'Contacts', comingSoon: true },
  { to: '/app/privacy', label: 'Privacy' },
  { to: '/app/account', label: 'Account' },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-1 px-3" aria-label="Main">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cx(
              'flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive ? 'bg-navy-100 text-navy-800' : 'text-ink/70 hover:bg-black/5 hover:text-ink',
            )
          }
        >
          <span>{item.label}</span>
          {item.comingSoon ? (
            <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink/50">
              Soon
            </span>
          ) : null}
        </NavLink>
      ))}
    </nav>
  );
}

export function AppShell() {
  const { data: session } = useSession();
  const logout = useLogout();
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  async function handleLogout() {
    // A Cognito-backed session (Google or email/password) also has its own
    // hosted SSO session in the browser -- clearing only our `rc_session`
    // cookie would let "Continue with Google" silently sign the same
    // account back in with no prompt. Route through Cognito's own logout
    // endpoint in that case; for dev-auth sessions there's no such session
    // to clear.
    const usedCognito = session?.user?.authProvider === 'google' || session?.user?.authProvider === 'email_password';
    await logout.mutateAsync();
    if (usedCognito) {
      window.location.href = '/api/v1/auth/logout-redirect';
    } else {
      navigate('/', { replace: true });
    }
  }

  return (
    <div className="min-h-screen bg-paper">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 flex-shrink-0 flex-col border-r border-black/5 bg-white py-6 md:flex">
          <a href="/" className="mb-6 flex items-center gap-2 px-4 font-semibold text-ink">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-700 text-sm font-bold text-white">
              RC
            </span>
            ReadyCircle
          </a>
          <NavList />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 items-center justify-between border-b border-black/5 bg-white px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="rounded-lg p-2 text-ink/70 hover:bg-black/5 md:hidden"
                onClick={() => setMobileNavOpen((open) => !open)}
                aria-expanded={mobileNavOpen}
                aria-label="Toggle navigation"
              >
                &#9776;
              </button>
              <Badge tone="amber">Development environment</Badge>
            </div>
            <div className="flex items-center gap-4">
              <span className="hidden text-sm text-ink/70 sm:inline">{session?.user?.displayName}</span>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="text-sm font-medium text-ink/70 hover:text-ink"
              >
                Log out
              </button>
            </div>
          </header>

          {mobileNavOpen ? (
            <div className="border-b border-black/5 bg-white py-3 md:hidden">
              <NavList onNavigate={() => setMobileNavOpen(false)} />
            </div>
          ) : null}

          <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
