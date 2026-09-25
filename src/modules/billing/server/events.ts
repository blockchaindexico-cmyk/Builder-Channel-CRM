declare module "@/platform/events/types" {
  interface DomainEventMap {
    "deal_financial.created": {
      dealFinancialId: string;
      bookingId: string;
      grossCommission: string;
    };
    "deal_financial.confirmed": { dealFinancialId: string };
    "invoice.issued": { invoiceId: string; number: string; builderId: string; total: string };
    "invoice.cancelled": { invoiceId: string; number: string | null; reason: string };
    "invoice.paid": { invoiceId: string; number: string | null };
    "payment.recorded": {
      paymentId: string;
      invoiceId: string;
      amount: string;
      tdsDeducted: string;
    };
    "payment.voided": { paymentId: string; invoiceId: string; reason: string };
  }
}

export {};
