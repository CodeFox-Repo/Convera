/**
 * Load and memoize a uFuzzy instance with model search settings
 */
export function loadFuzzyInstance() {
  let fuzzy: unknown = null;
  let loaded = false;
  let loadingPromise: Promise<unknown> | null = null;
  const load = async (): Promise<{ search: (haystack: string[], needle: string) => [number[], { idx: number[] }, number[]] }> => {
    if (loaded) return fuzzy as { search: (haystack: string[], needle: string) => [number[], { idx: number[] }, number[]] };
    if (loadingPromise) return loadingPromise as Promise<{ search: (haystack: string[], needle: string) => [number[], { idx: number[] }, number[]] }>;
    
    loadingPromise = (async () => {
      const module = await import('@leeoniya/ufuzzy');
      const uFuzzy = module.default;
      fuzzy = new uFuzzy({
        intraMode: 1,
        intraIns: 1,
        intraSub: 1,
        intraTrn: 1,
        intraDel: 1,
        interLft: 1,
        interRgt: 0,
        intraChars: "[w-.]",
        interChars: "[s-_.//]",
      });
      loaded = true;
      return fuzzy as { search: (haystack: string[], needle: string) => [number[], { idx: number[] }, number[]] };
    })();
    
    return loadingPromise as Promise<{ search: (haystack: string[], needle: string) => [number[], { idx: number[] }, number[]] }>;
  };
  return { load };
}

/**
 * Perform fuzzy and fallback search for a string array
 */
export async function searchModels(
  input: string,
  items: string[],
  setResult: (models: string[]) => void,
  fuzzyInstance: { load: () => Promise<{ search: (haystack: string[], needle: string) => [number[], { idx: number[] }, number[]] }> }
) {
  const normalizedInput = input.toLowerCase();
  if (!normalizedInput.trim()) {
    setResult(items);
    return;
  }
  try {
    const fuzzy = await fuzzyInstance.load();
    const result: [number[], { idx: number[] }, number[]] = fuzzy.search(items, normalizedInput);
    if (result && result.length > 0) {
      const info = result[1];
      const order = result[2];
      if (info && order && info.idx) {
        const matches = order.map((i: number) => items[info.idx[i]]);
        if (matches.length > 0) {
          setResult(matches);
          return;
        }
      }
    }
    fallbackSearch(normalizedInput, items, setResult);
  } catch {
    fallbackSearch(normalizedInput, items, setResult);
  }
}

/**
 * Fallback search: prefix, substring, and normalized (remove separators) matching
 */
export function fallbackSearch(
  input: string,
  items: string[],
  setResult: (models: string[]) => void
) {
  const prefixMatches = items.filter(item => {
    const words = item.toLowerCase().split(/[\s\-_./]+/);
    return words.some(word => word.startsWith(input));
  });
  if (prefixMatches.length > 0) {
    setResult(prefixMatches);
    return;
  }
  const substringMatches = items.filter(item => item.toLowerCase().includes(input));
  if (substringMatches.length > 0) {
    setResult(substringMatches);
    return;
  }
  const normalize = (str: string) => str.replace(/[\s\-_./]/g, "");
  const normalizedInputNoSep = normalize(input);
  const noSepMatches = items.filter(item => normalize(item.toLowerCase()).includes(normalizedInputNoSep));
  setResult(noSepMatches);
} 