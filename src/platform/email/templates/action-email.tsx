import { Button, Heading, Text } from "@react-email/components";

import { EmailLayout } from "./email-layout";

export interface ActionEmailProps {
  preview: string;
  organizationName?: string;
  heading: string;
  paragraphs: string[];
  actionLabel: string;
  actionUrl: string;
  footnote?: string;
}

const text = {
  color: "#374151",
  fontSize: "14px",
  lineHeight: "22px",
  margin: "0 0 12px",
} as const;

/** Generic "one call to action" e-mail (password reset, invitation, notifications). */
export function ActionEmail({
  preview,
  organizationName,
  heading,
  paragraphs,
  actionLabel,
  actionUrl,
  footnote,
}: ActionEmailProps) {
  return (
    <EmailLayout preview={preview} organizationName={organizationName}>
      <Heading as="h2" style={{ color: "#111827", fontSize: "20px", margin: "0 0 16px" }}>
        {heading}
      </Heading>
      {paragraphs.map((paragraph) => (
        <Text key={paragraph} style={text}>
          {paragraph}
        </Text>
      ))}
      <Button
        href={actionUrl}
        style={{
          backgroundColor: "#2563eb",
          borderRadius: "6px",
          color: "#ffffff",
          display: "inline-block",
          fontSize: "14px",
          fontWeight: 600,
          margin: "12px 0 20px",
          padding: "10px 18px",
          textDecoration: "none",
        }}
      >
        {actionLabel}
      </Button>
      <Text style={{ ...text, color: "#6b7280", fontSize: "12px" }}>
        If the button does not work, copy this link into your browser: {actionUrl}
      </Text>
      {footnote ? (
        <Text style={{ ...text, color: "#6b7280", fontSize: "12px" }}>{footnote}</Text>
      ) : null}
    </EmailLayout>
  );
}
