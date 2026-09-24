import { Body, Container, Head, Hr, Html, Preview, Section, Text } from "@react-email/components";
import type { ReactNode } from "react";

export interface EmailLayoutProps {
  preview: string;
  organizationName?: string;
  children: ReactNode;
}

const styles = {
  body: {
    backgroundColor: "#f4f5f7",
    fontFamily: "Helvetica, Arial, sans-serif",
    margin: 0,
    padding: "24px 0",
  },
  container: {
    backgroundColor: "#ffffff",
    borderRadius: "8px",
    margin: "0 auto",
    maxWidth: "560px",
    padding: "32px",
  },
  brand: {
    color: "#1e3a8a",
    fontSize: "14px",
    fontWeight: 700,
    letterSpacing: "0.02em",
    margin: "0 0 24px",
  },
  footer: { color: "#6b7280", fontSize: "12px", lineHeight: "18px", margin: 0 },
} as const;

/** Base layout for every transactional e-mail (M01-15). */
export function EmailLayout({ preview, organizationName, children }: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.brand}>{organizationName ?? "Builder Channel CRM"}</Text>
          <Section>{children}</Section>
          <Hr style={{ borderColor: "#e5e7eb", margin: "32px 0 16px" }} />
          <Text style={styles.footer}>
            This is an automated message from {organizationName ?? "Builder Channel CRM"}. Please do
            not reply to this e-mail.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
