export type ProductImagePromptFormat = 'website' | 'pinterest';

export function buildProductImagePrompt(
  style: string,
  format: ProductImagePromptFormat,
  productName?: string,
) {
  if (format === 'pinterest') {
    return [
      'Extend the attached photo vertically to a 2:3 portrait. Continue the background and any existing clothing naturally through the top and bottom of the frame.',
      productName ? `Product variant: ${productName}. Keep this exact variant unchanged.` : '',
      'Keep the original photo, product, any person and pose, colours, stitches and lighting unchanged. Make the entire result one seamless photograph—no horizontal edge, strip, panel or blank area.',
      'If there is an existing Luvia logo on the background, move it onto the bottom-right of the photograph, not into a separate section. Do not duplicate or redesign the logo. If it overlaps the product or person, leave it in place. If there is no logo, do not add one.',
      'Export at least 1000 x 1500 pixels. Do not add new objects, text, borders or logos.',
    ].filter(Boolean).join(' ');
  }

  const prompt = [
    'Using the attached original product photo as the only visual reference, create a realistic product photograph of the same handmade crochet item.',
    productName ? `Product variant: ${productName}.` : '',
    'Preserve its exact shape, colours, stitches, pattern, proportions and visible details. Do not redesign, duplicate, obscure or add parts.',
    style ? `Styling direction: ${style}` : 'Use soft natural light and a warm, uncluttered setting.',
    'Create a square 1:1 image, at least 1024 x 1024 pixels.',
    'No text, logos, watermarks, borders, padding, letterboxing or blank bands.',
  ];
  return prompt.filter(Boolean).join(' ');
}
