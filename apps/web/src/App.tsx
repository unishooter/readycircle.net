import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { LandingPage } from './routes/landing/LandingPage.js';
import { LoginPage } from './routes/auth/LoginPage.js';
import { InvitePreviewPage } from './routes/invite/InvitePreviewPage.js';
import { RouteGuard } from './routes/app/RouteGuard.js';
import { AppShell } from './routes/app/AppShell.js';
import { DashboardPage } from './routes/app/DashboardPage.js';
import { PrivacyPage } from './routes/app/PrivacyPage.js';
import { AccountPage } from './routes/app/AccountPage.js';
import { StationsListPage } from './routes/app/stations/StationsListPage.js';
import { StationWizardPage } from './routes/app/stations/StationWizardPage.js';
import { StationDetailPage } from './routes/app/stations/StationDetailPage.js';
import { StationEditPage } from './routes/app/stations/StationEditPage.js';
import { CirclesListPage } from './routes/app/circles/CirclesListPage.js';
import { CircleWizardPage } from './routes/app/circles/CircleWizardPage.js';
import { CircleDetailPage } from './routes/app/circles/CircleDetailPage.js';
import { CircleEditPage } from './routes/app/circles/CircleEditPage.js';
import { PlansListPage } from './routes/app/plans/PlansListPage.js';
import { PlanDetailPage } from './routes/app/plans/PlanDetailPage.js';
import { NetsListPage } from './routes/app/nets/NetsListPage.js';
import { NetDetailPage } from './routes/app/nets/NetDetailPage.js';
import { NetCreatePage, NetEditPage } from './routes/app/nets/NetFormPage.js';
import { AdminPage } from './routes/app/admin/AdminPage.js';
import { ContactsPage } from './routes/app/contacts/ContactsPage.js';
import { NotFoundPage } from './routes/NotFoundPage.js';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/invite/:token" element={<InvitePreviewPage />} />

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
            <Route path="circles/:circleId/edit" element={<CircleEditPage />} />
            <Route path="circles/:circleId/nets/new" element={<NetCreatePage />} />
            <Route path="plans" element={<PlansListPage />} />
            <Route path="plans/:planId" element={<PlanDetailPage />} />
            <Route path="nets" element={<NetsListPage />} />
            <Route path="nets/:netId" element={<NetDetailPage />} />
            <Route path="nets/:netId/edit" element={<NetEditPage />} />
            <Route path="contacts" element={<ContactsPage />} />
            <Route path="privacy" element={<PrivacyPage />} />
            <Route path="account" element={<AccountPage />} />
            <Route path="admin" element={<AdminPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
