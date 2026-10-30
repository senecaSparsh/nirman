import QRCode from "qrcode";

/** Build a UPI intent URI — taps open GPay/PhonePe/Paytm pre-filled. */
export function buildUpiLink(opts: { vpa: string; name: string; amount: number; note: string }): string {
  const { vpa, name, amount, note } = opts;
  return `upi://pay?pa=${encodeURIComponent(vpa)}&pn=${encodeURIComponent(name).slice(0, 100)}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}`;
}

/** Data-URL PNG for a UPI link — print pages and portal show a scannable
 *  QR so paper bills and desktop screens collect payment too. */
export async function upiQrDataUrl(link: string): Promise<string> {
  return QRCode.toDataURL(link, { margin: 1, width: 160 });
}
