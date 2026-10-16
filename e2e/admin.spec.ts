import { expect, test, type Page } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

const signIn = async (page: Page, productSection?: 'add' | 'manage') => {
  await page.goto('./#admin', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email').fill('admin@luvia.test');
  await page.getByLabel('Password').fill('test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Manage catalogue' })).toBeVisible();
  expect(
    await page.evaluate(() => ({
      hasGtag: typeof window.gtag === 'function',
      scriptCount: document.querySelectorAll('script[src*="googletagmanager.com/gtag"]').length,
    })),
  ).toEqual({ hasGtag: false, scriptCount: 0 });
  if (productSection === 'add') {
    await page.getByRole('button', { name: /Add product/ }).click();
  }
  if (productSection === 'manage') {
    await page.getByRole('button', { name: /Manage products/ }).click();
  }
};

const expectNoHorizontalOverflow = async (page: Page) => {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
};

test('admin name edits refresh the shop greeting without signing in again', async ({ page }) => {
  await installMockSupabase(page);
  let name = '';
  await page.route('**/auth/v1/user', async route => {
    if (route.request().method() !== 'GET') { await route.fallback(); return; }
    await route.fulfill({ json: {
      id: 'admin-user', email: 'admin@luvia.test', aud: 'authenticated', role: 'authenticated',
      email_confirmed_at: '2026-01-01T00:00:00Z', is_anonymous: false, user_metadata: { full_name: name },
    } });
  });
  await page.route('**/functions/v1/manage-admin-users', async route => {
    const body = route.request().postDataJSON();
    if (body.action === 'list') {
      await route.fulfill({ json: { currentUserId: 'admin-user', isOwner: true, users: [{
        id: 'admin-user', email: 'admin@luvia.test', name, isOwner: true, verified: true, createdAt: '',
      }] } });
    } else {
      expect(body.action).toBe('edit');
      name = body.name;
      await route.fulfill({ json: { message: 'Admin name updated.' } });
    }
  });
  await signIn(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Admin users', exact: true }).click();
  await page.getByRole('button', { name: 'Edit admin@luvia.test', exact: true }).click();
  await page.getByLabel('Admin name', { exact: true }).fill('Gourav S');
  await page.getByLabel('Your current password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Save admin account' }).click();
  await expect(page.getByText('Admin name updated.', { exact: true })).toBeVisible();
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'My account, signed in as Gourav', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'My account, signed in as admin', exact: true })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test('owner manages admin names, passwords and access without mobile overflow', async ({ page }) => {
  await installMockSupabase(page);
  const owner = { id: 'admin-user', email: 'admin@luvia.test', name: 'Owner', isOwner: true, verified: true, createdAt: '' };
  let users = [owner, { ...owner, id: 'member', email: 'member@luvia.test', name: 'Member', isOwner: false }];
  const changes: Record<string, string>[] = [];
  await page.route('**/functions/v1/manage-admin-users', async route => {
    const body = route.request().postDataJSON();
    if (body.action === 'list') {
      await route.fulfill({ json: { currentUserId: owner.id, isOwner: true, users } });
      return;
    }
    changes.push(body);
    if (body.action === 'add') users.push({ ...owner, id: 'new', email: body.email, name: body.name, isOwner: false, verified: false });
    if (body.action === 'edit') users = users.map(user => user.id === body.id ? { ...user, name: body.name } : user);
    if (body.action === 'remove') users = users.filter(user => user.id !== body.id);
    await route.fulfill({ json: { message: 'Admin operation saved.' } });
  });
  await signIn(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Admin users', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove access for admin@luvia.test' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add admin user', exact: true }).click();
  await page.getByLabel('Admin email', { exact: true }).fill('new@luvia.test');
  await page.getByLabel('Admin name', { exact: true }).fill('New Admin');
  await expect(page.getByText(/new account receives an email invitation to set its own password/)).toBeVisible();
  await expect(page.getByText(/Existing verified accounts keep their current password and do not receive an invitation/)).toBeVisible();
  await expect(page.getByLabel('New admin password', { exact: true })).toHaveCount(0);
  await page.getByLabel('Your password - authorize admin invitation', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Authorize admin access', exact: true }).click();
  await expect(page.getByText('Invitation pending activation')).toBeVisible();
  await page.getByRole('button', { name: 'Edit new@luvia.test', exact: true }).click();
  await page.getByLabel('Admin name', { exact: true }).fill('Updated Admin');
  await page.getByLabel('Your current password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Save admin account' }).click();
  await expect(page.getByText('Updated Admin', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Change password for new@luvia.test', exact: true }).click();
  for (const [field, toggle] of [
    ['Your current password', 'Show your current password'],
    ['New admin password', 'Show new admin password'],
    ['Confirm new admin password', 'Show admin password confirmation'],
  ]) {
    await page.getByLabel(toggle, { exact: true }).check();
    await expect(page.getByLabel(field, { exact: true })).toHaveAttribute('type', 'text');
    await page.getByLabel(toggle, { exact: true }).uncheck();
  }
  await page.getByLabel('New admin password', { exact: true }).fill('StrongPassword123');
  await page.getByLabel('Confirm new admin password', { exact: true }).fill('StrongPassword123');
  await page.getByLabel('Your current password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Save admin account' }).click();
  await expect(page.getByRole('form', { name: 'Manage admin account' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Remove access for new@luvia.test', exact: true }).click();
  await expect(page.getByText(/This does not delete the account/)).toBeVisible();
  await page.getByLabel('Your current password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Confirm remove access' }).click();
  await expect(page.getByText('new@luvia.test', { exact: true })).toHaveCount(0);
  expect(changes.map(change => change.action)).toEqual(['add', 'edit', 'password', 'remove']);
  expect(changes[0].currentPassword).toBe('test-password');
  expect(changes[0]).not.toHaveProperty('password');
  await expectNoHorizontalOverflow(page);
});

test('filters featured products, searches them and updates the tab after saved edits', async ({ page }) => {
  const state = await installMockSupabase(page);
  await signIn(page, 'manage');
  const views = page.getByRole('navigation', { name: 'Product views' });
  const featured = views.getByRole('button', { name: /^Featured products/ });
  const all = views.getByRole('button', { name: /^All products/ });
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  await expect(featured).toHaveText('Featured products (1)');
  await featured.click();
  await expect(featured).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Rose Charm', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Flower Coaster', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Move Rose Charm down' })).toBeDisabled();
  await page.getByLabel('Search products').fill('does-not-exist');
  await expect(page.getByText('No featured products match “does-not-exist”.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear search' }).click();
  const rose = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Rose Charm', exact: true }) });
  await rose.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(all).toBeDisabled();
  await rose.getByLabel('Featured product').uncheck();
  await rose.getByRole('button', { name: 'Save changes' }).click();
  await expect(featured).toHaveText('Featured products (0)');
  await expect(page.getByText(/No featured products yet/)).toBeVisible();
  expect(state.products.find(product => product.id === 'product-1')?.featured).toBe(false);
  await all.click();
  await expect(page.getByRole('heading', { name: 'Flower Coaster', exact: true })).toBeVisible();
  await rose.getByRole('button', { name: 'Edit', exact: true }).click();
  await rose.getByLabel('Featured product').check();
  await rose.getByLabel('Visible in catalogue').uncheck();
  await rose.getByRole('button', { name: 'Save changes' }).click();
  await expect(featured).toHaveText('Featured products (1)');
  await featured.click();
  await expect(page.getByRole('heading', { name: 'Rose Charm', exact: true })).toBeVisible();
  await expect(page.getByText('Products marked Featured, including hidden products. Use Edit to change their featured status.')).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('updates all-time product pieces sold after recording, editing and deleting sales', async ({ page }) => {
  await installMockSupabase(page);
  const oldSale = {
    id: 'old-sale', product_id: 'product-1', product_name: 'Old name', variant_name: 'White',
    sale_date: '2025-01-01', channel: 'online', quantity: 4, unit_price: 349, gst_percent: 5,
    material_cost: 0, labour_cost: 0, packaging_cost: 0, shipping_cost: 0,
    gateway_fee_percent: 0, gateway_fee_gst_percent: 18, notes: '', created_at: '2025-01-01T00:00:00Z',
  };
  let sales = [oldSale];
  await page.route('**/rest/v1/business_expenses*', route => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/seller_sales*', async route => {
    const request = route.request();
    const id = new URL(request.url()).searchParams.get('id')?.replace('eq.', '');
    if (request.method() === 'POST') {
      const saved = { ...oldSale, ...request.postDataJSON(), id: 'new-sale' };
      sales.push(saved);
      await route.fulfill({ status: 201, json: saved });
    } else if (request.method() === 'PATCH') {
      sales = sales.map(sale => sale.id === id ? { ...sale, ...request.postDataJSON() } : sale);
      await route.fulfill({ json: sales.find(sale => sale.id === id) });
    } else if (request.method() === 'DELETE') {
      sales = sales.filter(sale => sale.id !== id);
      await route.fulfill({ status: 204 });
    } else {
      await route.fulfill({ json: sales });
    }
  });
  await signIn(page, 'manage');
  const count = page.getByLabel('Rose Charm pieces sold', { exact: true });
  await expect(count).toHaveText('Pieces sold (all time): 4');
  await page.getByRole('button', { name: 'Sales', exact: true }).click();
  await page.getByRole('button', { name: /Sales dashboard/ }).click();
  await page.getByLabel('Sales month').fill('2026-10');
  await page.getByRole('button', { name: 'Record sale', exact: true }).click();
  await page.getByLabel('Sale product', { exact: true }).selectOption('product-1');
  await page.getByLabel('Sale date', { exact: true }).fill('09/10/2026');
  await page.getByLabel('Sale quantity').fill('3');
  for (const label of ['Materials per piece (₹)', 'Labour per piece (₹)', 'Packaging per piece (₹)', 'Shipping cost for this sale (₹)']) {
    await page.getByLabel(label, { exact: true }).fill('0');
  }
  await page.getByRole('button', { name: 'Save sale', exact: true }).click();
  await expect(page.getByText('Sale recorded.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Products', exact: true }).click();
  await expect(count).toHaveText('Pieces sold (all time): 7');
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Sales', exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Sale quantity').fill('2');
  await page.getByRole('button', { name: 'Save sale changes', exact: true }).click();
  await expect(page.getByText('Sale updated.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Products', exact: true }).click();
  await expect(count).toHaveText('Pieces sold (all time): 6');
  await page.getByRole('button', { name: 'Sales', exact: true }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm delete', exact: true }).click();
  await expect(page.getByText('Sale deleted.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Products', exact: true }).click();
  await expect(count).toHaveText('Pieces sold (all time): 4');
  await page.reload();
  await page.getByRole('button', { name: /Manage products/ }).click();
  await expect(count).toHaveText('Pieces sold (all time): 4');
});

test('shows material, labour and shipping costs in annual and quarterly snapshots', async ({ page }) => {
  await installMockSupabase(page);
  await page.route('**/rest/v1/seller_sales?*', route => route.fulfill({ json: [{
    id: 'snapshot-sale', product_id: null, product_name: 'Rose', variant_name: '',
    sale_date: '2026-03-31', channel: 'offline', quantity: 3, unit_price: 200,
    gst_percent: 5, material_cost: 20, labour_cost: 15, packaging_cost: 5,
    shipping_cost: 80, gateway_fee_percent: 0, gateway_fee_gst_percent: 18,
    notes: '', created_at: '2026-10-12T00:00:00Z',
  }] }));
  await page.route('**/rest/v1/business_expenses*', route => route.fulfill({ json: [] }));
  await signIn(page);
  await page.getByRole('button', { name: 'Snapshots', exact: true }).click();
  await page.getByLabel('Snapshot year').selectOption('2026');
  for (const name of ['Year 2026 · Jan–Dec', 'Q1 · Jan–Mar 2026']) {
    const card = page.getByRole('article', { name, exact: true });
    for (const [label, amount] of [['Material cost', '₹60'], ['Labour cost', '₹45'], ['Packaging cost', '₹15'], ['Shipping cost', '₹80']]) {
      await expect(card.locator('dl > div').filter({ has: page.getByText(label, { exact: true }) }).locator('dd')).toHaveText(amount);
    }
  }
  const empty = page.getByRole('article', { name: 'Q2 · Apr–Jun 2026', exact: true });
  await expect(empty.locator('dl > div').filter({ has: page.getByText('Shipping cost', { exact: true }) }).locator('dd')).toHaveText('₹0');
  const annual = page.getByRole('article', { name: 'Year 2026 · Jan–Dec', exact: true });
  await expect(annual.getByText('Margin before business expenses: 65.0%')).toBeVisible();
  await expect(annual.getByText('Margin after business expenses: 65.0%')).toBeVisible();
  const profits = annual.locator('dl').first();
  await expect(profits.getByText('Estimated sales profit', { exact: true })).toBeVisible();
  await expect(profits.getByText('Profit after business expenses', { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('manages monthly business expenses and profit after overheads', async ({ page }) => {
  await installMockSupabase(page);
  let expenses: { id: string; description: string; expense_date: string; category: string; amount: number; notes: string }[] = [];
  await page.route('**/rest/v1/seller_sales?*', route => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/business_expenses*', async route => {
    const request = route.request();
    const id = new URL(request.url()).searchParams.get('id')?.replace('eq.', '');
    if (request.method() === 'POST') {
      expenses.push({ ...request.postDataJSON(), id: 'expense-1' });
      await route.fulfill({ status: 201, json: expenses[0] });
    } else if (request.method() === 'PATCH') {
      expenses = expenses.map(expense => expense.id === id ? { ...expense, ...request.postDataJSON() } : expense);
      await route.fulfill({ json: expenses.find(expense => expense.id === id) });
    } else if (request.method() === 'DELETE') {
      expenses = expenses.filter(expense => expense.id !== id);
      await route.fulfill({ json: [{ id }] });
    } else {
      await route.fulfill({ json: expenses });
    }
  });
  await signIn(page);
  await page.getByRole('button', { name: 'Sales', exact: true }).click();
  await page.getByRole('button', { name: /Sales dashboard/ }).click();
  await page.getByRole('button', { name: 'Business expenses', exact: true }).click();
  await page.getByRole('button', { name: 'Add expense' }).click();
  await page.getByLabel('Expense description').fill('October ads');
  await page.getByLabel('Expense date').fill('08/10/2026');
  await page.getByLabel('Expense amount').fill('250.50');
  await page.getByRole('button', { name: 'Save expense' }).click();
  await expect(page.getByText('Business expense saved.')).toBeVisible();
  const profit = page.getByRole('region', { name: 'Sales workspace' }).locator('article').filter({ has: page.getByText('Profit after business expenses', { exact: true }) });
  await expect(profit).toContainText('-₹251');
  await expect(page.getByRole('button', { name: 'Quarterly & yearly snapshot' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Snapshots', exact: true }).click();
  await page.getByLabel('Snapshot year').selectOption('2026');
  await expect(page.getByRole('article', { name: 'Year 2026 · Jan–Dec' })).toContainText('-₹251');
  await expect(page.getByRole('article', { name: 'Q4 · Oct–Dec 2026' })).toContainText('-₹251');
  await expect(page.getByRole('article', { name: 'Q1 · Jan–Mar 2026' })).not.toContainText('-₹251');
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Sales', exact: true }).click();
  await page.getByRole('button', { name: 'Edit expense October ads' }).click();
  await page.getByLabel('Expense amount').fill('100');
  await page.getByRole('button', { name: 'Save expense' }).click();
  await expect(profit).toContainText('-₹100');
  await page.getByRole('button', { name: 'Snapshots', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Year 2026 · Jan–Dec' })).toContainText('-₹100');
  await page.getByRole('button', { name: 'Sales', exact: true }).click();
  await page.getByLabel('Sales month').fill('2026-09');
  await expect(page.getByText('No business expenses recorded for this month.')).toBeVisible();
  await expect(profit).toContainText('₹0');
  await page.getByLabel('Sales month').fill('2026-10');
  await page.getByRole('button', { name: 'Delete expense October ads' }).click();
  await page.getByRole('button', { name: 'Confirm delete expense' }).click();
  await expect(page.getByText('Business expense deleted.')).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('edits a sale record inline at its list position', async ({ page }) => {
  await installMockSupabase(page);
  const row = (id: string, productName: string, saleDate: string) => ({
    id, product_id: null, product_name: productName, variant_name: '', sale_date: saleDate, channel: 'offline',
    quantity: 1, unit_price: 500, gst_percent: 0, material_cost: 50, labour_cost: 50, packaging_cost: 10,
    shipping_cost: 0, gateway_fee_percent: 0, gateway_fee_gst_percent: 18, notes: '', created_at: `${saleDate}T10:00:00Z`,
  });
  let sales = Array.from({ length: 8 }, (_, index) => row(`sale-${index + 1}`, `Sale item ${index + 1}`, `2026-10-${String(20 - index).padStart(2, '0')}`));
  await page.route('**/rest/v1/business_expenses*', route => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/seller_sales*', async route => {
    const request = route.request();
    if (request.method() === 'PATCH') {
      const id = new URL(request.url()).searchParams.get('id')?.replace('eq.', '');
      sales = sales.map(sale => sale.id === id ? { ...sale, ...request.postDataJSON() } : sale);
      await route.fulfill({ json: sales.find(sale => sale.id === id) });
    } else {
      await route.fulfill({ json: sales });
    }
  });
  await signIn(page);
  await page.getByRole('button', { name: 'Sales', exact: true }).click();
  await page.getByRole('button', { name: /Sales dashboard/ }).click();
  await page.getByLabel('Sales month').fill('2026-10');
  const record = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Sale item 7', exact: true }) });
  await record.getByRole('button', { name: 'Edit' }).click();
  const form = record.getByRole('form', { name: 'Edit sale' });
  await expect(form).toBeInViewport();
  await expect(form.getByLabel('Sale date')).toHaveValue('14/10/2026');
  await form.getByLabel('Sale date').fill('15/10/2026');
  await expect(page.getByRole('form')).toHaveCount(1);
  await form.getByLabel('Sale quantity').fill('3');
  await form.getByRole('button', { name: 'Save sale changes' }).click();
  await expect(page.getByText('Sale updated.')).toBeVisible();
  await expect(page.getByRole('form')).toHaveCount(0);
  await expect(record).toContainText('Qty 3');
  await expect(record).toContainText('15/10/2026');
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Record sale', exact: true }).click();
  await page.getByLabel('Sale product', { exact: true }).selectOption('product-2');
  await expect(page.getByLabel('Unit selling price', { exact: true })).toHaveValue('249');
  await page.getByRole('form', { name: 'Record a sale' }).getByRole('button', { name: 'Cancel', exact: true }).click();
});

test('opens attention filters from the collapsed product manager and restores all products', async ({ page }) => {
  const state = await installMockSupabase(page);
  state.products.find(product => product.id === 'product-2')!.in_stock = false;
  await signIn(page);
  const summary = page.getByRole('region', { name: 'Products needing attention' });
  await expect(summary).toBeVisible();
  await expect(page.getByRole('button', { name: /Manage products/ })).toHaveAttribute('aria-expanded', 'false');
  await summary.getByRole('button', { name: /Low \/ out of stock/ }).click();
  await expect(page.getByRole('button', { name: /Manage products/ })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('heading', { name: 'Flower Coaster', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Move Flower Coaster up' })).toBeDisabled();
  await page.getByLabel('Search products').fill('does-not-exist');
  await expect(page.getByText(/No products need attention/)).toBeVisible();
  await summary.getByRole('button', { name: /Missing pricing costs/ }).click();
  await expect(page.getByLabel('Search products')).toHaveValue('');
  await summary.getByRole('button', { name: 'Show all products' }).click();
  await expect(summary.getByRole('button', { name: /Missing pricing costs/ })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('heading', { name: 'Flower Coaster', exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('shows prominent minimum-margin price guidance without changing the catalogue price', async ({ page }) => {
  const state = await installMockSupabase(page);
  await signIn(page, 'manage');
  const coaster = page.locator('article').filter({
    has: page.getByRole('heading', { name: 'Flower Coaster', exact: true }),
  });
  const suggestion = coaster.getByLabel('Flower Coaster suggested price for minimum 35% margin');
  await expect(suggestion).toContainText('Complete valid time, cost and GST inputs');
  await coaster.getByRole('button', { name: /Price discovery Estimate/ }).click();
  await coaster.getByLabel('Flower Coaster time spent', { exact: true }).fill('1');
  await coaster.getByLabel('Flower Coaster materials cost', { exact: true }).fill('50');
  await expect(suggestion).toContainText('₹437');
  await expect(suggestion).toContainText('GST included');
  expect(state.products.find(product => product.id === 'product-2')?.price).toBe(249);
  await expectNoHorizontalOverflow(page);
});

test('keeps admin tasks separate and product entry focused without losing the draft', async ({ page }) => {
  await installMockSupabase(page);
  await signIn(page);
  await expect(page.getByRole('button', { name: /Manage categories/ })).not.toBeVisible();
  await page.getByRole('button', { name: /Add product/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Add product', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Product name', { exact: true }).fill('Draft Rose');
  await expect(dialog.getByLabel('Materials', { exact: true })).toHaveAttribute('required', '');
  await expect(dialog.getByLabel("What's included", { exact: true })).toHaveAttribute('required', '');
  const nameMarker = dialog.getByLabel('Product name', { exact: true }).locator('..').locator('span[aria-hidden="true"]');
  await expect(nameMarker).toHaveCSS('color', 'oklch(0.577 0.245 27.325)');
  expect(await nameMarker.evaluate(element => getComputedStyle(element, '::after').content)).toBe('"*"');
  await dialog.getByRole('button', { name: /Price discovery/ }).click();
  await dialog.getByLabel('Draft Rose time spent').fill('1');
  await dialog.getByLabel('Draft Rose materials cost').fill('50');
  await dialog.getByRole('button', { name: 'Suggest price', exact: true }).click();
  const customerPrice = dialog.getByLabel('Draft Rose customer price including GST');
  await customerPrice.fill('400');
  expect(await customerPrice.evaluate(input => input instanceof HTMLInputElement && input.validity.valid)).toBe(true);
  await dialog.getByRole('button', { name: 'Use in product editor' }).click();
  await expect(dialog.getByLabel('Price (₹)', { exact: true })).not.toHaveValue('');
  await expectNoHorizontalOverflow(page);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: /Add product/ })).toBeFocused();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('button', { name: /Manage categories/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Add product/ })).not.toBeVisible();
  await page.getByRole('button', { name: 'Products', exact: true }).click();
  await page.getByRole('button', { name: /Add product/ }).click();
  await expect(dialog.getByLabel('Product name', { exact: true })).toHaveValue('Draft Rose');
  await expect(dialog.getByLabel('Materials', { exact: true })).toHaveValue('');
  await dialog.getByRole('button', { name: 'Publish product with 1 variant', exact: true }).click();
  await expect(dialog).toBeVisible();
  expect(await dialog.getByLabel('Variant image', { exact: true }).evaluate(
    input => input instanceof HTMLInputElement && input.validity.valueMissing,
  )).toBe(true);
});

test('authenticates and manages the complete category lifecycle', async ({ page }) => {
  const state = await installMockSupabase(page);
  await signIn(page);
  await expect(page.getByRole('button', { name: /Add product/ })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(page.getByRole('button', { name: /Manage products/ })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expectNoHorizontalOverflow(page);

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: /Manage categories/ }).click();
  const charmsDisplay = page.getByLabel('Priority for Charms').locator('..').locator('..');
  await page.getByLabel('Priority for Charms').fill('5');
  await charmsDisplay.getByRole('button', { name: 'Save display' }).click();
  await expect(page.getByText('“Charms” priority was updated to 5.')).toBeVisible();
  expect(state.categorySettings.Charms).toEqual({ priority: 5 });

  await page.getByLabel('New category').fill('Bags');
  await page.getByRole('button', { name: 'Add category' }).click();
  await expect(page.getByText('“Bags” was added.')).toBeVisible();
  expect(state.categories).toContain('Bags');

  const bagsRow = page.getByLabel('Priority for Bags').locator('..').locator('..').locator('..');
  await bagsRow.getByRole('button', { name: 'Rename' }).click();
  await page.getByLabel('Rename category').fill('Tote Bags');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('“Bags” was renamed to “Tote Bags”.')).toBeVisible();
  expect(state.categories).toContain('Tote Bags');
  expect(state.categories).not.toContain('Bags');

  const renamedRow = page
    .getByLabel('Priority for Tote Bags')
    .locator('..')
    .locator('..')
    .locator('..');
  await renamedRow.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(page.getByText('“Tote Bags” was deleted.')).toBeVisible();
  expect(state.categories).not.toContain('Tote Bags');
});

test('uploads and replaces a seasonal cover, deletes the old R2 renditions and restores product fallback on removal', async ({ page }) => {
  const state = await installMockSupabase(page);
  const old = 'https://images.luviacreations.com/products/admin-user/old-cover.webp';
  state.categories.push('Festive');
  state.categorySettings.Festive = { priority: 1, isSeasonal: true, visible: true,
    productIds: [state.products[0].id], coverImage: old };
  const deleted: string[][] = [];
  await page.route('**/functions/v1/r2-images', async route => {
    if (!route.request().headers()['content-type']?.includes('application/json')) { await route.fallback(); return; }
    const body = route.request().postDataJSON() as { action: string; paths: string[] };
    expect(body.action).toBe('delete');
    deleted.push(body.paths);
    await route.fulfill({ json: { deleted: body.paths.length } });
  });
  await page.route('https://images.luviacreations.com/**', async route => {
    await route.fulfill({ contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="600"><rect width="300" height="600" fill="#edc357"/></svg>' });
  });
  await signIn(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: /Manage categories/ }).click();
  const row = page.getByLabel('Priority for Festive').locator('..').locator('..').locator('..').locator('..');
  await row.getByRole('button', { name: 'Manage products', exact: true }).click();
  const editor = page.getByRole('region', { name: 'Products in Festive' });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p1sAAAAASUVORK5CYII=', 'base64');
  await editor.getByLabel('Seasonal collection cover image').setInputFiles({ name: 'festive.png', mimeType: 'image/png', buffer: png });
  await expect(editor.getByAltText('Festive cover preview')).toHaveAttribute('src', /^blob:/);
  expect(deleted).toEqual([]);
  await editor.getByRole('button', { name: 'Save seasonal category' }).click();
  await expect(editor).toHaveCount(0);
  const cover = state.categorySettings.Festive.coverImage!;
  expect(cover).not.toBe(old);
  expect(deleted).toEqual([['r2:products/admin-user/old-cover']]);
  await row.getByRole('button', { name: 'Manage products', exact: true }).click();
  await expect(editor.getByAltText('Festive cover preview')).toHaveAttribute('src', cover);
  await expectNoHorizontalOverflow(page);
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.goto('/collections/');
  const card = page.getByRole('navigation', { name: 'Explore collections' }).getByRole('link', { name: 'Festive', exact: true });
  await expect(card.locator('img:not([aria-hidden])')).toHaveAttribute('src', cover.replace('.webp', '-w480.webp'));
  await expect(card.locator('img:not([aria-hidden])')).toHaveCSS('object-fit', 'contain');
  await card.click();
  await expect(page.getByRole('heading', { name: 'Handmade Festive', exact: true })).toBeVisible();
  await expect(page.getByAltText('Festive collection')).toHaveCount(0);
  await expect(page.locator(`img[src*="${new URL(cover).pathname.slice(1, -5)}"]`)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: state.products[0].name, exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.goto('/#admin');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: /Manage categories/ }).click();
  await row.getByRole('button', { name: 'Manage products', exact: true }).click();
  await editor.getByRole('button', { name: 'Remove cover image' }).click();
  await editor.getByRole('button', { name: 'Save seasonal category' }).click();
  await expect(editor).toHaveCount(0);
  expect(state.categorySettings.Festive.coverImage).toBe('');
  expect(deleted).toContainEqual([`r2:${new URL(cover).pathname.slice(1, -5)}`]);
  await page.goto('/collections/');
  await expect(card.locator('img:not([aria-hidden])')).not.toHaveAttribute('src', cover.replace('.webp', '-w480.webp'));
});

test('authors regular category image hotspots and shoppers explore products in the look', async ({ page }) => {
  const state = await installMockSupabase(page);
  const product = state.products[0];
  const category = product.category;
  const cover = 'https://images.luviacreations.com/products/admin-user/look-cover.webp';
  state.categorySettings[category].coverImage = cover;
  await page.route('https://images.luviacreations.com/**', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#224455"/></svg>',
  }));
  await signIn(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: /Manage categories/ }).click();
  const row = page.getByLabel(`Priority for ${category}`).locator('..').locator('..').locator('..').locator('..');
  await row.getByRole('button', { name: 'Edit image & overview', exact: true }).click();
  const editor = page.getByRole('region', { name: `Products in ${category}` });
  await editor.getByLabel('Search hotspot products').fill(product.name.slice(0, 3));
  await editor.getByLabel('Product for new hotspot').selectOption(product.id);
  await editor.getByRole('button', { name: 'Place new hotspot on photo' }).click();
  const imageButton = editor.getByRole('button', { name: 'Place hotspot on collection image' });
  await imageButton.click({ position: { x: 50, y: 75 } });
  await editor.getByLabel('Horizontal % for hotspot 1').fill('25');
  await editor.getByLabel('Vertical % for hotspot 1').fill('60');
  await editor.getByRole('button', { name: 'Save category content', exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(state.categorySettings[category].imageHotspots).toEqual([{ productId: product.id, x: 25, y: 60 }]);
  await page.goto(`/collections/${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/`);
  const look = page.getByRole('region', { name: `Shop the look: ${category}` });
  await expect(look).toBeVisible();
  const marker = look.getByRole('button', { name: `Explore ${product.name}, hotspot 1` });
  await expect(marker).toHaveCSS('left', /px$/);
  await marker.click();
  await expect(look.getByRole('heading', { name: product.name })).toBeVisible();
  const geometry = await look.evaluate(section => {
    const img = section.querySelector('img')!.getBoundingClientRect();
    const marker = section.querySelector('button')!.getBoundingClientRect();
    return { x: ((marker.x + marker.width / 2 - img.x) / img.width) * 100,
      y: ((marker.y + marker.height / 2 - img.y) / img.height) * 100 };
  });
  expect(geometry.x).toBeCloseTo(25, 0);
  expect(geometry.y).toBeCloseTo(60, 0);
  await expectNoHorizontalOverflow(page);
  const productLinks = look.getByRole('list', { name: 'Products in this look' });
  await expect(productLinks).toHaveCSS('width', '1px');
  await expect(productLinks).toHaveCSS('overflow', 'hidden');
  await expect(marker.locator('span')).toHaveCSS('width', '10px');
  await expect(marker.locator('span')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(marker.locator('span')).toHaveCSS('animation-name', 'none');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (payload: ShareData) => {
      const file = payload.files?.[0];
      if (!file) return;
      const image = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const centre = [...context.getImageData(156, 546, 1, 1).data];
      const outside = [...context.getImageData(168, 546, 1, 1).data];
      const ring = [...context.getImageData(160, 546, 1, 1).data];
      document.documentElement.dataset.hotspotShare = JSON.stringify({
        width: image.width, height: image.height, type: file.type, text: payload.text, centre, outside, ring,
      });
      image.close();
    } });
  });
  await expect.poll(async () => {
    await page.getByRole('button', { name: `Share ${category} collection`, exact: true }).click();
    return page.locator('html').getAttribute('data-hotspot-share');
  }).not.toBeNull();
  const shared = JSON.parse((await page.locator('html').getAttribute('data-hotspot-share'))!) as {
    width: number; height: number; type: string; text: string; centre: number[]; outside: number[]; ring: number[];
  };
  expect(shared).toMatchObject({ width: 612, height: 912, type: 'image/webp' });
  for (const pixel of [shared.centre, shared.outside]) {
    expect(Math.abs(pixel[0] - 34)).toBeLessThan(20);
    expect(Math.abs(pixel[1] - 68)).toBeLessThan(20);
    expect(Math.abs(pixel[2] - 85)).toBeLessThan(20);
  }
  for (let channel = 0; channel < 3; channel++) {
    expect(shared.ring[channel] - shared.centre[channel]).toBeGreaterThan(80);
  }
  expect(Math.max(...shared.ring.slice(0, 3)) - Math.min(...shared.ring.slice(0, 3))).toBeLessThan(40);
  expect(shared.text).toContain('small rings');
  expect(shared.text).toContain('/collections/charms/');
  await look.getByRole('link', { name: 'View product', exact: true }).click();
  await expect(page).toHaveURL(/\/p\//);
  await expect(page.getByRole('heading', { name: product.name, exact: true, level: 1 })).toBeVisible();
});

test('saves one product order for the main catalogue and category views', async ({ page }) => {
  const state = await installMockSupabase(page);
  await signIn(page, 'manage');

  await page.getByRole('button', { name: 'Move Rose Charm down' }).click();
  await expect(page.getByText('Display order updated for Rose Charm.')).toBeVisible();
  expect(
    [...state.products]
      .sort((left, right) => left.sort_order - right.sort_order)
      .map((product) => product.name),
  ).toEqual(['New Heart Charm', 'Rose Charm', 'Flower Coaster']);

  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('article', { name: 'Product: New Heart Charm' })).toBeVisible();
  await expect(page.getByRole('article').nth(0)).toHaveAccessibleName('Product: New Heart Charm');
  await page.getByText('Filter by category', { exact: true }).click();
  await page.getByRole('button', { name: 'Charms', exact: true }).click();
  await expect(page.getByRole('article').nth(0)).toHaveAccessibleName('Product: New Heart Charm');
  await expect(page.getByRole('article').nth(1)).toHaveAccessibleName('Product: Rose Charm');
});

test('bulk generates, reviews and saves descriptions without changing other product fields', async ({ page }) => {
  const state = await installMockSupabase(page);
  const originals = structuredClone(state.products);
  await signIn(page, 'manage');
  const bulkButton = page.getByRole('button', { name: 'Bulk descriptions with Gemini' });
  if (test.info().project.name === 'chromium') {
    await bulkButton.hover();
    await expect(bulkButton).toHaveCSS('text-decoration-line', 'underline');
  }
  await bulkButton.click();
  await page.getByRole('button', { name: 'Select all shown' }).click();
  await page.getByRole('button', { name: 'Generate selected descriptions' }).click();
  await expect(page.getByText(/Generation complete/)).toBeVisible();
  expect(state.products.map(product => product.description)).toEqual(originals.map(product => product.description));
  await page.getByRole('textbox', { name: 'Description for Rose Charm', exact: true }).fill('Reviewed handmade rose charm.');
  await page.getByLabel('Save Flower Coaster', { exact: true }).uncheck();
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Save all approved changes' }).click();
  await expect(page.getByText('2 products saved. Descriptions and SEO summaries only.')).toBeVisible();
  expect(state.products[0].description).toBe('Reviewed handmade rose charm.');
  expect(state.products[0].seo_description).toBe('Handmade crochet bunny with a pastel finish.');
  expect(state.products.find(product => product.name === 'Flower Coaster'))
    .toEqual(originals.find(product => product.name === 'Flower Coaster'));
  for (const [index, product] of state.products.entries()) {
    const { description: _copy, seo_description: _seo, ...rest } = product;
    const { description: _original, seo_description: _oldSeo, ...original } = originals[index];
    expect(rest).toEqual(original);
  }
});

test('retries failed bulk descriptions without replacing successful review edits', async ({ page }) => {
  const state = await installMockSupabase(page);
  const originals = structuredClone(state.products);
  let requests = 0;
  await page.route('**/functions/v1/analyze-product', async route => {
    requests++;
    if (requests <= 2) {
      await route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'Gemini rate limit.' }) });
    } else {
      await route.fallback();
    }
  });
  await signIn(page, 'manage');
  await page.getByRole('button', { name: 'Bulk descriptions with Gemini' }).click();
  await page.getByRole('button', { name: 'Select all shown' }).click();
  await page.getByRole('button', { name: 'Generate selected descriptions' }).click();
  await expect(page.getByText(/Generation complete/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry Rose Charm', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry New Heart Charm', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Description for Flower Coaster', exact: true }).fill('Reviewed coaster copy.');
  await page.getByLabel('Save Flower Coaster', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Retry Rose Charm', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Description for Rose Charm', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry Rose Charm', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Retry all failed', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Description for New Heart Charm', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry all failed', exact: true })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Description for Flower Coaster', exact: true })).toHaveValue('Reviewed coaster copy.');
  await expect(page.getByLabel('Save Flower Coaster', { exact: true })).not.toBeChecked();
  expect(requests).toBe(5);
  expect(state.products).toEqual(originals);
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Save all approved changes' }).click();
  await expect(page.getByText('2 products saved. Descriptions and SEO summaries only.')).toBeVisible();
  expect(state.products.find(product => product.name === 'Flower Coaster')).toEqual(originals.find(product => product.name === 'Flower Coaster'));
});

test('shows anonymous cart contents and WhatsApp activity', async ({ page }) => {
  const state = await installMockSupabase(page);
  const now = new Date().toISOString();
  state.carts.push({
    id: 'cart-admin-view',
    delivery_pin_code: '110001',
    delivery_pin_location: { districts: ['Central Delhi'], states: ['Delhi'], country: 'India' },
    delivery_pin_checked_at: now,
    user_id: 'anonymous-customer',
    reference: 'CRT-CUSTOMER',
    status: 'whatsapp_started',
    created_at: now,
    updated_at: now,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    whatsapp_started_at: now,
    cart_items: [
      {
        id: 'cart-item-admin-view',
        cart_id: 'cart-admin-view',
        product_id: 'product-1',
        variant_id: 'variant-1',
        product_name: 'Rose Charm',
        variant_name: 'Rose Pink',
        image_url: 'http://supabase.test/storage/v1/object/public/product-images/seed/mock.png',
        unit_price: 349,
        quantity: 2,
        created_at: now,
        updated_at: now,
      },
    ],
  });

  await signIn(page);
  await page.getByRole('button', { name: 'Orders', exact: true }).click();
  await page.getByRole('button', { name: /Anonymous cart activity/ }).click();
  await expect(page.getByRole('heading', { name: 'CRT-CUSTOMER' })).toBeVisible();
  await expect(page.getByText('Rose Pink · Qty 2')).toBeVisible();
  await expect(page.getByText('WhatsApp opened')).toBeVisible();
  await expect(page.getByText('Estimated total: ₹698')).toBeVisible();
  await expect(page.getByText('Delivery pincode: 110001 (shopper-provided, unverified)')).toBeVisible();
  await expect(page.getByText(/Postal area: Central Delhi · Delhi · India/)).toBeVisible();
  const cart = page.locator('article').filter({ has: page.getByRole('heading', { name: 'CRT-CUSTOMER' }) });
  const blockButton = await cart.getByRole('button', { name: 'Block cart session' }).boundingBox();
  const deleteButton = await cart.getByRole('button', { name: 'Delete cart' }).boundingBox();
  expect(blockButton).not.toBeNull();
  expect(deleteButton).not.toBeNull();
  expect(deleteButton!.x - (blockButton!.x + blockButton!.width)).toBeGreaterThanOrEqual(8);
  await page.getByRole('button', { name: 'Block cart session' }).click();
  await expect(page.getByText(/This is not an IP ban/)).toBeVisible();
  await page.getByRole('button', { name: 'Confirm block' }).click();
  await expect(page.getByText('Cart session blocked', { exact: true })).toBeVisible();
  expect(state.cartSessionBlocks).toHaveLength(1);
  await page.getByRole('button', { name: 'Delete cart' }).click();
  await page.getByRole('button', { name: 'Yes, delete cart' }).click();
  await expect(page.getByRole('heading', { name: 'CRT-CUSTOMER' })).toHaveCount(0);
  await expect(page.getByText('No active customer carts yet.')).toBeVisible();
  expect(state.carts).toHaveLength(0);
  await expect(page.getByRole('heading', { name: 'Blocked cart sessions' })).toBeVisible();
  await page.getByRole('button', { name: 'Unblock session' }).click();
  await expect(page.getByRole('heading', { name: 'Blocked cart sessions' })).toHaveCount(0);
  expect(state.cartSessionBlocks).toHaveLength(0);
});

test('manages rotating ticker messages', async ({ page }) => {
  const state = await installMockSupabase(page);
  await signIn(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();

  await page.getByRole('button', { name: /Manage ticker/ }).click();
  await expect(page.getByText('2 active of 3 messages')).toBeVisible();

  await page.getByLabel('New ticker message').fill('Festive offer available this weekend');
  await page.getByRole('button', { name: 'Add message' }).click();
  await expect(page.getByText('“Festive offer available this weekend” was added to the ticker.'))
    .toBeVisible();
  expect(state.tickerMessages.at(-1)).toMatchObject({
    message: 'Festive offer available this weekend',
    is_active: true,
  });

  const added = page.getByRole('group', { name: 'Ticker message 4' });
  await added.getByRole('button', { name: 'Up' }).click();
  await expect(page.getByText('Ticker message order was updated.')).toBeVisible();
  expect(state.tickerMessages.find((item) => item.message.startsWith('Festive'))?.sort_order).toBe(2);

  const hidden = page.getByRole('group', { name: 'Ticker message 4' });
  await hidden.getByRole('button', { name: 'Activate' }).click();
  await expect(page.getByText('“Hidden ticker message” is now active.')).toBeVisible();

  const shipping = page.getByRole('group', { name: 'Ticker message 1' });
  await shipping.getByRole('button', { name: 'Edit' }).click();
  await shipping.getByLabel('Edit ticker message').fill('Shipping available throughout India');
  await shipping.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Ticker message updated to “Shipping available throughout India”.'))
    .toBeVisible();

  const editedShipping = page.getByRole('group', { name: 'Ticker message 1' });
  await editedShipping.getByRole('button', { name: 'Deactivate' }).click();
  await expect(page.getByText('“Shipping available throughout India” is now inactive.')).toBeVisible();

  const removable = page.getByRole('group', { name: 'Ticker message 1' });
  await removable.getByRole('button', { name: 'Delete' }).click();
  await removable.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(page.getByText('“Shipping available throughout India” was deleted.')).toBeVisible();
  expect(state.tickerMessages.some((item) => item.message.includes('throughout India'))).toBe(false);
  await expectNoHorizontalOverflow(page);
});

test('uses Gemini suggestions to publish a product', async ({ page }) => {
  const state = await installMockSupabase(page);
  await signIn(page, 'add');
  await expect(page.getByLabel('Variant name')).toHaveValue('Standard');

  await page.getByLabel('Variant image').setInputFiles({
    name: 'a-very-long-crochet-product-image-filename-for-mobile-testing.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4l8AAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expectNoHorizontalOverflow(page);
  const variantNameRequest = page.waitForRequest('**/functions/v1/analyze-product');
  await page.getByRole('button', { name: '✨ Suggest name with AI' }).click();
  expect((await variantNameRequest).postDataJSON()).toMatchObject({ mode: 'variant-name' });
  await expect(page.getByLabel('Variant name')).toHaveValue('Ocean Blue');
  await page.getByLabel('Variant name').fill('Standard');
  await page.getByRole('button', { name: 'Warm minimal' }).click();
  const rawPrompt = [
    'Add soft morning light.',
    'Use a small handmade wooden basket, premium cream linen, natural shadows,',
    'a cosy craft-market feeling, subtle festive gift styling, botanical accents,',
    'and a polished catalogue look while keeping the crochet item exactly the same.',
    'Make it feel elegant for an Indian handmade brand and suitable for a product listing.',
  ].join(' ');
  expect(rawPrompt.length).toBeGreaterThan(300);
  await page.getByLabel('Optional instruction').fill(rawPrompt);
  const optimizeRequest = page.waitForRequest('**/functions/v1/optimize-image-prompt');
  await page.getByRole('button', { name: 'Optimize prompt with Gemini' }).click();
  expect((await optimizeRequest).postDataJSON()).toMatchObject({
    styleDirection: `Use a warm cream palette, soft natural light, and very minimal neutral props. ${rawPrompt}`,
  });
  await expect(page.getByLabel('Optional instruction')).toHaveValue(
    'Style on warm cream linen with soft morning light, subtle handmade gift props, and a premium crochet catalogue look.',
  );
  const generationRequest = page.waitForRequest('**/functions/v1/enhance-product-image');
  await page.getByRole('button', { name: 'Create studio image' }).click();
  expect((await generationRequest).postDataJSON()).toMatchObject({
    mode: 'studio',
    styleSuggestion:
      'Style on warm cream linen with soft morning light, subtle handmade gift props, and a premium crochet catalogue look.',
  });
  const originalPreview = page.getByRole('img', { name: 'Original product' });
  await expect(originalPreview).toBeVisible();
  await expect.poll(() => originalPreview.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  await expect(page.getByRole('img', { name: 'AI generated product preview' })).toBeVisible();
  await page.getByRole('button', { name: 'Use this image' }).click();
  await expect(page.getByText(/luvia-studio-\d+\.png/)).toBeVisible();
  await page.getByRole('button', { name: 'Suggest details from photo' }).click();
  await expect(page.getByLabel('Product name')).toHaveValue('AI Bunny');
  await expect(page.getByLabel('Description')).toHaveValue(
    'A soft handmade crochet bunny suggested by Gemini.',
  );
  await page.getByLabel('Variant price (₹)').fill('725');
  await page.getByLabel('Materials', { exact: true }).fill('Cotton yarn');
  await page.getByLabel("What's included", { exact: true }).fill('One crochet bunny');
  await page.getByLabel('Feature this product at the top of the catalogue').check();

  await page.getByRole('button', { name: 'Publish product' }).click();
  await expect(page.getByText('AI Bunny with 1 variant was published to the catalogue.')).toBeVisible();
  expect(state.products.some((product) => product.name === 'AI Bunny')).toBe(true);
  expect(state.products.find((product) => product.name === 'AI Bunny')?.featured).toBe(true);
  expect(state.products.find((product) => product.name === 'AI Bunny')?.image_path).toMatch(
    /\.webp$/,
  );
  expect(
    state.products.find((product) => product.name === 'AI Bunny')?.product_variants,
  ).toHaveLength(1);
  expect(
    state.products.find((product) => product.name === 'AI Bunny')?.product_variants[0].price,
  ).toBe(725);
  await page.getByRole('button', { name: 'Close Add product', exact: true }).click();
  await page.getByRole('button', { name: /Manage products/ }).click();
  await expect(
    page.getByRole('heading', { name: 'AI Bunny', exact: true }),
  ).toBeVisible();
});

test('edits visibility and permanently removes products', async ({ page }) => {
  const state = await installMockSupabase(page);
  await signIn(page, 'manage');

  const rose = page.locator('article').filter({
    has: page.getByRole('heading', { name: 'Rose Charm', exact: true }),
  });
  await rose.getByRole('button', { name: 'Edit' }).click();
  await rose.getByLabel('Product name').fill('Rose Bag Charm');
  await rose.getByLabel('Featured product').uncheck();
  await rose.getByLabel('Visible in catalogue').uncheck();
  await rose.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Rose Bag Charm was updated.')).toBeVisible();
  expect(state.products.find((product) => product.id === 'product-1')).toMatchObject({
    name: 'Rose Bag Charm',
    published: false,
    featured: false,
  });

  const coaster = page.locator('article').filter({
    has: page.getByRole('heading', { name: 'Flower Coaster', exact: true }),
  });
  await coaster.getByRole('button', { name: 'Remove' }).click();
  await coaster.getByRole('button', { name: 'Yes, remove' }).click();
  await expect(page.getByText('Flower Coaster was removed from the catalogue.')).toBeVisible();
  expect(state.products.some((product) => product.id === 'product-2')).toBe(false);
  await expect(
    page.getByRole('heading', { name: 'Flower Coaster', exact: true }),
  ).toHaveCount(0);
});

for (const blocked of [false, true]) {
  test(`price change from 100 to 120 ${blocked ? 'reports a blocked save without losing the draft' : 'persists after reload'}`, async ({ page }) => {
    const state = await installMockSupabase(page);
    state.products[1].price = 100;
    await signIn(page, 'manage');
    if (blocked) {
      await page.route('**/rest/v1/products*', async route => {
        if (route.request().method() === 'PATCH') {
          await route.fulfill({ json: { code: 'PGRST116', message: 'The result contains 0 rows', details: null, hint: null }, status: 406 });
        } else await route.fallback();
      });
    }
    const product = page.locator('article').filter({
      has: page.getByRole('heading', { name: 'Flower Coaster', exact: true }),
    });
    await product.getByRole('button', { name: 'Edit', exact: true }).click();
    await product.getByLabel('Price (₹)', { exact: true }).fill('120');
    await product.getByRole('button', { name: 'Save changes' }).click();
    if (blocked) {
      await expect(product.getByRole('alert')).toContainText('No update was confirmed');
      await expect(product.getByLabel('Price (₹)', { exact: true })).toHaveValue('120');
      await expect(page.getByText('Flower Coaster was updated.')).toHaveCount(0);
      expect(state.products[1].price).toBe(100);
    } else {
      await expect(page.getByText('Flower Coaster was updated.')).toBeVisible();
      expect(state.products[1].price).toBe(120);
      await page.reload();
      await page.getByRole('button', { name: /Manage products/ }).click();
      await product.getByRole('button', { name: 'Edit', exact: true }).click();
      await expect(product.getByLabel('Price (₹)', { exact: true })).toHaveValue('120');
    }
  });
}

test('controls product price visibility from the admin console', async ({ page }) => {
  const state = await installMockSupabase(page);
  await signIn(page, 'manage');

  const coaster = page.locator('article').filter({
    has: page.getByRole('heading', { name: 'Flower Coaster', exact: true }),
  });
  await expect(coaster.getByText('₹249 (hidden)')).toBeVisible();

  await coaster.getByRole('button', { name: 'Edit' }).click();
  await coaster.getByLabel('Price (₹)').fill('299');
  await coaster.getByLabel('Show price in catalogue').check();
  await coaster.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Flower Coaster was updated.')).toBeVisible();
  expect(state.products.find((product) => product.id === 'product-2')).toMatchObject({
    price: 299,
    show_price: true,
  });

  // A price cannot be shown before one is entered.
  const heart = page.locator('article').filter({
    has: page.getByRole('heading', { name: 'New Heart Charm', exact: true }),
  });
  await heart.getByRole('button', { name: 'Edit' }).click();
  await heart.getByLabel('Show price in catalogue').check();
  await heart.getByRole('button', { name: 'Save changes' }).click();
  await expect(heart.getByLabel('Price (₹)', { exact: true })).toHaveAttribute('required', '');
  expect(await heart.getByLabel('Price (₹)', { exact: true }).evaluate(input =>
    (input as HTMLInputElement).validity.valueMissing)).toBe(true);
  expect(state.products.find((product) => product.id === 'product-3')?.show_price).toBe(false);
});

test('searches managed products by product, category, description, and variant', async ({
  page,
}) => {
  await installMockSupabase(page);
  await signIn(page, 'manage');

  const search = page.getByLabel('Search products');
  const rose = page.locator('article').filter({
    has: page.getByRole('heading', { name: 'Rose Charm', exact: true }),
  });
  const coaster = page.locator('article').filter({
    has: page.getByRole('heading', { name: 'Flower Coaster', exact: true }),
  });

  await search.fill('Ivory');
  await expect(rose).toBeVisible();
  await expect(coaster).toBeHidden();
  await expect(page.getByText('Showing 1 of 3 products')).toBeVisible();

  await search.fill('home decor');
  await expect(coaster).toBeVisible();
  await expect(rose).toBeHidden();

  await search.fill('newly published');
  await expect(page.getByRole('heading', { name: 'New Heart Charm', exact: true })).toBeVisible();

  await search.fill('does not exist');
  await expect(page.getByText('No products match “does not exist”.')).toBeVisible();

  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page.getByText('Showing 3 of 3 products')).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('reorders variants and additional angle photos', async ({ page }) => {
  const state = await installMockSupabase(page);
  await signIn(page, 'manage');

  const rose = page.locator('article').filter({
    has: page.getByRole('heading', { name: 'Rose Charm', exact: true }),
  });
  await rose.getByRole('button', { name: 'Edit' }).click();

  const ivory = rose.getByRole('group', { name: 'Ivory variant' });
  await ivory.getByRole('button', { name: 'Up' }).click();
  await expect(page.getByText('Updated the variant order for Rose Charm.')).toBeVisible();
  expect(state.products[0].product_variants.find((variant) => variant.id === 'variant-2'))
    .toMatchObject({ sort_order: 0 });
  expect(state.products[0].product_variants.find((variant) => variant.id === 'variant-1'))
    .toMatchObject({ sort_order: 1 });
  expect(state.products[0].image_path).toBe('seed/rose-ivory.jpg');

  const rosePink = rose.getByRole('group', { name: 'Rose Pink variant' });
  const addAnglePhoto = rosePink.getByLabel('Add an additional photo to Rose Pink');
  await expect(addAnglePhoto).toBeEnabled();
  await addAnglePhoto.setInputFiles({
    name: 'angle-2.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4l8AAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(rosePink.getByText('New angle photo ready')).toBeVisible();
  await rosePink.getByRole('button', { name: 'Upload angle photo' }).click();
  await expect(page.getByText('Added an angle photo to “Rose Pink”.')).toBeVisible();

  await rosePink.getByLabel('Move additional photo 2 left for Rose Pink').click();
  await expect(page.getByText('Updated the angle photo order for “Rose Pink”.')).toBeVisible();
  const gallery = state.products[0].product_variants.find(
    (variant) => variant.id === 'variant-1',
  )!.product_variant_images;
  expect(gallery.find((image) => image.id === 'gallery-1')).toMatchObject({ sort_order: 1 });
  expect(gallery.find((image) => image.id !== 'gallery-1')).toMatchObject({ sort_order: 0 });
});

test('adds, updates, and removes product variants', async ({ page }) => {
  const state = await installMockSupabase(page);
  await signIn(page, 'manage');

  const rose = page.locator('article').filter({
    has: page.getByRole('heading', { name: 'Rose Charm', exact: true }),
  });
  await rose.getByRole('button', { name: 'Edit' }).click();
  await rose.getByRole('button', { name: '+ Add variant' }).click();
  await expectNoHorizontalOverflow(page);
  const newVariant = rose.getByRole('heading', { name: 'New variant' }).locator('..');
  await newVariant.getByLabel('Variant name').fill('Lavender');
  await newVariant.getByLabel('Variant price (₹)').fill('399');
  await expect(newVariant.getByLabel('Colour').first()).toHaveValue('#a78bfa');
  await newVariant.getByLabel('Variant image').setInputFiles({
    name: 'lavender.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4l8AAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await newVariant.getByRole('button', { name: 'Add variant' }).click();
  await expect(page.getByText('“Lavender” was added to Rose Charm.')).toBeVisible();
  expect(state.products[0].product_variants).toHaveLength(3);
  expect(state.products[0].product_variants.at(-1)?.price).toBe(399);

  const lavender = rose.getByRole('group', { name: 'Lavender variant' });
  await lavender.getByRole('button', { name: 'Edit' }).click();
  await lavender.getByLabel('Variant name').fill('Lilac');
  await lavender.getByLabel('Variant price (₹)').fill('449');
  await lavender.getByLabel('Stock status').selectOption('out-of-stock');
  await lavender.getByLabel('Available quantity').fill('4');
  await lavender.getByRole('button', { name: 'Save variant' }).click();
  await expect(page.getByText('“Lilac” was updated.')).toBeVisible();
  expect(state.products[0].product_variants.at(-1)).toMatchObject({
    price: 449,
    in_stock: false,
    available_quantity: 4,
  });

  const lilac = rose.getByRole('group', { name: 'Lilac variant' });
  await lilac.getByRole('button', { name: 'Remove' }).click();
  await lilac.getByRole('button', { name: 'Yes, remove' }).click();
  await expect(page.getByText('“Lilac” was removed from Rose Charm.')).toBeVisible();
  expect(state.products[0].product_variants).toHaveLength(2);
});

test('admin product discounts update customer card, detail and cart prices and can be removed', async ({ page }) => {
  const state = await installMockSupabase(page);
  const product = state.products[0];
  product.price = 500;
  Object.assign(product, { product_profit_margins: [{
    profit_margin_percent: 45, gst_percent: 5, time_spent: 1, time_unit: 'hours',
    material_cost: 50, shipping_cost: 50, packaging_cost: 10, target_margin_percent: 45,
  }] });
  await page.route('**/rest/v1/rpc/set_product_discount', async route => {
    const { target_product_id, percent_off } = route.request().postDataJSON();
    expect(target_product_id).toBe(product.id);
    expect([0, 20]).toContain(percent_off);
    Object.assign(product, {
      price: percent_off ? 400 : 500, regular_price: percent_off ? 500 : null, discount_percent: percent_off,
    });
    await route.fulfill({ json: null });
  });
  await signIn(page);
  await page.getByRole('button', { name: 'Product discounts', exact: true }).click();
  const discountSearch = page.getByRole('searchbox', { name: 'Search discount products' });
  await discountSearch.fill('does-not-match-any-product');
  await expect(page.getByText('No matching products.', { exact: true })).toBeVisible();
  await discountSearch.fill('rOsE');
  await expect(page.getByRole('option', { name: 'Rose Charm - No discount', exact: true })).toHaveCount(1);
  await page.getByRole('combobox', { name: 'Discount product', exact: true }).selectOption(product.id);
  await page.getByLabel('Discount percentage', { exact: true }).fill('20');
  const preview = page.getByRole('region', { name: 'Post-discount margin preview' });
  await expect(preview.getByText('After 20% discount (preview)')).toBeVisible();
  await expect(preview.getByText('Post-discount margin: 42.4%')).toHaveCount(2);
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Apply product discount', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('20% product discount applied to Rose Charm.');
  await expect(page.getByRole('option', { name: 'Rose Charm - 20% off applied', exact: true })).toHaveCount(1);
  await page.goto('/');
  const card = page.locator('article').filter({
    has: page.getByRole('button', { name: 'View Rose Charm', exact: true }),
  });
  await expect(card.getByText('20% off', { exact: true })).toBeVisible();
  await expect(card.getByText('20% OFF', { exact: true })).toBeVisible();
  await expect(card.getByText('20% off', { exact: true })).toHaveClass(/bg-cocoa/);
  await expect(card.locator('del')).toHaveText('₹500');
  await expect(card.getByText('Save ₹100 per piece', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View Rose Charm', exact: true }).click();
  await expect(page.getByText('20% off', { exact: true })).toBeVisible();
  await expect(page.getByText('20% OFF', { exact: true })).toBeVisible();
  await expect(page.getByText('Product offer', { exact: true })).toBeVisible();
  await expect(page.getByText('Product offer', { exact: true }).locator('..')).toHaveClass(/border-mustard/);
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Add to cart — Rose Charm', exact: true }).click();
  await page.getByRole('button', { name: 'Open cart with 1 item', exact: true }).click();
  await expect(page.getByText('Save ₹100 per piece', { exact: true })).toBeVisible();
  expect(state.carts[0].cart_items[0].unit_price).toBe(400);
  await expectNoHorizontalOverflow(page);
  await page.goto('/#admin');
  await page.getByRole('button', { name: 'Product discounts', exact: true }).click();
  await page.getByRole('combobox', { name: 'Discount product', exact: true }).selectOption(product.id);
  await page.getByRole('button', { name: 'Remove product discount', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Regular prices restored for Rose Charm.');
  await expect(page.getByRole('option', { name: 'Rose Charm - No discount', exact: true })).toHaveCount(1);
  await page.goto('/');
  const restored = page.locator('article').filter({
    has: page.getByRole('button', { name: 'View Rose Charm', exact: true }),
  });
  await expect(restored.getByText('20% off', { exact: true })).toHaveCount(0);
  await expect(restored.getByText('₹500', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View Rose Charm', exact: true }).click();
  await expect(page.getByText('Product offer', { exact: true })).toHaveCount(0);
  await expect(page.getByText('20% OFF', { exact: true })).toHaveCount(0);
});

test('reduces stock without recording sales and handles rejected adjustments', async ({ page }) => {
  const state = await installMockSupabase(page);
  const salesRequests: string[] = [];
  page.on('request', request => {
    if (request.method() !== 'GET' && /record_variant_sale|seller_sales/.test(request.url())) {
      salesRequests.push(request.url());
    }
  });
  let reject = false;
  await page.route('**/rest/v1/rpc/reduce_variant_stock', async route => {
    if (reject) {
      await route.fulfill({ status: 400, json: { message: 'Stock is reserved for an active payment.' } });
      return;
    }
    const body = route.request().postDataJSON();
    expect(body).toEqual({ target_variant_id: 'variant-1', removed_quantity: 2 });
    const variant = state.products[0].product_variants[0];
    Object.assign(variant, { available_quantity: 1 });
    await route.fulfill({ json: null });
  });
  await signIn(page, 'manage');
  const rose = page.locator('article').filter({
    has: page.getByRole('heading', { name: 'Rose Charm', exact: true }),
  });
  await rose.getByRole('button', { name: 'Edit' }).click();
  const variant = rose.getByRole('group', { name: 'Rose Pink variant' });
  await variant.getByLabel('Quantity to reduce for Rose Pink').fill('2');
  await variant.getByRole('button', { name: 'Reduce stock for Rose Pink' }).click();
  await expect(page.getByText('Reduced stock by 2 for "Rose Pink". No sale was recorded.')).toBeVisible();
  await expect(variant.getByText('In stock · 1 available')).toBeVisible();
  reject = true;
  await variant.getByRole('button', { name: 'Reduce stock for Rose Pink' }).click();
  await expect(page.getByText('Unable to reduce stock: Stock is reserved for an active payment.', { exact: true })).toBeVisible();
  await expect(variant.getByText('In stock · 1 available')).toBeVisible();
  expect(salesRequests).toEqual([]);
  await expectNoHorizontalOverflow(page);
});

test('records confirmed sales and restocks depleted variants', async ({ page }) => {
  const state = await installMockSupabase(page);
  await signIn(page, 'manage');

  const rose = page.locator('article').filter({
    has: page.getByRole('heading', { name: 'Rose Charm', exact: true }),
  });
  await rose.getByRole('button', { name: 'Edit' }).click();
  const rosePink = rose.getByRole('group', { name: 'Rose Pink variant' });

  await rosePink.getByLabel('Sold quantity for Rose Pink').fill('2');
  await rosePink.getByRole('button', { name: 'Record sale for Rose Pink' }).click();
  await expect(page.getByText('Recorded 2 sold for “Rose Pink”. 1 remaining.')).toBeVisible();
  expect(state.products[0].product_variants[0]).toMatchObject({
    available_quantity: 1,
    in_stock: true,
  });

  await rosePink.getByRole('button', { name: 'Record sale for Rose Pink' }).click();
  await expect(page.getByText('Recorded 1 sold for “Rose Pink”. 0 remaining.')).toBeVisible();
  await expect(rosePink.getByText('Out of stock · 0 available')).toBeVisible();
  expect(state.products[0].product_variants[0]).toMatchObject({
    available_quantity: 0,
    in_stock: false,
  });

  await rosePink.getByLabel('Add stock quantity for Rose Pink').fill('5');
  await rosePink.getByRole('button', { name: 'Add stock for Rose Pink' }).click();
  await expect(page.getByText('Added 5 to “Rose Pink”. 5 available.')).toBeVisible();
  await expect(rosePink.getByText('In stock · 5 available')).toBeVisible();
  expect(state.products[0].product_variants[0]).toMatchObject({
    available_quantity: 5,
    in_stock: true,
  });
  await expectNoHorizontalOverflow(page);
});

test('enhances an already uploaded variant main image with AI', async ({ page }) => {
  const state = await installMockSupabase(page);
  await signIn(page, 'manage');

  const rose = page.locator('article').filter({
    has: page.getByRole('heading', { name: 'Rose Charm', exact: true }),
  });
  await rose.getByRole('button', { name: 'Edit' }).click();

  const rosePink = rose.getByRole('group', { name: 'Rose Pink variant' });
  const originalImagePath = state.products[0].product_variants[0].image_path;
  await rosePink.getByRole('button', {
    name: 'Enhance Rose Pink main image with AI',
  }).click();
  await expect(rosePink.getByText('Improve uploaded main image')).toBeVisible();

  const generationRequest = page.waitForRequest('**/functions/v1/enhance-product-image');
  await rosePink.getByRole('button', { name: 'Create studio image' }).click();
  expect((await generationRequest).postDataJSON()).toMatchObject({ mode: 'studio' });
  await expect(
    rosePink.getByRole('img', { name: 'AI generated product preview' }),
  ).toBeVisible();

  await rosePink.getByRole('button', { name: 'Use this image' }).click();
  await expect(
    page.getByText('Updated the main image for “Rose Pink” with AI.'),
  ).toBeVisible();
  expect(state.products[0].product_variants[0].image_path).not.toBe(originalImagePath);
  expect(state.products[0].product_variants[0].image_path).toMatch(/\.webp$/);
  expect(state.products[0].image_path).toBe(state.products[0].product_variants[0].image_path);
});

test('creates a new angle and a prefilled variant from existing images with AI', async ({
  page,
}) => {
  const state = await installMockSupabase(page);
  await signIn(page, 'manage');

  const rose = page.locator('article').filter({
    has: page.getByRole('heading', { name: 'Rose Charm', exact: true }),
  });
  await rose.getByRole('button', { name: 'Edit' }).click();

  const rosePink = rose.getByRole('group', { name: 'Rose Pink variant' });
  const variantRow = () => state.products[0].product_variants.find(
    (variant) => variant.id === 'variant-1',
  )!;
  expect(variantRow().product_variant_images).toHaveLength(1);

  await rosePink.getByRole('button', {
    name: 'Create new image from Rose Pink main image with AI',
  }).click();
  await expect(rosePink.getByText('Create from Rose Pink main image')).toBeVisible();
  await expect(rosePink.getByRole('button', { name: 'New angle' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await rosePink.getByRole('button', { name: 'Create studio image' }).click();
  await rosePink.getByRole('button', { name: 'Use this image' }).click();
  await expect(page.getByText('Created a new AI angle photo for “Rose Pink”.')).toBeVisible();
  expect(variantRow().product_variant_images).toHaveLength(2);

  await rosePink.getByRole('button', {
    name: 'Create new image from additional photo 1 of Rose Pink with AI',
  }).click();
  await rosePink.getByRole('button', { name: 'New variant' }).click();
  await rosePink.getByRole('button', { name: 'Create lifestyle image' }).click();
  await rosePink.getByRole('button', { name: 'Use this image' }).click();

  const newVariant = rose.getByRole('heading', { name: 'New variant' }).locator('..');
  await expect(newVariant.getByText(/luvia-lifestyle-\d+\.png/)).toBeVisible();
  await newVariant.getByLabel('Variant name').fill('AI Rose Gold');
  await newVariant.getByRole('button', { name: 'Add variant' }).click();
  await expect(page.getByText('“AI Rose Gold” was added to Rose Charm.')).toBeVisible();
  expect(state.products[0].product_variants).toHaveLength(3);
});

test('promotes a gallery photo to the main image without losing it, and removes gallery photos', async ({
  page,
}) => {
  const state = await installMockSupabase(page);
  await signIn(page, 'manage');

  const rose = page.locator('article').filter({
    has: page.getByRole('heading', { name: 'Rose Charm', exact: true }),
  });
  await rose.getByRole('button', { name: 'Edit' }).click();

  const rosePink = rose.getByRole('group', { name: 'Rose Pink variant' });
  const variantRow = () => state.products[0].product_variants.find((v) => v.id === 'variant-1')!;

  // Seeded with one gallery photo up front (see mockSupabase defaultProducts).
  expect(variantRow().product_variant_images).toHaveLength(1);

  await rosePink.getByLabel('Add an additional photo to Rose Pink').setInputFiles({
    name: 'angle-2.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4l8AAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(rosePink.getByText('New angle photo ready')).toBeVisible();
  await rosePink.getByRole('button', { name: 'Upload angle photo' }).click();
  await expect(page.getByText('Added an angle photo to “Rose Pink”.')).toBeVisible();
  expect(variantRow().product_variant_images).toHaveLength(2);

  const mainImagePathBeforeSwap = variantRow().image_path;
  const galleryImagePathBeforeSwap = variantRow().product_variant_images[0].image_path;
  expect(galleryImagePathBeforeSwap).toBe('seed/rose-angle.jpg');

  await rosePink.locator('button[aria-label^="Set additional photo"]').first().click();
  await expect(page.getByText('Updated the main photo for “Rose Pink”.')).toBeVisible();

  // The gallery photo becomes the main image...
  expect(variantRow().image_path).toBe(galleryImagePathBeforeSwap);
  // ...and the previous main image now lives in the gallery instead of being
  // lost, so the gallery still has the same number of photos.
  expect(variantRow().product_variant_images).toHaveLength(2);
  expect(variantRow().product_variant_images.map((item) => item.image_path)).toContain(
    mainImagePathBeforeSwap,
  );

  await rosePink.locator('button[aria-label^="Remove additional photo"]').first().click();
  await expect(page.getByText('Removed a photo from “Rose Pink”.')).toBeVisible();
  expect(variantRow().product_variant_images).toHaveLength(1);
});
