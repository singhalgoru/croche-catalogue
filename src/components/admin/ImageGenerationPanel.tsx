import { useEffect, useState } from 'react';
import {
  generateProductImage,
  optimizeProductImagePrompt,
  type ProductImageMode,
} from '../../services/productImageGeneration';

interface Props {
  sourceFile: File;
  sourceUrl: string;
  disabled?: boolean;
  onUseImage: (file: File) => void;
}

const STYLE_SUGGESTIONS = [
  {
    label: 'Warm minimal',
    prompt: 'Use a warm cream palette, soft natural light, and very minimal neutral props.',
  },
  {
    label: 'Gift ready',
    prompt: 'Style it as a thoughtful handmade gift with subtle ribbon and tasteful gift packaging.',
  },
  {
    label: 'Cozy home',
    prompt: 'Place it in a cozy home setting with warm daylight and soft natural textures.',
  },
  {
    label: 'Natural',
    prompt: 'Use an airy botanical setting with light wood and a few subtle green leaves.',
  },
] as const;

const MAX_STYLE_INSTRUCTION_LENGTH = 300;

export default function ImageGenerationPanel({
  sourceFile,
  sourceUrl,
  disabled = false,
  onUseImage,
}: Props) {
  const [generatedFile, setGeneratedFile] = useState<File | null>(null);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<ProductImageMode | null>(null);
  const [isOptimizingPrompt, setIsOptimizingPrompt] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState('');
  const [customInstruction, setCustomInstruction] = useState('');
  const [error, setError] = useState<string | null>(null);
  const styleInstruction = [selectedSuggestion, customInstruction.trim()]
    .filter(Boolean)
    .join(' ');
  const isStyleInstructionTooLong = styleInstruction.length > MAX_STYLE_INSTRUCTION_LENGTH;
  const hasStyleInstruction = styleInstruction.trim().length > 0;

  useEffect(
    () => () => {
      if (generatedUrl) URL.revokeObjectURL(generatedUrl);
    },
    [generatedUrl],
  );

  const generate = async (mode: ProductImageMode) => {
    setActiveMode(mode);
    setError(null);
    if (isStyleInstructionTooLong) {
      setError('Use Gemini to optimize this into a 300-character prompt before generating.');
      setActiveMode(null);
      return;
    }
    try {
      const file = await generateProductImage(sourceFile, mode, styleInstruction);
      if (generatedUrl) URL.revokeObjectURL(generatedUrl);
      setGeneratedFile(file);
      setGeneratedUrl(URL.createObjectURL(file));
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : 'Unable to generate the product image.',
      );
    } finally {
      setActiveMode(null);
    }
  };

  const optimizePrompt = async () => {
    setError(null);
    if (!hasStyleInstruction) {
      setError('Add a rough styling idea before optimizing the prompt.');
      return;
    }
    setIsOptimizingPrompt(true);
    try {
      const prompt = await optimizeProductImagePrompt(styleInstruction);
      setSelectedSuggestion('');
      setCustomInstruction(prompt.slice(0, MAX_STYLE_INSTRUCTION_LENGTH));
    } catch (optimizationError) {
      setError(
        optimizationError instanceof Error
          ? optimizationError.message
          : 'Unable to optimize the image prompt.',
      );
    } finally {
      setIsOptimizingPrompt(false);
    }
  };

  const discard = () => {
    if (generatedUrl) URL.revokeObjectURL(generatedUrl);
    setGeneratedFile(null);
    setGeneratedUrl(null);
    setError(null);
  };

  const useGeneratedImage = () => {
    if (!generatedFile) return;
    onUseImage(generatedFile);
    setGeneratedFile(null);
    setGeneratedUrl(null);
    setError(null);
  };

  return (
    <section className="mt-3 rounded-xl border border-mustard/30 bg-white p-3 sm:col-span-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h5 className="text-sm font-bold text-cocoa">Improve with AI</h5>
          <p className="text-xs text-cocoa/55">
            The original stays unchanged until you approve the result.
          </p>
        </div>
      </div>

      <div className="mt-3">
        <p className="text-xs font-semibold text-cocoa">Style suggestion</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {STYLE_SUGGESTIONS.map((suggestion) => {
            const selected = selectedSuggestion === suggestion.prompt;
            return (
              <button
                key={suggestion.label}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  if (selected) {
                    setSelectedSuggestion('');
                    return;
                  }
                  setSelectedSuggestion(suggestion.prompt);
                }}
                disabled={disabled || activeMode !== null || isOptimizingPrompt}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                  selected
                    ? 'border-cocoa bg-cocoa text-white'
                    : 'border-mustard/60 bg-cream/50 text-cocoa'
                }`}
              >
                {suggestion.label}
              </button>
            );
          })}
        </div>
        <label className="mt-3 block text-xs font-semibold text-cocoa">
          Optional instruction
          <textarea
            value={customInstruction}
            onChange={(event) => setCustomInstruction(event.target.value)}
            rows={2}
            disabled={disabled || activeMode !== null || isOptimizingPrompt}
            placeholder="Example: small wooden basket, soft morning light, premium handmade look"
            className={`mt-1 w-full resize-y rounded-xl border bg-white px-3 py-2 text-sm font-normal ${
              isStyleInstructionTooLong ? 'border-red-300' : 'border-mustard/60'
            }`}
          />
          <span
            className={`mt-1 block text-right font-normal ${
              isStyleInstructionTooLong ? 'text-red-700' : 'text-cocoa/50'
            }`}
          >
            {isStyleInstructionTooLong
              ? `${styleInstruction.length} chars — optimize with Gemini before generating`
              : `${styleInstruction.length}/${MAX_STYLE_INSTRUCTION_LENGTH} ready for generation`}
          </span>
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void optimizePrompt()}
            disabled={
              disabled ||
              activeMode !== null ||
              isOptimizingPrompt ||
              !hasStyleInstruction
            }
            className="rounded-full border border-cocoa/30 px-3 py-1.5 text-xs font-semibold text-cocoa disabled:opacity-50"
          >
            {isOptimizingPrompt ? 'Optimizing prompt…' : 'Optimize prompt with Gemini'}
          </button>
          <button
            type="button"
            onClick={() => void generate('studio')}
            disabled={disabled || activeMode !== null || isOptimizingPrompt || isStyleInstructionTooLong}
            className="rounded-full border-2 border-mustard px-3 py-1.5 text-xs font-semibold text-cocoa disabled:opacity-50"
          >
            {activeMode === 'studio' ? 'Creating studio image…' : 'Create studio image'}
          </button>
          <button
            type="button"
            onClick={() => void generate('lifestyle')}
            disabled={disabled || activeMode !== null || isOptimizingPrompt || isStyleInstructionTooLong}
            className="rounded-full bg-mustard px-3 py-1.5 text-xs font-semibold text-cocoa disabled:opacity-50"
          >
            {activeMode === 'lifestyle' ? 'Creating lifestyle image…' : 'Create lifestyle image'}
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}

      {generatedUrl && generatedFile && (
        <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-3">
          <p className="text-sm font-bold text-green-800">AI image ready for review</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <img
                src={sourceUrl}
                alt="Original product"
                className="aspect-square w-full rounded-lg bg-white object-contain"
              />
              <p className="mt-1 text-center text-xs font-semibold text-cocoa/60">Original</p>
            </div>
            <div>
              <img
                src={generatedUrl}
                alt="AI generated product preview"
                className="aspect-square w-full rounded-lg bg-white object-contain"
              />
              <p className="mt-1 text-center text-xs font-semibold text-green-800">AI result</p>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={useGeneratedImage}
              className="flex-1 rounded-full bg-green-700 px-4 py-2 text-sm font-semibold text-white"
            >
              Use this image
            </button>
            <button
              type="button"
              onClick={discard}
              className="rounded-full border border-cocoa/30 px-4 py-2 text-sm font-semibold text-cocoa"
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
