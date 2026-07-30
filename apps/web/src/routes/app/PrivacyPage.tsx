import { Card, CardDescription, CardTitle } from '@readycircle/ui';

export function PrivacyPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Privacy</h1>
        <p className="mt-1 text-sm text-ink/60">
          Manage how your stations are shared. Fine-grained visibility is set per-station.
        </p>
      </div>
      <Card>
        <CardTitle>Per-station visibility</CardTitle>
        <CardDescription>
          Open any station from <strong>My Stations</strong> and use the &ldquo;Participation &amp;
          privacy&rdquo; step to choose who can see it: only you, your Radio Circle, Circle coordinators
          only, or included in aggregate counts. Your precise location is never shown to anyone but you.
        </CardDescription>
      </Card>
      <Card>
        <CardTitle>Account-level privacy controls</CardTitle>
        <CardDescription>
          Consolidated privacy settings (data export, account deletion, and communication preferences)
          are planned for a future milestone.
        </CardDescription>
      </Card>
    </div>
  );
}
