import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const FIELDS: [name: string, type: string, description: string][] = [
  ["name", "text, required", "Customer's full name."],
  [
    "mobile",
    "text",
    "Any format: +91 98200 12345, 098200-12345… A mobile or an e-mail is required.",
  ],
  ["email", "text", "E-mail address."],
  ["alternateMobile", "text", "Second phone number."],
  ["city, locality, address", "text", "Where the customer lives."],
  [
    "source",
    "text",
    'Code or name of a lead source (below). Default: the key\'s source, else "API".',
  ],
  ["campaign", "text", "Code or name of a campaign."],
  ["sourceDetail", "text", "Listing id, form name, referrer…"],
  ["budgetMin, budgetMax", "number or text", '8500000, "85 L" or "1.2 Cr".'],
  ["propertyType", "text", 'Name of a property type, e.g. "Apartment".'],
  ["configurations", "list", 'e.g. ["2 BHK", "3 BHK"] or "2 BHK, 3 BHK".'],
  ["projects", "list", "Project codes (PRJ-0001) or names the customer asked about."],
  ["preferredLocations, tags", "list", "Arrays or comma-separated text."],
  ["purpose", "text", "END_USE or INVESTMENT."],
  [
    "buyingTimeline",
    "text",
    "IMMEDIATE, WITHIN_3_MONTHS, WITHIN_6_MONTHS, WITHIN_1_YEAR or LATER.",
  ],
  ["temperature", "text", "HOT, WARM or COLD."],
  ["requirementNotes", "text", "What the customer is looking for."],
  ["note", "text", "Saved as the lead's first note (e.g. the enquiry message)."],
];

const RESPONSES: [status: string, meaning: string][] = [
  [
    "201 Created",
    "The lead was created: { data: { id, number, status, duplicateOf } }. duplicateOf is set when it was flagged as a possible duplicate.",
  ],
  ["401 unauthorized", "Missing, wrong or revoked API key."],
  [
    "409 duplicate",
    'The duplicate policy is "block" and the customer already exists: error.duplicateOf holds the existing lead.',
  ],
  [
    "409 request_in_progress",
    "The first request with this Idempotency-Key is still running — retry after a moment.",
  ],
  ["413 payload_too_large", "The body is larger than 64 KB."],
  [
    "422 validation_failed",
    'error.fields lists the problems per field, e.g. { "mobile": ["Enter a valid mobile number"] }.',
  ],
  ["422 idempotency_key_reused", "The Idempotency-Key was already used with a different body."],
  [
    "429 rate_limited",
    "More than 60 requests in a minute with this key. Wait for Retry-After seconds.",
  ],
];

/** Documentation of the lead intake API (M04-20) with the organization's own URL and source codes. */
export function IntakeApiDocs({
  endpoint,
  sources,
}: {
  endpoint: string;
  sources: { name: string; code: string }[];
}) {
  const example = `curl -X POST ${endpoint} \\
  -H "Authorization: Bearer crm_xxxxxxxx_..." \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: web-form-2026-09-25-0042" \\
  -d '{
    "name": "Priya Sharma",
    "mobile": "+91 98200 12345",
    "email": "priya.sharma@example.com",
    "source": "website",
    "sourceDetail": "Contact form",
    "budgetMax": "1.2 Cr",
    "configurations": ["2 BHK", "3 BHK"],
    "projects": ["PRJ-0001"],
    "note": "Wants a site visit this weekend"
  }'`;
  return (
    <Card id="api-docs">
      <CardHeader>
        <CardTitle>How to send leads</CardTitle>
        <CardDescription>
          Websites, landing pages and portals create leads with one HTTPS request. New leads arrive
          unassigned with the status New, go through the duplicate check and appear in the lead list
          at once.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 text-sm">
        <section className="space-y-2">
          <h3 className="font-semibold">Request</h3>
          <p>
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              POST {endpoint}
            </code>{" "}
            with the headers{" "}
            <code className="font-mono text-xs">Authorization: Bearer &lt;API key&gt;</code> and{" "}
            <code className="font-mono text-xs">Content-Type: application/json</code>. Add an{" "}
            <code className="font-mono text-xs">Idempotency-Key</code> (any unique text per lead) so
            that retries after a timeout never create the lead twice — the first answer is replayed
            for 24 hours.
          </p>
          <pre className="overflow-x-auto rounded-lg bg-muted p-4 font-mono text-xs leading-relaxed">
            {example}
          </pre>
        </section>

        <section className="space-y-2">
          <h3 className="font-semibold">Fields</h3>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Field</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {FIELDS.map(([name, type, description]) => (
                  <TableRow key={name}>
                    <TableCell className="font-mono text-xs">{name}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {type}
                    </TableCell>
                    <TableCell className="whitespace-normal">{description}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="font-semibold">Responses</h3>
          <ul className="space-y-1.5">
            {RESPONSES.map(([status, meaning]) => (
              <li key={status}>
                <code className="font-mono text-xs font-semibold">{status}</code> — {meaning}
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground">
            Errors look like{" "}
            <code className="font-mono text-xs">
              {'{ "error": { "code": "validation_failed", "message": "…", "fields": { … } } }'}
            </code>
            . Every response carries X-RateLimit-Limit, X-RateLimit-Remaining and X-Request-Id
            headers.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="font-semibold">Source codes</h3>
          <div className="flex flex-wrap gap-2">
            {sources.map((source) => (
              <span key={source.code} className="rounded-md border px-2 py-1">
                {source.name}{" "}
                <code className="font-mono text-xs text-muted-foreground">{source.code}</code>
              </span>
            ))}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
