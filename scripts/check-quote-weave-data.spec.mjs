import assert from 'node:assert/strict';
import {
  calculateAssetDigest,
  calculateCorpusDigest,
  readQuoteWeaveData,
  runQuoteWeaveDataCheck,
  validateQuoteWeaveData,
} from './check-quote-weave-data.mjs';
import { curateQuoteRecords } from './curate-quote-weave-sources.mjs';
import { QUOTE_MAP_CONFIG } from './quote-map.config.mjs';

const clone = (value) => JSON.parse(JSON.stringify(value));
const { quotes, map, mapAssetDigest } = readQuoteWeaveData();

const result = runQuoteWeaveDataCheck();
assert.equal(result.quoteCount, 30);
assert.equal(
  quotes.filter((quote) => quote.attributionStatus === 'unverified').length,
  0,
  'The published collection must not contain unverified attributions'
);
assert.ok(
  quotes.every((quote) => quote.source?.url),
  'Every published quote must link to its source record'
);
assert.ok(
  quotes.every((quote) => new URL(quote.source.url).hostname !== 'the.hitchcock.zone'),
  'The parked Hitchcock domain must never be linked directly'
);
const byQuoteId = new Map(quotes.map((quote) => [quote.id, quote]));
assert.equal(byQuoteId.get('quote-2a687efa').source.year, 1869, 'Little Women Part II must use its 1869 date');
assert.equal(
  byQuoteId.get('quote-c7c1c1e3').text,
  'Beware; for I am fearless, and therefore powerful.',
  'The Mary Shelley line must preserve the source punctuation'
);
assert.equal(byQuoteId.get('quote-269f99bb').author, 'René Descartes');
assert.equal(
  new URL(byQuoteId.get('quote-1e09324').source.url).hostname,
  'web.archive.org',
  'The Hitchcock citation must use the preserved transcript'
);
assert.equal(map.modelRevision, QUOTE_MAP_CONFIG.modelRevision);
assert.equal(map.labelReviewCorpusDigest, map.corpusDigest);
assert.equal(mapAssetDigest, QUOTE_MAP_CONFIG.assetDigest);
assert.deepEqual(curateQuoteRecords(quotes), quotes, 'The curation pass must be idempotent on the canonical corpus');

const mapOnlyMutation = clone(map);
mapOnlyMutation.points[0].lx += 0.000001;
assert.notEqual(
  calculateAssetDigest(JSON.stringify(mapOnlyMutation)),
  calculateAssetDigest(JSON.stringify(map)),
  'A map-only content change must produce a distinct asset digest'
);

const identityMutation = clone(quotes);
identityMutation[0].text += ' silently changed';
assert.throws(
  () => curateQuoteRecords(identityMutation),
  /canonical text mismatch/,
  'The curation pass must refuse to attach approved sources to changed quote text'
);

const reordered = [...quotes].reverse();
assert.equal(calculateCorpusDigest(reordered), calculateCorpusDigest(quotes));
assert.deepEqual(validateQuoteWeaveData(reordered, map), []);

const editedQuotes = clone(quotes);
editedQuotes[0].text += ' changed';
assert.ok(validateQuoteWeaveData(editedQuotes, map).some((error) => error.includes('corpusDigest mismatch')));

const parkedSource = clone(quotes);
parkedSource.find((quote) => quote.id === 'quote-1e09324').source.url =
  'https://the.hitchcock.zone/wiki/Picture_Parade';
assert.ok(
  validateQuoteWeaveData(parkedSource, map).some((error) => error.includes('is parked and must not be linked directly'))
);

const invalidMap = clone(map);
invalidMap.points[0].quoteId = 'quote-deadbeef';
assert.ok(validateQuoteWeaveData(quotes, invalidMap).some((error) => error.includes('unknown quoteId quote-deadbeef')));

const staleLabelReview = clone(map);
staleLabelReview.labelReviewCorpusDigest = 'sha256:stale';
assert.ok(
  validateQuoteWeaveData(quotes, staleLabelReview).some((error) =>
    error.includes('handwritten cluster labels have not been reviewed')
  )
);

const toolingDrift = clone(map);
toolingDrift.tooling['umap-js'] = '0.0.0';
assert.ok(
  validateQuoteWeaveData(quotes, toolingDrift).some((error) => error.includes('tooling.umap-js must be 1.4.0'))
);

const extraTooling = clone(map);
extraTooling.tooling['unreviewed-package'] = '1.0.0';
assert.ok(
  validateQuoteWeaveData(quotes, extraTooling).some((error) =>
    error.includes('tooling must contain exactly the reviewed dependencies')
  )
);

const unsupportedClusters = clone(map);
unsupportedClusters.clusterCount = 3;
unsupportedClusters.clusters.pop();
assert.ok(
  validateQuoteWeaveData(quotes, unsupportedClusters).some((error) => error.includes('clusterCount must be 4'))
);

const nonContiguousClusters = clone(map);
nonContiguousClusters.clusters[3].id = 4;
assert.ok(
  validateQuoteWeaveData(quotes, nonContiguousClusters).some((error) =>
    error.includes('clusters[3]: id must equal its array index')
  )
);

console.log('Quote Weave data verifier tests passed');
