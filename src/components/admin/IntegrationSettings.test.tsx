import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import IntegrationSettings from './IntegrationSettings';

const { fetchSettings, saveSettings } = vi.hoisted(() => ({ fetchSettings: vi.fn(), saveSettings: vi.fn() }));
vi.mock('../../services/siteIntegrations', () => ({
  fetchAdminSiteIntegrations: fetchSettings,
  saveAdminSiteIntegrations: saveSettings,
}));

const initial = {
  whatsappNumber: '919205907350',
  googleAnalyticsMeasurementId: 'G-ABC1234567',
  metaPixelId: '1887798915586317',
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchSettings.mockResolvedValue({ ...initial, canEdit: true });
  saveSettings.mockImplementation(async value => value);
});
afterEach(cleanup);

it('loads the editable public integration settings and saves changes', async () => {
  render(<IntegrationSettings />);
  const toggle = screen.getByRole('button', { name: 'Site integrations' });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(fetchSettings).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Save site integrations' })).toBeNull();
  fireEvent.click(toggle);
  const whatsapp = await screen.findByLabelText(/WhatsApp contact number/);
  expect(whatsapp).toHaveProperty('value', initial.whatsappNumber);
  expect(screen.getByLabelText(/Google Analytics 4 measurement ID/)).toHaveProperty('value', initial.googleAnalyticsMeasurementId);
  expect(screen.getByLabelText(/Meta Pixel ID/)).toHaveProperty('value', initial.metaPixelId);

  fireEvent.change(whatsapp, { target: { value: '+91 98765 43210' } });
  fireEvent.change(screen.getByLabelText(/Meta Pixel ID/), { target: { value: '1999999999999999' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save site integrations' }));
  await waitFor(() => expect(saveSettings).toHaveBeenCalledWith({
    ...initial, whatsappNumber: '+91 98765 43210', metaPixelId: '1999999999999999',
  }));
  expect((await screen.findByRole('status')).textContent).toMatch(/^Settings saved\./);
  expect(screen.getByText(/CAPTCHA site keys stay paired with their server-side secrets/)).toBeTruthy();
  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByRole('button', { name: 'Save site integrations' })).toBeNull();
});

it('allows other admins to view but not edit integration settings', async () => {
  fetchSettings.mockResolvedValue({ ...initial, canEdit: false });
  render(<IntegrationSettings />);
  fireEvent.click(screen.getByRole('button', { name: 'Site integrations' }));
  expect(await screen.findByText(/Read-only. Only the site owner/)).toBeTruthy();
  for (const label of [/WhatsApp contact number/, /Google Analytics 4 measurement ID/, /Meta Pixel ID/]) {
    expect(screen.getByLabelText(label)).toHaveProperty('disabled', true);
  }
  expect(screen.queryByRole('button', { name: 'Save site integrations' })).toBeNull();
  fireEvent.submit(screen.getByLabelText(/WhatsApp contact number/).closest('form')!);
  expect((await screen.findByRole('alert')).textContent).toContain('Only the site owner');
  expect(saveSettings).not.toHaveBeenCalled();
});

it('provides a read-only GA4 verification guide without saving settings or claiming receipt', async () => {
  fetchSettings.mockResolvedValue({ ...initial, canEdit: false });
  render(<IntegrationSettings />);
  fireEvent.click(screen.getByRole('button', { name: 'Site integrations' }));
  const summary = await screen.findByText('Verify GA4 tracking');
  fireEvent.click(summary);
  expect(summary.closest('details')).toHaveProperty('open', true);
  expect(screen.getByRole('link', { name: 'Google Analytics' }).getAttribute('href')).toBe('https://analytics.google.com/');
  expect(screen.getByText(/A saved measurement ID does not prove that Google receives events/)).toBeTruthy();
  expect(screen.getByText(/These actions do not prove that a message was sent or an order was placed/)).toBeTruthy();
  expect(saveSettings).not.toHaveBeenCalled();
});

it('does not retain edit access when reopening fails to refresh permissions', async () => {
  render(<IntegrationSettings />);
  const toggle = screen.getByRole('button', { name: 'Site integrations' });
  fireEvent.click(toggle);
  await screen.findByRole('button', { name: 'Save site integrations' });
  fireEvent.click(toggle);
  fetchSettings.mockRejectedValueOnce(new Error('Unable to check site integration permissions.'));
  fireEvent.click(toggle);
  expect((await screen.findByRole('alert')).textContent).toContain('Unable to check site integration permissions.');
  expect(screen.queryByRole('button', { name: 'Save site integrations' })).toBeNull();
});

it('shows save failures and does not report success', async () => {
  saveSettings.mockRejectedValue(new Error('Verified admin access is required.'));
  render(<IntegrationSettings />);
  fireEvent.click(screen.getByRole('button', { name: 'Site integrations' }));
  await screen.findByDisplayValue(initial.metaPixelId);
  fireEvent.click(screen.getByRole('button', { name: 'Save site integrations' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Verified admin access is required.');
  expect(screen.queryByRole('status')).toBeNull();
});

it('surfaces errors when settings cannot be loaded', async () => {
  fetchSettings.mockRejectedValue(new Error('Unable to load site integration settings.'));
  render(<IntegrationSettings />);
  fireEvent.click(screen.getByRole('button', { name: 'Site integrations' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Unable to load site integration settings.');
  expect(screen.queryByRole('button', { name: 'Save site integrations' })).toBeNull();
});
