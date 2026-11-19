import { expect, it } from 'vitest';
import { packagingSuggestion } from './packagingSuggestions';

it('adds an outer packaging allowance to the largest known dimensions without inventing height',() => {
  expect(packagingSuggestion([{ productName: 'Bunny Toy',quantity: 1 }])).toEqual({ length: 27,breadth: 20,height: 14 });
  expect(packagingSuggestion([{ productName: 'Panda Charm',quantity: 2 }])).toEqual({ length: 16,breadth: 12 });
  expect(packagingSuggestion([{ productName: 'Bunny Toy',quantity: 1 },{ productName: 'Lotus Flower Decor',quantity: 1 }]))
    .toEqual({ length: 27,breadth: 22,height: 14 });
  expect(packagingSuggestion([{ productName: 'Bunny Toy',quantity: 1 },{ productName: 'Panda Charm',quantity: 1 }]))
    .toEqual({ length: 27,breadth: 20 });
  expect(packagingSuggestion([{ productName: 'Bunny Toy',quantity: 1 },{ productName: 'Unknown product',quantity: 1 }])).toBeNull();
});
