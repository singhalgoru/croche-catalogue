type Item = { productName: string; quantity: number };
type Dimensions = { length: number; breadth: number; height?: number };

const sizes: [string[], Dimensions][] = [
  [['Chunky Dumpling Clutch Bag'],{ length: 30,breadth: 22,height: 12 }],
  [['Lotus Flower Decor'],{ length: 20,breadth: 20,height: 5 }],
  [['Red Rose Curtain Tieback'],{ length: 18,breadth: 12,height: 5 }],
  [['Rose Mat/Coaster'],{ length: 18,breadth: 18,height: 4 }],
  [['Tulip Mat/Coaster'],{ length: 16,breadth: 16,height: 3 }],
  [['Crochet Flower Decor','Heart Trinket Dish'],{ length: 14,breadth: 14,height: 5 }],
  [['Rose Gajra','OG Mogra Gajra','Mogra Gajra Bun Accessory'],{ length: 28,breadth: 22,height: 5 }],
  [['Boho braids','Boho braids with Kawri and Ghunghroo'],{ length: 24,breadth: 16,height: 4 }],
  [['Scalloped Headband','Mustard Scalloped Headband'],{ length: 22,breadth: 18,height: 4 }],
  [['Bunny Toy'],{ length: 25,breadth: 18,height: 12 }],
  [['Cute Bunny'],{ length: 22,breadth: 16,height: 11 }],
  [['Bell Anklet','Crochet Bell Anklet — Green','Beaded & Cowrie Shell Anklet','Beaded & Cowrie Shell Anklet Duo',
    'Evil Eye Anklet — Navy & White'],{ length: 10,breadth: 8 }],
  [['Kaudi Anklet','Red Rose Bun pin','Statement Red Rose Bun Clip','Mini Bow Hair Clips',
    'Mini Bow Hair Clips (Set of 4)','Sunflower Brooch'],{ length: 12,breadth: 9 }],
  [['Rose Tassel Hair Clip','Bridal Rose Tassel Hair Clip'],{ length: 20,breadth: 14 }],
  [['Mustard & Pink Ruffle Scrunchie','Lilac Ruffle Scrunchie','Tricolour Ruffle Scrunchie'],{ length: 14,breadth: 10 }],
  [['Watermelon Slice Keychain'],{ length: 13,breadth: 9 }],
  [['Hanging Spider-Man'],{ length: 16,breadth: 11 }],
  [['Panda Charm','Rainbow Charm — Bag, Car & Keychain','Evil Eye Charm (Bag / Key / Car)',
    'Headphone Keychain','Angel Wings','Crescent Moon Keychain','Star Keychain',
    'Onepiece Straw Hat Keychain','Emoji Keychain'],{ length: 14,breadth: 10 }],
  [['Paw Print Charm Collection','Bow Bag Charm'],{ length: 15,breadth: 11 }],
];

export function packagingSuggestion(items: Item[]): Dimensions | null {
  if (!items.length || items.some(item => !Number.isInteger(item.quantity) || item.quantity < 1)) return null;
  const found = items.map(item => {
    const name = item.productName.trim().toLocaleLowerCase('en-IN');
    return sizes.find(([names]) => names.some(value => value.toLocaleLowerCase('en-IN') === name))?.[1];
  });
  if (found.some(value => !value)) return null;
  const dimensions = found.filter((value): value is Dimensions => value !== undefined);
  const height = dimensions.every(value => value.height !== undefined)
    ? Math.max(...dimensions.map(value => value.height ?? 0)) + 2 : undefined;
  return { length: Math.max(...dimensions.map(value => value.length)) + 2,
    breadth: Math.max(...dimensions.map(value => value.breadth)) + 2,...(height === undefined ? {} : { height }) };
}
