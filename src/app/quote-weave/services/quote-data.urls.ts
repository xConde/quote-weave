import quoteWeaveContract from '../../../assets/data/quote-weave-contract.json';

const SHA256_PREFIX = 'sha256:';

// These JSON files keep stable filenames, so version each request URL. A
// returning browser must not pair stale data with the runtime validator.
export function buildQuoteDataUrls(
  quoteCorpusDigest: string,
  quoteMapAssetDigest: string
): Readonly<{ quotesUrl: string; mapUrl: string }> {
  const quoteVersion = quoteCorpusDigest.slice(SHA256_PREFIX.length);
  const mapVersion = quoteMapAssetDigest.slice(SHA256_PREFIX.length);

  return {
    quotesUrl: `assets/data/quotes.json?v=${quoteVersion}`,
    mapUrl: `assets/data/quote-map.json?v=${mapVersion}`,
  } as const;
}

export const QUOTE_WEAVE_DATA_VERSION = quoteWeaveContract.map.labelReviewCorpusDigest.slice(SHA256_PREFIX.length);
export const QUOTE_MAP_DATA_VERSION = quoteWeaveContract.map.assetDigest.slice(SHA256_PREFIX.length);
const quoteDataUrls = buildQuoteDataUrls(
  quoteWeaveContract.map.labelReviewCorpusDigest,
  quoteWeaveContract.map.assetDigest
);
export const QUOTES_DATA_URL = quoteDataUrls.quotesUrl;
export const QUOTE_MAP_DATA_URL = quoteDataUrls.mapUrl;
