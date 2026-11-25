export type ProductImagePromptFormat = 'website' | 'pinterest';

export function buildProductImagePrompt(
  style: string,
  format: ProductImagePromptFormat,
  productName?: string,
) {
  const prompt = [
    'Using the attached original product photo as the only visual reference, create a realistic product photograph of the same handmade crochet item.',
    productName ? `Product variant: ${productName}.` : '',
    'Preserve its exact shape, colours, stitches, pattern, proportions and visible details. Do not redesign, duplicate, obscure or add parts.',
    style ? `Styling direction: ${style}` : 'Use soft natural light and a warm, uncluttered setting.',
    format === 'website'
      ? 'Create a square 1:1 image, at least 1024 x 1024 pixels.'
      : 'Create a vertical 2:3 portrait, at least 1000 x 1500 pixels. Fill the frame naturally and keep the whole product clearly visible with balanced breathing room.',
    'No text, logos, watermarks, borders, padding, letterboxing or blank bands.',
  ];
  return prompt.filter(Boolean).join(' ');
}
