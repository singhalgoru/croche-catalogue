import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it } from 'vitest';
import DateInput from './DateInput';
import { formatDate, isValidDate, parseDateInput } from '../../utils/date';

afterEach(cleanup);

it('displays day/month/year, preserves partial entry and validates calendar dates', () => {
  function Example() {
    const [value, setValue] = useState('2026-10-08');
    return <><DateInput aria-label="Date" value={value} onChange={setValue} required /><output>{value}</output></>;
  }
  render(<Example />);
  const input = screen.getByLabelText('Date') as HTMLInputElement;
  expect(input.value).toBe('08/10/2026');
  fireEvent.change(input, { target: { value: '09/10/' } });
  expect(input.value).toBe('09/10/');
  expect(input.checkValidity()).toBe(false);
  fireEvent.change(input, { target: { value: '31/02/2026' } });
  expect(input.checkValidity()).toBe(false);
  fireEvent.change(input, { target: { value: '29/02/2028' } });
  expect(input.checkValidity()).toBe(true);
  expect(screen.getByText('2028-02-29')).toBeTruthy();
  expect(formatDate('2026-01-02')).toBe('02/01/2026');
  expect(isValidDate('2026-02-29')).toBe(false);
});

it.each([
  ['2026-10-08', '08/10/2026'],
  ['2026-01-12', '12/01/2026'],
  ['2026-10-25', '25/10/2026'],
  ['2028-02-29', '29/02/2028'],
])('preserves the stored calendar date %s when changing display format', (stored, displayed) => {
  render(<DateInput aria-label="Existing date" value={stored} onChange={() => {}} required />);
  expect(screen.getByLabelText('Existing date')).toHaveProperty('value', displayed);
  expect(parseDateInput(displayed)).toBe(stored);
  expect(isValidDate(stored)).toBe(true);
});
