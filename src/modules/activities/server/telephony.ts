/**
 * Telephony adapters (M07-09). Today calls are made from the phone's dialer (`tel:` links) and logged by hand
 * (Q-07). A cloud-telephony provider implements this interface: start calls through its API, turn its webhooks into
 * call records and fetch recordings; `/api/v1/telephony/<provider>` receives the webhooks.
 */
export interface TelephonyCallEvent {
  providerCallId: string;
  direction: "OUTBOUND" | "INBOUND";
  /** Customer number as reported by the provider (matched against lead mobiles). */
  customerNumber: string;
  /** Agent identifier at the provider (mapped to a member). */
  agentRef: string | null;
  startedAt: Date;
  durationSeconds: number;
  answered: boolean;
  recordingUrl?: string | null;
}

export type CallStart = { kind: "dial"; href: string } | { kind: "api"; providerCallId: string };

export interface TelephonyProvider {
  key: string;
  label: string;
  /** How a call starts from the lead page. */
  startCall(input: { phone: string; agentMembershipId: string }): Promise<CallStart>;
  /** Parses a webhook request into call events; null = the request is not understood. */
  parseWebhook?(request: Request): Promise<TelephonyCallEvent[] | null>;
  fetchRecording?(
    providerCallId: string,
  ): Promise<{ contentType: string; body: Uint8Array } | null>;
}

/** Calls placed from the phone's own dialer; the person logs the outcome afterwards. */
export const manualTelephony: TelephonyProvider = {
  key: "MANUAL",
  label: "Phone dialer (manual logging)",
  async startCall({ phone }) {
    return { kind: "dial", href: `tel:${phone.replace(/[^\d+]/g, "")}` };
  },
};

const providers = new Map<string, TelephonyProvider>([[manualTelephony.key, manualTelephony]]);

export function getTelephonyProvider(key: string): TelephonyProvider | undefined {
  return providers.get(key.toUpperCase());
}
