import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

it('declares Content Signals in every robots.txt user-agent group', () => {
  const robots = readFileSync(resolve('public', 'robots.txt'), 'utf8');
  const groups = robots.split(/\n(?=User-agent:)/).filter(group => group.startsWith('User-agent:'));
  expect(groups.length).toBeGreaterThan(1);
  for (const group of groups) {
    expect(group).toMatch(/^Content-Signal: search=yes, ai-input=yes, ai-train=yes$/m);
    expect(group).toMatch(/^Allow: \/$/m);
  }
  expect(robots).toContain('Sitemap: https://luviacreations.com/sitemap.xml');
});
