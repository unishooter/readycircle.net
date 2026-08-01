import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { LandingPage } from './routes/landing/LandingPage.js';
import { LoginPage } from './routes/auth/LoginPage.js';
import { RouteGuard } from './routes/app/RouteGuard.js';
import { AppShell } from './routes/app/AppShell.js';
import { DashboardPage } from './routes/app/DashboardPage.js';
import { ComingSoonPage } from './routes/app/ComingSoonPage.js';
import { PrivacyPage } from './routes/app/PrivacyPage.js';
import { AccountPage } from './routes/app/AccountPage.js';
import { StationsListPage } from './routes/app/stations/StationsListPage.js';
import { StationWizardPage } from './routes/app/stations/StationWizardPage.js';
import { StationDetailPage } from './routes/app/stations/StationDetailPage.js';
import { StationEditPage } from './routes/app/stations/StationEditPage.js';
import { CirclesListPage } from './routes/app/circles/CirclesListPage.js';
import { CircleWizardPage } from './routes/app/circles/CircleWizardPage.js';
import { CircleDetailPage } from './routes/app/circles/CircleDetailPage.js';
import { PlansListPage } from './routes/app/plans/PlansListPage.js';
import { PlanDetailPage } from './routes/app/plans/PlanDetailPage.js';
import { NotFoundPage } from './routes/NotFoundPage.js';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />

        <Route element={<RouteGuard />}>
          <Route path="/app" element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="stations" element={<StationsListPage />} />
            <Route path="stations/new" element={<StationWizardPage />} />
            <Route path="stations/:stationId" element={<StationDetailPage />} />
            <Route path="stations/:stationId/edit" element={<StationEditPage />} />
            <Route path="circles" element={<CirclesListPage />} />
            <Route path="circles/new" element={<CircleWizardPage />} />
            <Route path="circles/:circleId" element={<CircleDetailPage />} />
            <Route path="plans" element={<PlansListPage />} />
            <Route path="plans/:planId" element={<PlanDetailPage />} />
            <Route
              path="nets"
              element={
                <ComingSoonPage
                  title="Nets"
                  description="Scheduled practice check-ins and net logs are coming in a future milestone."
                />
              }
            />
            <Route
              path="contacts"
              element={
                <ComingSoonPage
                  title="Contacts"
                  description="A shared contact directory for your Circles is coming in a future milestone."
                />
              }
            />
            <Route path="privacy" element={<PrivacyPage />} />
            <Route path="account" element={<AccountPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
