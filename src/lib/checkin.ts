// Small pure helpers for the guest check-in page and the staff WhatsApp action.

/** Digits only, no country code: "+91 98765-43210" -> "9876543210". null when
 *  the input isn't a 10-digit Indian mobile number (optionally with 91 / 0). */
export function localDigits(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

/** "9876543210" -> "98765 43210" while typing. */
export function formatLocal(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 10);
  return d.length > 5 ? `${d.slice(0, 5)} ${d.slice(5)}` : d;
}

/** wa.me link; `phone` may carry a + or spaces. */
export function waLink(phone: string, text: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

export function venueMessage(areaName: string, partySize: number, localPhone: string): string {
  return `Hi! I'm checking in for a table at the ${areaName} for ${partySize} (WhatsApp +91${localPhone}).`;
}

export const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;
