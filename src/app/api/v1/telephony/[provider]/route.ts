import { getTelephonyProvider } from "@/modules/activities";
import { apiError } from "@/platform/api/respond";

/**
 * Webhook of a cloud-telephony provider (M07-09, Q-07): the provider posts call events here and they become call
 * records. No provider is connected yet — calls are placed from the phone's dialer and logged by hand — so this
 * endpoint only answers which providers exist. A provider implementation adds `parseWebhook` (with its own
 * signature check) and the mapping of agents to members.
 */
export async function POST(
  _request: Request,
  { params }: RouteContext<"/api/v1/telephony/[provider]">,
) {
  const { provider: key } = await params;
  const provider = getTelephonyProvider(key);
  if (!provider) {
    return apiError(404, "not_found", `No phone system called "${key}" is known.`);
  }
  if (!provider.parseWebhook) {
    return apiError(
      404,
      "not_found",
      `${provider.label} does not send call events; calls are logged in the CRM.`,
    );
  }
  return apiError(501, "internal_error", "This phone system is not connected yet.");
}
