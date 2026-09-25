import { Heading, Text } from "@react-email/components";

import { EmailLayout } from "@/platform/email/templates/email-layout";

export interface InvoiceEmailProps {
  organizationName: string;
  invoiceNumber: string;
  total: string;
  dueDate: string | null;
  message: string | null;
  senderName: string;
}

const text = {
  color: "#374151",
  fontSize: "14px",
  lineHeight: "22px",
  margin: "0 0 12px",
} as const;

/** Cover e-mail of an invoice sent to a builder (M09-08); the PDF is attached. */
export function InvoiceEmail({
  organizationName,
  invoiceNumber,
  total,
  dueDate,
  message,
  senderName,
}: InvoiceEmailProps) {
  return (
    <EmailLayout
      preview={`Invoice ${invoiceNumber} for ${total}`}
      organizationName={organizationName}
    >
      <Heading as="h2" style={{ color: "#111827", fontSize: "20px", margin: "0 0 16px" }}>
        Invoice {invoiceNumber}
      </Heading>
      {message ? (
        message.split(/\n{2,}/).map((paragraph) => (
          <Text key={paragraph} style={{ ...text, whiteSpace: "pre-line" }}>
            {paragraph}
          </Text>
        ))
      ) : (
        <Text style={text}>Please find attached our invoice {invoiceNumber}.</Text>
      )}
      <Text style={text}>
        Amount: <strong>{total}</strong>
        {dueDate ? (
          <>
            <br />
            Due by: <strong>{dueDate}</strong>
          </>
        ) : null}
      </Text>
      <Text style={text}>
        Regards,
        <br />
        {senderName}
        <br />
        {organizationName}
      </Text>
    </EmailLayout>
  );
}
