import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

test('feedback supports anonymous messages and optional reply contact without overflow', async ({ page }) => {
  await installMockSupabase(page);
  const submissions: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/rpc/submit_store_feedback', async route => {
    const body=route.request().postDataJSON();
    submissions.push(body);
    await route.fulfill({json:body.request_id});
  });
  await page.goto('./');
  const footer=page.getByRole('contentinfo');
  await footer.getByRole('button',{name:'Share feedback',exact:true}).click();
  const form=footer.getByRole('form',{name:'Share feedback form'});
  await expect(form.getByLabel('Reply email')).toHaveCount(0);
  await form.getByLabel('Your feedback').fill('Please add more colour options.');
  await form.getByRole('button',{name:'Send feedback'}).click();
  await expect(footer.getByRole('status')).toContainText('queued for feedback@luviacreations.com');
  expect(submissions[0]).toMatchObject({contact_email:'',contact_name:'',wants_reply:false});
  await form.getByLabel("I'd like a reply").check();
  await expect(form.getByLabel('Reply email')).toHaveAttribute('required','');
  await form.getByLabel('Reply email').fill('buyer@example.test');
  await form.getByLabel('Your feedback').fill('Please let me know about new colour options.');
  await form.getByRole('button',{name:'Send feedback'}).click();
  await expect.poll(()=>submissions.length).toBe(2);
  expect(submissions[1]).toMatchObject({contact_email:'buyer@example.test',wants_reply:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
