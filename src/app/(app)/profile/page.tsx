import { Bell, ChartNoAxesColumn } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { UrlTabs } from "@/components/shared/url-tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { AvatarUploader } from "@/modules/identity/components/profile/avatar-uploader";
import { ChangePasswordForm } from "@/modules/identity/components/profile/change-password-form";
import { ProfileForm } from "@/modules/identity/components/profile/profile-form";
import { SessionsList } from "@/modules/identity/components/profile/sessions-list";
import { getMyProfile } from "@/modules/identity/server/profile";
import { listMySessions } from "@/modules/identity/server/sessions";
import { getRegionalSettings } from "@/modules/organization";
import { getCurrentSessionId, getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "My profile" };

/** Own profile (M02-15 → M02-17). */
export default async function ProfilePage() {
  const ctx = await getRequestContext();
  const [profile, sessions, regional] = await Promise.all([
    getMyProfile(ctx),
    getCurrentSessionId().then((sessionId) => listMySessions(ctx, sessionId)),
    getRegionalSettings(ctx),
  ]);

  const workDetails: [string, string][] = [
    ["Role", profile.roleName],
    ["Designation", profile.designation ?? "—"],
    ["Employee code", profile.employeeCode ?? "—"],
    ["Reports to", profile.reportsToName ?? "—"],
    ["Direct reports", String(profile.directReports)],
    ["Member since", profile.joinedAt ? formatDate(profile.joinedAt, regional) : "—"],
  ];

  return (
    <>
      <PageHeader title="My profile" description="Your details, password and signed-in devices." />
      <UrlTabs
        tabs={[
          {
            value: "profile",
            label: "Profile",
            content: (
              <div className="grid gap-6 xl:grid-cols-3">
                <Card className="xl:col-span-2">
                  <CardHeader>
                    <CardTitle>Personal details</CardTitle>
                    <CardDescription>Shown to your colleagues across the CRM.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <AvatarUploader name={profile.name} avatarUrl={profile.avatarUrl} />
                    <ProfileForm name={profile.name} email={profile.email} phone={profile.phone} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Work details</CardTitle>
                    <CardDescription>Managed by your administrator.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                      {workDetails.map(([label, value]) => (
                        <div key={label} className="contents">
                          <dt className="text-muted-foreground">{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </CardContent>
                </Card>
              </div>
            ),
          },
          {
            value: "security",
            label: "Security",
            content: (
              <div className="grid items-start gap-6 xl:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Password</CardTitle>
                    <CardDescription>
                      Changing it signs you out on all other devices.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ChangePasswordForm />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Signed-in devices</CardTitle>
                    <CardDescription>
                      Sign out anywhere you no longer use or do not recognise.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <SessionsList sessions={sessions} />
                  </CardContent>
                </Card>
              </div>
            ),
          },
          {
            value: "notifications",
            label: "Notifications",
            content: (
              <EmptyState
                icon={Bell}
                title="Notification preferences"
                description="Soon you can choose which follow-up reminders and alerts you receive in the app and by e-mail."
              />
            ),
          },
          {
            value: "activity",
            label: "Activity",
            content: (
              <EmptyState
                icon={ChartNoAxesColumn}
                title="Activity summary"
                description="A summary of your leads, follow-ups, site visits and bookings will appear here."
              />
            ),
          },
        ]}
      />
    </>
  );
}
