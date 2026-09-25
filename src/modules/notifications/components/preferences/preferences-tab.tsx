import "server-only";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getRequestContext } from "@/platform/tenant/request-context";

import { getMyNotificationPreferences } from "../../server/preferences";
import { PreferencesTable } from "./preferences-table";

/** "My profile → Notifications" (M06-07): which notifications the person gets, in the app and by e-mail. */
export async function NotificationPreferencesTab() {
  const ctx = await getRequestContext();
  const rows = await getMyNotificationPreferences(ctx);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification preferences</CardTitle>
        <CardDescription>
          Choose how you hear about each kind of event. Essential ones always reach you in at least
          one way.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <PreferencesTable rows={rows} />
      </CardContent>
    </Card>
  );
}
