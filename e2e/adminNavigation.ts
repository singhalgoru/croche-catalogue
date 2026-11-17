import type { Page } from '@playwright/test';

export async function goToAdminSection(page: Page, section: string): Promise<void> {
  const picker = page.getByRole('combobox', { name: 'Jump to admin section' });
  if ((page.viewportSize()?.width ?? 1024) < 640) {
    await picker.selectOption(section);
    return;
  }
  await page.getByRole('button', { name: section, exact: true }).click();
}
