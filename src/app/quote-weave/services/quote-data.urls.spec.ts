import quoteWeaveContract from '../../../assets/data/quote-weave-contract.json';
import {
  buildQuoteDataUrls,
  QUOTE_MAP_DATA_URL,
  QUOTE_MAP_DATA_VERSION,
  QUOTE_WEAVE_DATA_VERSION,
  QUOTES_DATA_URL,
} from './quote-data.urls';

describe('Quote Weave data URLs', () => {
  it('versions each immutable asset URL from its matching content digest', () => {
    expect(QUOTE_WEAVE_DATA_VERSION).toBe(quoteWeaveContract.map.labelReviewCorpusDigest.slice('sha256:'.length));
    expect(QUOTE_MAP_DATA_VERSION).toBe(quoteWeaveContract.map.assetDigest.slice('sha256:'.length));
    expect(QUOTE_WEAVE_DATA_VERSION).toMatch(/^[a-f0-9]{64}$/);
    expect(QUOTE_MAP_DATA_VERSION).toMatch(/^[a-f0-9]{64}$/);
    expect(QUOTES_DATA_URL).toBe(`assets/data/quotes.json?v=${QUOTE_WEAVE_DATA_VERSION}`);
    expect(QUOTE_MAP_DATA_URL).toBe(`assets/data/quote-map.json?v=${QUOTE_MAP_DATA_VERSION}`);
  });

  it('changes only the map request URL for a map-only revision', () => {
    const baseline = buildQuoteDataUrls(`sha256:${'a'.repeat(64)}`, `sha256:${'b'.repeat(64)}`);
    const mapOnlyRevision = buildQuoteDataUrls(`sha256:${'a'.repeat(64)}`, `sha256:${'c'.repeat(64)}`);

    expect(mapOnlyRevision.quotesUrl).toBe(baseline.quotesUrl);
    expect(mapOnlyRevision.mapUrl).not.toBe(baseline.mapUrl);
  });
});
