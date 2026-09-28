import { formatMoney } from "@/lib/utils";

/** Money for staff reports: unlike `formatMoney`, zero reads as ₹0 rather than "Free". */
export function formatAmount(paise: number, currency = "INR"): string {
  if (paise !== 0) return formatMoney(paise, currency);
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(0);
}
