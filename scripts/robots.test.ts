import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

it('declares Content Signals in every robots.txt user-agent group', () => {
  const robots = readFileSync(resolve('public', 'robots.txt'), 'utf8');
  const groups = robots.split(/\n(?=User-agent:)/).filter(group => group.startsWith('User-agent:'));
  expect(groups.length).toBeGreaterThan(1);
  for (const group of groups) {
    expect(group).toMatch(/^Content-Signal: search=yes, ai-input=yes, ai-train=no$/m);
  }
  for (const agent of ['GPTBot', 'ClaudeBot', 'Google-Extended', 'Applebot-Extended']) {
    const group = groups.find(value => value.startsWith(`User-agent: ${agent}\n`));
    expect(group).toMatch(/^Disallow: \/$/m);
  }
  for (const agent of ['*', 'CCBot', 'OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'Bingbot']) {
    const group = groups.find(value => value.startsWith(`User-agent: ${agent}\n`));
    expect(group).toMatch(/^Allow: \/$/m);
    for (const parameter of ['checkout', 'account', 'watch']) {
      expect(group).toContain(`Disallow: /*?${parameter}=`);
      expect(group).toContain(`Disallow: /*?*&${parameter}=`);
    }
  }
  expect(robots).toContain('Sitemap: https://luviacreations.com/sitemap.xml');
});
