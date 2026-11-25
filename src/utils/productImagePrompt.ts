export type ProductImagePromptFormat = 'website' | 'pinterest';

export function buildProductImagePrompt(
  style: string,
  format: ProductImagePromptFormat,
  productName?: string,
) {
  if (format === 'pinterest') {
    return [
      'Use the attached original photo itself as the source image, not merely as a visual reference. This is a canvas-expansion edit only, not a request to create a new product photograph.',
      productName ? `Product variant: ${productName}. Keep this exact variant unchanged.` : '',
      'Keep the entire original photo unchanged, including the product, person or model, pose, colours, stitches, pattern, proportions, lighting and background, except for moving an existing Luvia watermark as described below. Do not regenerate, redraw, retouch, recolour, crop, rotate, stretch, replace or rearrange the photo content.',
      'Expand the canvas vertically to a 2:3 portrait by adding space above and below the original photo. Outpaint only those newly added areas, seamlessly continuing the existing background and lighting. Keep the whole original photo visible; do not create a new angle, scene, product or props.',
      'If the original has a Luvia watermark on the background, move that same watermark to the bottom-right corner of the final portrait, with a small margin. Preserve its exact design, size and opacity; do not redraw it or leave a duplicate in its old position. Restore only the background at its old position. If the watermark overlaps the product or person, leave it unchanged instead of altering them. If there is no watermark, do not add one. Preserve any other existing text or marks.',
      'Output at least 1000 x 1500 pixels; proportional upscaling is allowed if needed. Do not add borders, padding, letterboxing, blank bands or new text or logos.',
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
