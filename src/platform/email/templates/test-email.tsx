import { Heading, Text } from "@react-email/components";

import { EmailLayout } from "./email-layout";

export interface TestEmailProps {
  organizationName: string;
  sentAt: string;
}

/** Sent from Settings → Organization to verify e-mail delivery. */
export function TestEmail({ organizationName, sentAt }: TestEmailProps) {
  return (
    <EmailLayout preview="Your e-mail settings are working" organizationName={organizationName}>
      <Heading as="h2" style={{ color: "#111827", fontSize: "20px", margin: "0 0 12px" }}>
        E-mail delivery works
      </Heading>
      <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "22px" }}>
        This test message confirms that {organizationName} can send e-mails from the CRM. It was
        sent at {sentAt}.
      </Text>
    </EmailLayout>
  );
}
