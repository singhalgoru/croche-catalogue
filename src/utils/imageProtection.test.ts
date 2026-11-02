// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { installMediaProtection } from './imageProtection';

let uninstall = () => {};
afterEach(() => {
  uninstall();
  document.body.innerHTML = '';
});

const dispatch = (target: Element, type: string) =>
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));

it('blocks right-click and drag on every image and video, including ones added later', () => {
  uninstall = installMediaProtection();
  document.body.innerHTML = '<img id="photo" alt=""><video id="clip"></video><p id="text">Text</p>';
  const late = document.createElement('img');
  document.body.append(late);
  for (const element of [document.getElementById('photo')!, document.getElementById('clip')!, late]) {
    expect(dispatch(element, 'contextmenu')).toBe(false);
    expect(dispatch(element, 'dragstart')).toBe(false);
  }
  expect(dispatch(document.getElementById('text')!, 'contextmenu')).toBe(true);
});

it('can be explicitly opted out and uninstalled', () => {
  uninstall = installMediaProtection();
  document.body.innerHTML = '<div data-allow-media-save><img id="allowed" alt=""></div><img id="blocked" alt="">';
  expect(dispatch(document.getElementById('allowed')!, 'contextmenu')).toBe(true);
  uninstall();
  expect(dispatch(document.getElementById('blocked')!, 'contextmenu')).toBe(true);
});
