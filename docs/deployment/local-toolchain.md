# Local toolchain setup (Windows)

This documents what was installed automatically on this machine versus what
requires manual, interactive steps (a reboot and/or license acceptance),
which cannot be done unattended.

## Installed automatically

Via `winget`, without a reboot:

- **Git** (`Git.Git`)
- **Node.js LTS** (`OpenJS.NodeJS.LTS`)
- **pnpm**, installed globally with `npm install -g pnpm` (this repo's
  `package.json#packageManager` pins the exact version pnpm itself should
  report; `corepack prepare` was skipped because it failed with an `EPERM`
  error in this environment -- a global install works identically for local
  development)

Verify these are on `PATH` in a **new** terminal (environment variables set
by an installer don't propagate to already-open shells):

```powershell
node -v
git -v
pnpm -v
```

## Requires manual setup: Docker Desktop + WSL2

Docker Desktop was **not** installed automatically because it requires
enabling a Windows feature (WSL2) that needs a reboot, plus interactive
license acceptance on first launch. Both are things an unattended script
should not do on a machine it doesn't own.

### 1. Enable WSL2

Open an **elevated** PowerShell (Run as Administrator) and run:

```powershell
wsl --install
```

This enables the required Windows features and installs a default Linux
distribution. **Reboot when prompted.**

If WSL is already partially installed, instead run:

```powershell
wsl --set-default-version 2
wsl --update
```

### 2. Install Docker Desktop

1. Download Docker Desktop for Windows from
   [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/).
2. Run the installer, keeping the default **"Use WSL 2 instead of Hyper-V"**
   option checked.
3. Launch Docker Desktop, accept the license agreement, and wait for the
   whale icon in the system tray to show "Docker Desktop is running".
4. In Docker Desktop's Settings → Resources → WSL Integration, make sure
   integration is enabled for your default WSL distribution.

### 3. Verify

In a new terminal:

```powershell
docker --version
docker compose version
```

Both should print version numbers without error.

### 4. Start local PostgreSQL

Once Docker is confirmed working, from the repo root:

```powershell
docker compose up -d
```

This starts a `postgis/postgis` container matching `DATABASE_URL` in
`.env.example`. Confirm it's healthy with:

```powershell
docker compose ps
```

Then apply migrations and seed data:

```powershell
pnpm db:migrate
pnpm db:seed
```

## Why this matters for this repository

Without Docker running, everything that doesn't touch a real database
works fine (`pnpm dev` for the web app against a mocked/unavailable API,
`pnpm typecheck`, `pnpm lint`, `pnpm build`, and unit tests). The API's
integration test suite and `apps/api`'s `dev` script, however, require a
reachable PostgreSQL instance -- that's what this document unblocks.
