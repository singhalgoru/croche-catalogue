import { useState } from 'react';
import { bookDtdcTest, clearDtdcTest, labelDtdcTest, listDtdcTests, trackDtdcTest,
  type DtdcTestBooking } from '../../services/dtdcSandbox';

export default function DtdcSandbox() {
  const [bookings, setBookings] = useState<DtdcTestBooking[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [clearId, setClearId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const unresolved = bookings?.some(item => item.state === 'pending' || item.state === 'review') ?? false;
  const button = 'min-h-11 rounded-full border border-cocoa/25 px-4 py-2 text-sm font-semibold disabled:opacity-50';

  async function refresh() {
    setBusy(true); setError('');
    try { setBookings(await listDtdcTests()); }
    catch (failure) {
      setBookings(null);
      setError(failure instanceof Error ? failure.message : 'Unable to load DTDC sandbox.');
    }
    finally { setBusy(false); }
  }
  async function book() {
    setBusy(true); setError(''); setNotice(''); setConfirmed(false);
    try {
      await bookDtdcTest();
      setBookings(await listDtdcTests());
      setNotice('Test booking created. This is not a customer order.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Test booking could not be confirmed.');
      setBookings(null);
    } finally { setBusy(false); }
  }
  async function clear(id: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      await clearDtdcTest(id);
      setBookings(await listDtdcTests());
      setClearId(null);
      setNotice('Test booking cleared after your confirmation.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to clear test booking.'); }
    finally { setBusy(false); }
  }
  async function tracking(id: string) {
    setBusy(true); setError(''); setNotice('');
    try { setNotice(`DTDC test tracking: ${await trackDtdcTest(id)}`); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to track test booking.'); }
    finally { setBusy(false); }
  }
  async function label(booking: DtdcTestBooking) {
    setBusy(true); setError(''); setNotice('');
    try {
      const pdf = await labelDtdcTest(booking.id);
      const url = URL.createObjectURL(pdf);
      const link = document.createElement('a');
      link.href = url; link.download = `dtdc-test-${booking.awb}.pdf`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to download test label.'); }
    finally { setBusy(false); }
  }
  return <details className="my-3 rounded-xl border border-cocoa/20 bg-white p-3"
    onToggle={event => { if (event.currentTarget.open && bookings === null && !busy) void refresh(); }}>
    <summary className="cursor-pointer font-semibold">DTDC sandbox tests</summary>
    <p className="mt-2 text-xs">Sandbox only. Uses synthetic parcel and address details; never uses customer orders.
      Test booking may create a record in DTDC&apos;s test account. Rates and live shipping are not available here.</p>
    <button type="button" className={`${button} mt-2`} disabled={busy} onClick={() => void refresh()}>Refresh test bookings</button>
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="mt-2 text-sm">{notice}</p>}
    {bookings && <>
      {unresolved && <p role="alert" className="mt-2 text-sm text-red-700">
        A booking needs reconciliation. Check its reference in DTDC before clearing it or creating another test.
      </p>}
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input type="checkbox" checked={confirmed} disabled={busy || unresolved} onChange={event => setConfirmed(event.target.checked)} />
        I confirm this creates a synthetic test shipment in DTDC&apos;s sandbox.
      </label>
      <button type="button" className={`${button} mt-2`} disabled={busy || unresolved || !confirmed}
        onClick={() => void book()}>Create test booking</button>
      {!bookings.length && <p className="mt-2 text-sm">No DTDC test bookings yet.</p>}
      {bookings.map(item => <article key={item.id} className="mt-3 rounded-lg border border-cocoa/20 p-3 text-sm">
        <p>Reference: {item.customer_reference}</p>
        <p>State: {item.state}{item.awb ? ` · AWB: ${item.awb}` : ''}</p>
        {item.state === 'booked' && <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className={button} disabled={busy} onClick={() => void tracking(item.id)}>Track test shipment</button>
          <button type="button" className={button} disabled={busy} onClick={() => void label(item)}>Download test label</button>
        </div>}
        {(item.state === 'review' || item.state === 'pending') && <div className="mt-2">
          <p>Wait at least five minutes and check DTDC using the reference. Clearing does not cancel a shipment.</p>
          <label className="mt-2 flex gap-2"><input type="checkbox" checked={clearId === item.id} disabled={busy}
            onChange={event => setClearId(event.target.checked ? item.id : null)} />
            I checked DTDC and reconciled this test booking.</label>
          <button type="button" className={`${button} mt-2`} disabled={busy || clearId !== item.id}
            onClick={() => void clear(item.id)}>Clear reconciled test</button>
        </div>}
      </article>)}
    </>}
  </details>;
}
