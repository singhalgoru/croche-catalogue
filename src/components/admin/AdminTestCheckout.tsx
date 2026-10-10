import { useState } from 'react';
import type { Cart } from '../../types/cart';
import { fetchCart } from '../../services/cart';
import RazorpayCheckout from '../RazorpayCheckout';

export default function AdminTestCheckout() {
  const [cart, setCart] = useState<Cart | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const loadCart = async () => {
    setBusy(true);
    setError('');
    setCart(null);
    try {
      const next = await fetchCart();
      if (!next.items.length) throw new Error('Your cart is empty. Add products in the shop while signed in as admin, then return here.');
      setCart(next);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to load your test cart.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="mb-6 rounded-2xl border border-mustard/40 bg-white p-5 text-cocoa" aria-label="Admin payment testing">
      <h2 className="font-heading text-xl font-bold">Razorpay test payment</h2>
      <p className="mt-2 text-sm text-cocoa/70">
        Admin only. Add priced, available products to your own shop cart, then load it here.
        Test payments do not place orders, redeem coupons or change stock. Customer online checkout is configured separately.
      </p>
      <a href="#" className="mt-2 inline-block min-h-11 py-2 text-sm underline">Open shop to add test items</a>
      <button type="button" disabled={busy} onClick={() => { void loadCart(); }}
        className="ml-3 min-h-11 rounded-full border border-cocoa px-4 py-2 text-sm font-semibold disabled:opacity-50">
        {busy ? 'Loading test cart...' : 'Load my cart for test payment'}
      </button>
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      {cart && <>
        <p className="mt-2 text-sm">Your cart: {cart.reference} ({cart.items.length} product lines).
          The backend rechecks availability and calculates the payment amount.</p>
        <RazorpayCheckout key={cart.id} cart={cart} disabled={busy} />
      </>}
    </section>
  );
}
