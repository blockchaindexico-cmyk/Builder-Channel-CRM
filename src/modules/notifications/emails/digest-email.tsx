import { Button, Column, Heading, Row, Section, Text } from "@react-email/components";

import { EmailLayout } from "@/platform/email/templates/email-layout";

import type { DigestBlock } from "../extensions";

export interface DigestEmailProps {
  organizationName?: string;
  recipientName: string;
  /** Formatted local date, e.g. "Thursday, 25 September". */
  dateLabel: string;
  sections: DigestBlock[];
  /** Absolute URL of the app, to link the counts. */
  appUrl: string;
}

const text = { color: "#374151", fontSize: "14px", lineHeight: "22px", margin: 0 } as const;

/** The daily summary (M06-12): one block per contributing module, counts linking to the lists behind them. */
export function DigestEmail({
  organizationName,
  recipientName,
  dateLabel,
  sections,
  appUrl,
}: DigestEmailProps) {
  const firstName = recipientName.split(" ")[0] ?? recipientName;
  return (
    <EmailLayout preview={`Your summary for ${dateLabel}`} organizationName={organizationName}>
      <Heading as="h2" style={{ color: "#111827", fontSize: "20px", margin: "0 0 8px" }}>
        Hello {firstName},
      </Heading>
      <Text style={{ ...text, margin: "0 0 20px" }}>
        Here is where things stand on {dateLabel}.
      </Text>
      {sections.map((section) => (
        <Section key={section.title} style={{ margin: "0 0 20px" }}>
          <Text
            style={{
              ...text,
              color: "#111827",
              fontSize: "15px",
              fontWeight: 600,
              margin: "0 0 8px",
            }}
          >
            {section.title}
          </Text>
          {section.lines.map((line) => (
            <Row key={line.label} style={{ borderBottom: "1px solid #f3f4f6" }}>
              <Column style={{ padding: "6px 0" }}>
                {line.link ? (
                  <a
                    href={new URL(line.link, appUrl).toString()}
                    style={{ ...text, color: "#1d4ed8" }}
                  >
                    {line.label}
                  </a>
                ) : (
                  <Text style={text}>{line.label}</Text>
                )}
              </Column>
              <Column align="right" style={{ padding: "6px 0", width: "80px" }}>
                <Text
                  style={{
                    ...text,
                    color: line.attention && line.value > 0 ? "#b45309" : "#111827",
                    fontWeight: line.attention && line.value > 0 ? 700 : 500,
                  }}
                >
                  {line.display ?? line.value}
                </Text>
              </Column>
            </Row>
          ))}
        </Section>
      ))}
      <Button
        href={new URL("/", appUrl).toString()}
        style={{
          backgroundColor: "#2563eb",
          borderRadius: "6px",
          color: "#ffffff",
          display: "inline-block",
          fontSize: "14px",
          fontWeight: 600,
          margin: "8px 0 16px",
          padding: "10px 18px",
          textDecoration: "none",
        }}
      >
        Open the CRM
      </Button>
      <Text style={{ ...text, color: "#6b7280", fontSize: "12px" }}>
        You can turn this summary off in My profile → Notifications.
      </Text>
    </EmailLayout>
  );
}
