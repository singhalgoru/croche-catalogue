import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';
import type { CustomerOrder } from '../src/types/customer';
import type { ShippingState } from '../src/services/orderShipping';

test('admin approves a packed parcel before booking, then generates a label, requests pickup and syncs tracking',async ({ page }) => {
  await installMockSupabase(page);
  const fulfilment = { status: 'confirmed' as const,courierName: '',trackingNumber: '',trackingUrl: '',updatedAt: null };
  const order: CustomerOrder = {
    id: '10000000-0000-4000-8000-000000000001',reference: 'LUV-SHIPPING',status: 'paid',
    createdAt: '2026-10-20T12:00:00Z',paidAt: '2026-10-20T12:10:00Z',customerName: 'Test Buyer',deliveryPincode: '110001',
    subtotal: 500,discount: 0,shipping: 0,total: 500,fulfilment,
    items: [{ id: 'item',productName: 'Rose Charm',variantName: 'Pink',quantity: 1,unitPrice: 500,lineTotal: 500 }],
  };
  let shipping: ShippingState = {
    parcel: null,quotes: [],quotedAt: null,shipmentId: null,awb: null,courierName: null,
    labelUrl: null,pickupRequested: false,reviewRequired: false,busy: false,lastError: null,
    trackingStatus: null,syncedAt: null,fulfilment,
  };
  const actions: string[] = [];
  await page.route('**/rest/v1/rpc/get_admin_live_orders',route => route.fulfill({ json: [order] }));
  await page.route('**/functions/v1/order-shipping',async route => {
    const body = route.request().postDataJSON();
    expect(body.orderId).toBe(order.id);
    actions.push(body.action);
    if (body.action === 'quote') {
      expect(body.parcel).toEqual({ weight: 0.75,length: 20,breadth: 15,height: 10 });
      shipping = { ...shipping,parcel: body.parcel,quotedAt: new Date().toISOString(),
        quotes: [{ id: 10,name: 'Test courier',charge: 85,days: 3,recommended: true }] };
    } else if (body.action === 'book') {
      expect(body).toMatchObject({ courierId: 10,readyToShip: true,quotedAt: shipping.quotedAt });
      shipping = { ...shipping,shipmentId: 123,awb: 'AWB123',courierName: 'Test courier',
        fulfilment: { ...fulfilment,deliveryEstimate: {
          courierName: 'Test courier',transitDays: 3,expectedDate: null,updatedAt: new Date().toISOString(),
        } } };
    } else if (body.action === 'label') {
      shipping = { ...shipping,labelUrl: 'https://labels.example/shipping.pdf' };
    } else if (body.action === 'pickup') {
      shipping = { ...shipping,pickupRequested: true };
    } else if (body.action === 'sync') {
      shipping = { ...shipping,trackingStatus: 'IN TRANSIT',syncedAt: new Date().toISOString(),fulfilment: {
        status: 'shipped',courierName: 'Test courier',trackingNumber: 'AWB123',
        trackingUrl: 'https://shiprocket.co/tracking/AWB123',updatedAt: new Date().toISOString(),
        deliveryEstimate: { courierName: 'Test courier',transitDays: 3,expectedDate: '2026-10-25',
          updatedAt: new Date().toISOString() },
      } };
    } else expect(body.action).toBe('status');
    await route.fulfill({ json: shipping });
  });
  await page.goto('./#admin');
  await page.getByLabel('Email',{ exact: true }).fill('admin@luvia.test');
  await page.getByLabel('Password').fill('test-password');
  await page.getByRole('button',{ name: 'Sign in',exact: true }).click();
  await page.getByRole('button',{ name: 'Orders',exact: true }).click();
  const panel = page.getByRole('region',{ name: 'Online orders',exact: true });
  await panel.getByRole('button',{ name: 'Online orders',exact: true }).click();
  const article = panel.getByRole('article',{ name: 'Order LUV-SHIPPING' });
  await article.getByRole('button',{ name: 'Show details for LUV-SHIPPING' }).click();
  expect(actions).toEqual([]);
  await article.getByRole('button',{ name: 'Manage Shiprocket shipping' }).click();
  const shippingPanel = article.getByRole('region',{ name: 'Shiprocket shipping' });
  await shippingPanel.getByLabel('Packed weight (kg)').fill('0.75');
  await shippingPanel.getByLabel('Length (cm)').fill('20');
  await shippingPanel.getByLabel('Width (cm)').fill('15');
  await shippingPanel.getByLabel('Height (cm)').fill('10');
  await shippingPanel.getByRole('button',{ name: 'Check available couriers' }).click();
  await shippingPanel.getByLabel('Approve courier').selectOption('10');
  const booking = shippingPanel.getByRole('button',{ name: /Book Test courier/ });
  await expect(booking).toBeDisabled();
  await shippingPanel.getByRole('checkbox').check();
  await expect(booking).toBeEnabled();
  await booking.click();
  await expect(shippingPanel.getByText(/AWB: AWB123/)).toBeVisible();
  await expect(article.getByText('Order: Confirmed',{ exact: true })).toBeVisible();
  await expect(article.getByText('Estimated transit: about 3 days after courier pickup.')).toBeVisible();
  await expect(booking).toHaveCount(0);
  await shippingPanel.getByRole('button',{ name: 'Generate label' }).click();
  await expect(shippingPanel.getByRole('link',{ name: 'Open shipping label' })).toHaveAttribute('href','https://labels.example/shipping.pdf');
  await shippingPanel.getByRole('button',{ name: 'Request pickup' }).click();
  await expect(shippingPanel.getByRole('button',{ name: 'Pickup requested' })).toBeDisabled();
  await shippingPanel.getByRole('button',{ name: 'Sync courier tracking' }).click();
  await expect(article.getByText('Order: Shipped',{ exact: true })).toBeVisible();
  await expect(article.getByText("Courier's expected delivery: 25 Oct 2026")).toBeVisible();
  await expect(article.getByRole('link',{ name: 'Track shipment' })).toHaveAttribute('href','https://shiprocket.co/tracking/AWB123');
  expect(actions).toEqual(['status','quote','book','label','pickup','sync']);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
