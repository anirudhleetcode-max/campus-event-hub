import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Award, QrCode, ShieldCheck } from "lucide-react";
import { VerifySearchForm } from "./verify-search-form";

export const metadata: Metadata = {
  title: "Verify a certificate",
  description: "Check that a Campus Event Hub certificate is genuine using its certificate ID.",
};

const steps = [
  { icon: Award, title: "Find the certificate ID", text: "It's printed at the bottom of every certificate, e.g. CEH-2026-ABCD2345." },
  { icon: QrCode, title: "Or scan the QR code", text: "Each certificate carries a QR code that opens its verification page directly." },
  { icon: ShieldCheck, title: "See the official record", text: "We show the recipient, event and issuing institution exactly as issued — and whether it's been revoked." },
];

export default async function VerifyPage({ searchParams }: PageProps<"/verify">) {
  const sp = await searchParams;
  const raw = typeof sp.code === "string" ? sp.code.replace(/[^A-Za-z0-9-]/g, "").toUpperCase().slice(0, 64) : "";
  if (raw) redirect(`/verify/${raw}`);

  return (
    <div className="container-page max-w-3xl py-12 sm:py-16">
      <div className="space-y-3 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-foreground">
          <ShieldCheck className="size-6" aria-hidden />
        </span>
        <h1 className="text-3xl font-semibold tracking-tight">Verify a certificate</h1>
        <p className="mx-auto max-w-xl text-muted-foreground">
          Employers, universities and anyone else can confirm that a certificate issued through Campus Event Hub is authentic.
        </p>
      </div>

      <div className="mx-auto mt-8 max-w-xl rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-6">
        <VerifySearchForm />
      </div>

      <ol className="mt-12 grid gap-4 sm:grid-cols-3">
        {steps.map(({ icon: Icon, title, text }, i) => (
          <li key={title} className="rounded-xl border border-border bg-surface p-5">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-foreground">
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="text-xs font-medium text-muted-foreground">Step {i + 1}</span>
            </div>
            <h2 className="mt-3 text-sm font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{text}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
