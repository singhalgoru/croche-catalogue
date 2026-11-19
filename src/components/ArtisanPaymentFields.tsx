import type { ArtisanPaymentDetails } from '../services/artisanPaymentDetails';

export default function ArtisanPaymentFields({ value,onChange }: {
  value: ArtisanPaymentDetails; onChange: (value: ArtisanPaymentDetails) => void;
}) {
  const input = 'mt-1 block min-h-11 w-full rounded border border-cocoa/30 p-2';
  return <div className="space-y-3">
    <label className="block text-sm">Account holder name
      <input className={input} required maxLength={100} autoComplete="off" value={value.name}
        onChange={event => onChange({ ...value,name: event.target.value })} /></label>
    <label className="block text-sm">Payment method
      <select className={input} value={value.method} onChange={event => onChange({
        ...value,method: event.target.value === 'Bank transfer' ? 'Bank transfer' : 'UPI',
      })}><option>UPI</option><option>Bank transfer</option></select></label>
    {value.method === 'UPI' ? <label className="block text-sm">UPI ID
      <input className={input} required maxLength={100} autoComplete="off" value={value.upi}
        onChange={event => onChange({ ...value,upi: event.target.value })} /></label> : <>
      <label className="block text-sm">Bank account number
        <input className={input} required inputMode="numeric" pattern="[0-9]{6,34}" autoComplete="off" value={value.account}
          onChange={event => onChange({ ...value,account: event.target.value })} /></label>
      <label className="block text-sm">IFSC
        <input className={input} required maxLength={11} autoComplete="off" value={value.ifsc}
          onChange={event => onChange({ ...value,ifsc: event.target.value })} /></label>
    </>}
  </div>;
}
