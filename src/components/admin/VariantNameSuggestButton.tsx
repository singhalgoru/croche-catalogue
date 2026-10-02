import { useState } from 'react';
import { suggestVariantName, type VariantNameSuggestion } from '../../services/productAnalysis';

interface Props {
  getImageFile: () => Promise<File | null> | File | null;
  productName?: string;
  existingVariantNames: string[];
  onSuggest: (suggestion: VariantNameSuggestion) => void;
  disabled?: boolean;
}

export default function VariantNameSuggestButton({
  getImageFile,
  productName,
  existingVariantNames,
  onSuggest,
  disabled = false,
}: Props) {
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const suggest = async () => {
    setIsSuggesting(true);
    setMessage(null);
    try {
      const file = await getImageFile();
      if (!file) {
        setMessage('Add a variant photo first so AI can see the colour or pattern.');
        return;
      }
      const suggestion = await suggestVariantName(file, { productName, existingVariantNames });
      onSuggest(suggestion);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to suggest a variant name.');
    } finally {
      setIsSuggesting(false);
    }
  };

  return (
    <span className="mt-1 block">
      <button
        type="button"
        onClick={() => void suggest()}
        disabled={disabled || isSuggesting}
        className="text-xs font-semibold text-mustard-dark underline disabled:opacity-50"
      >
        {isSuggesting ? 'Suggesting…' : '✨ Suggest name with AI'}
      </button>
      {message && (
        <span role="alert" className="mt-1 block text-xs font-normal text-red-700">
          {message}
        </span>
      )}
    </span>
  );
}
