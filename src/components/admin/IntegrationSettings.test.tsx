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
  fetchSettings.mockResolvedValue(initial);
  saveSettings.mockImplementation(async value => value);
});
afterEach(cleanup);

it('loads the editable public integration settings and saves changes', async () => {
  render(<IntegrationSettings />);
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
});

it('shows save failures and does not report success', async () => {
  saveSettings.mockRejectedValue(new Error('Verified admin access is required.'));
  render(<IntegrationSettings />);
  await screen.findByDisplayValue(initial.metaPixelId);
  fireEvent.click(screen.getByRole('button', { name: 'Save site integrations' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Verified admin access is required.');
  expect(screen.queryByRole('status')).toBeNull();
});

it('surfaces errors when settings cannot be loaded', async () => {
  fetchSettings.mockRejectedValue(new Error('Unable to load site integration settings.'));
  render(<IntegrationSettings />);
  expect((await screen.findByRole('alert')).textContent).toContain('Unable to load site integration settings.');
  expect(screen.queryByRole('button', { name: 'Save site integrations' })).toBeNull();
});
