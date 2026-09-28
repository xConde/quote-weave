import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { QUOTE_DATA_CONTRACT, QUOTE_MAP_CLUSTER_LABELS, QUOTE_MAP_CONFIG } from './quote-map.config.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const QUOTES_PATH = path.join(ROOT, 'src/assets/data/quotes.json');
const MAP_PATH = path.join(ROOT, 'src/assets/data/quote-map.json');
const TOOLING_PACKAGE_PATH = path.join(ROOT, 'scripts/quote-map-tooling/package.json');
const toolingPackage = JSON.parse(fs.readFileSync(TOOLING_PACKAGE_PATH, 'utf8'));

const QUOTE_ID_PATTERN = new RegExp(QUOTE_DATA_CONTRACT.quoteIdPattern);
const AUTHOR_ID_PATTERN = new RegExp(QUOTE_DATA_CONTRACT.authorIdPattern);
const ATTRIBUTION_STATUSES = new Set(QUOTE_DATA_CONTRACT.attributionStatuses);
const DISALLOWED_SOURCE_HOSTS = new Set(QUOTE_DATA_CONTRACT.disallowedSourceHosts);
const MAP_SCHEMA_VERSION = QUOTE_MAP_CONFIG.schemaVersion;
const SUPPORTED_CLUSTER_COUNT = QUOTE_MAP_CONFIG.clusterCount;
const NEIGHBORS_PER_QUOTE = QUOTE_MAP_CONFIG.neighborsPerQuote;

function canonicalSource(source) {
  if (!source) return null;
  return {
    citation: source.citation,
    ...(source.title !== undefined ? { title: source.title } : {}),
    ...(source.year !== undefined ? { year: source.year } : {}),
    ...(source.url !== undefined ? { url: source.url } : {}),
    ...(source.translator !== undefined ? { translator: source.translator } : {}),
    ...(source.locator !== undefined ? { locator: source.locator } : {}),
    ...(source.note !== undefined ? { note: source.note } : {}),
  };
}

export function canonicalCorpus(quotes) {
  return [...quotes]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(({ id, authorId, text, author, category, attributionStatus, source }) => ({
      id,
      authorId,
      text,
      author,
      category,
      attributionStatus,
      source: canonicalSource(source),
    }));
}

export function calculateCorpusDigest(quotes) {
  const payload = JSON.stringify(canonicalCorpus(quotes));
  return `sha256:${createHash('sha256').update(payload).digest('hex')}`;
}

export function calculateAssetDigest(content) {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateSource(source, label, errors) {
  if (!isRecord(source)) {
    errors.push(`${label}: source must be an object`);
    return;
  }
  if (typeof source.citation !== 'string' || !source.citation.trim()) {
    errors.push(`${label}: source.citation must be non-empty`);
  }
  if (source.title !== undefined && (typeof source.title !== 'string' || !source.title.trim())) {
    errors.push(`${label}: source.title must be a non-empty string when present`);
  }
  if (source.year !== undefined && (!Number.isInteger(source.year) || source.year < 1)) {
    errors.push(`${label}: source.year must be a positive integer when present`);
  }
  if (source.url !== undefined) {
    if (typeof source.url !== 'string') {
      errors.push(`${label}: source.url must be a string when present`);
    } else {
      try {
        const url = new URL(source.url);
        if (url.protocol !== 'https:') errors.push(`${label}: source.url must use HTTPS`);
        if (DISALLOWED_SOURCE_HOSTS.has(url.hostname)) {
          errors.push(`${label}: source.url host ${url.hostname} is parked and must not be linked directly`);
        }
      } catch {
        errors.push(`${label}: source.url must be an absolute URL`);
      }
    }
  }
  for (const field of ['translator', 'locator', 'note']) {
    if (source[field] !== undefined && (typeof source[field] !== 'string' || !source[field].trim())) {
      errors.push(`${label}: source.${field} must be a non-empty string when present`);
    }
  }
}

export function validateQuoteWeaveData(quotes, map) {
  const errors = [];
  if (!Array.isArray(quotes) || quotes.length === 0) return ['quotes.json must be a non-empty array'];
  if (!isRecord(map)) return ['quote-map.json must be an object'];

  const quoteIds = new Set();
  const authorById = new Map();
  const idByAuthor = new Map();
  for (const [index, quote] of quotes.entries()) {
    const label = `quotes[${index}]`;
    if (!isRecord(quote)) {
      errors.push(`${label}: quote must be an object`);
      continue;
    }
    if (typeof quote.id !== 'string' || !QUOTE_ID_PATTERN.test(quote.id)) {
      errors.push(`${label}: id must match ${QUOTE_ID_PATTERN}`);
    } else if (quoteIds.has(quote.id)) {
      errors.push(`${label}: duplicate quote id ${quote.id}`);
    } else {
      quoteIds.add(quote.id);
    }
    if (typeof quote.authorId !== 'string' || !AUTHOR_ID_PATTERN.test(quote.authorId)) {
      errors.push(`${label}: authorId must match ${AUTHOR_ID_PATTERN}`);
    }
    for (const field of ['text', 'author', 'category']) {
      if (typeof quote[field] !== 'string' || !quote[field].trim()) {
        errors.push(`${label}: ${field} must be non-empty`);
      }
    }
    if (!ATTRIBUTION_STATUSES.has(quote.attributionStatus)) {
      errors.push(`${label}: invalid attributionStatus ${String(quote.attributionStatus)}`);
    }
    if ((quote.attributionStatus === 'sourced' || quote.attributionStatus === 'reported') && !quote.source) {
      errors.push(`${label}: ${quote.attributionStatus} quotes require source metadata`);
    }
    if (quote.source !== undefined) validateSource(quote.source, label, errors);

    if (typeof quote.authorId === 'string' && typeof quote.author === 'string') {
      const knownAuthor = authorById.get(quote.authorId);
      if (knownAuthor && knownAuthor !== quote.author) {
        errors.push(`${label}: authorId ${quote.authorId} is also assigned to ${knownAuthor}`);
      }
      const knownId = idByAuthor.get(quote.author);
      if (knownId && knownId !== quote.authorId) {
        errors.push(`${label}: author ${quote.author} is also assigned to ${knownId}`);
      }
      authorById.set(quote.authorId, quote.author);
      idByAuthor.set(quote.author, quote.authorId);
    }
  }

  if (map.schemaVersion !== MAP_SCHEMA_VERSION) {
    errors.push(`quote-map.json: schemaVersion must be ${MAP_SCHEMA_VERSION}`);
  }
  if (map.generatorVersion !== QUOTE_MAP_CONFIG.generatorVersion) {
    errors.push(`quote-map.json: generatorVersion must be ${QUOTE_MAP_CONFIG.generatorVersion}`);
  }
  if (map.seed !== QUOTE_MAP_CONFIG.seed) errors.push(`quote-map.json: seed must be ${QUOTE_MAP_CONFIG.seed}`);
  if (map.model !== QUOTE_MAP_CONFIG.modelId) {
    errors.push(`quote-map.json: model must be ${QUOTE_MAP_CONFIG.modelId}`);
  }
  if (map.modelRevision !== QUOTE_MAP_CONFIG.modelRevision) {
    errors.push(`quote-map.json: modelRevision must be ${QUOTE_MAP_CONFIG.modelRevision}`);
  }
  if (!isRecord(map.tooling)) {
    errors.push('quote-map.json: tooling versions are required');
  } else {
    const expectedToolingEntries = Object.entries(QUOTE_MAP_CONFIG.tooling);
    if (Object.keys(map.tooling).length !== expectedToolingEntries.length) {
      errors.push('quote-map.json: tooling must contain exactly the reviewed dependencies');
    }
    for (const [dependency, expectedVersion] of expectedToolingEntries) {
      if (toolingPackage.dependencies[dependency] !== expectedVersion) {
        errors.push(`quote-map-tooling: ${dependency} must be ${expectedVersion}`);
      }
      if (map.tooling[dependency] !== expectedVersion) {
        errors.push(`quote-map.json: tooling.${dependency} must be ${expectedVersion}`);
      }
    }
  }

  const digest = calculateCorpusDigest(quotes);
  if (map.corpusDigest !== digest) {
    errors.push(`quote-map.json: corpusDigest mismatch (expected ${digest}, received ${String(map.corpusDigest)})`);
  }
  if (
    map.labelReviewCorpusDigest !== digest ||
    map.labelReviewCorpusDigest !== QUOTE_MAP_CONFIG.labelReviewCorpusDigest
  ) {
    errors.push('quote-map.json: handwritten cluster labels have not been reviewed for this corpus digest');
  }

  if (!Array.isArray(map.clusters) || !Number.isInteger(map.clusterCount) || map.clusterCount !== map.clusters.length) {
    errors.push('quote-map.json: clusterCount must match clusters.length');
  }
  if (map.clusterCount !== SUPPORTED_CLUSTER_COUNT) {
    errors.push(`quote-map.json: clusterCount must be ${SUPPORTED_CLUSTER_COUNT}`);
  }
  const clusterIds = new Set();
  if (Array.isArray(map.clusters)) {
    for (const [index, cluster] of map.clusters.entries()) {
      if (!isRecord(cluster) || !Number.isInteger(cluster.id)) {
        errors.push(`clusters[${index}]: id must be an integer`);
        continue;
      }
      if (clusterIds.has(cluster.id)) errors.push(`clusters[${index}]: duplicate id ${cluster.id}`);
      if (cluster.id !== index) errors.push(`clusters[${index}]: id must equal its array index`);
      clusterIds.add(cluster.id);
      if (typeof cluster.label !== 'string' || !cluster.label.trim())
        errors.push(`clusters[${index}]: label is required`);
      if (typeof cluster.blurb !== 'string' || !cluster.blurb.trim())
        errors.push(`clusters[${index}]: blurb is required`);
      if (!Number.isInteger(cluster.count) || cluster.count < 0) errors.push(`clusters[${index}]: count is invalid`);
      const expectedLabel = QUOTE_MAP_CLUSTER_LABELS[index];
      if (expectedLabel && (cluster.label !== expectedLabel.label || cluster.blurb !== expectedLabel.blurb)) {
        errors.push(`clusters[${index}]: label and blurb must match the reviewed quote-map config`);
      }
    }
  }
  const pointIds = new Set();
  const clusterPointCounts = new Map();
  if (!Array.isArray(map.points) || map.points.length !== quotes.length) {
    errors.push('quote-map.json: points must contain exactly one entry per quote');
  } else {
    for (const [index, point] of map.points.entries()) {
      if (!isRecord(point) || typeof point.quoteId !== 'string') {
        errors.push(`points[${index}]: quoteId is required`);
        continue;
      }
      if (!quoteIds.has(point.quoteId)) errors.push(`points[${index}]: unknown quoteId ${point.quoteId}`);
      if (pointIds.has(point.quoteId)) errors.push(`points[${index}]: duplicate quoteId ${point.quoteId}`);
      pointIds.add(point.quoteId);
      if (!Number.isFinite(point.lx) || !Number.isFinite(point.ly)) {
        errors.push(`points[${index}]: coordinates must be finite`);
      }
      if (!Number.isInteger(point.cluster) || !clusterIds.has(point.cluster)) {
        errors.push(`points[${index}]: unknown cluster ${String(point.cluster)}`);
      } else {
        clusterPointCounts.set(point.cluster, (clusterPointCounts.get(point.cluster) ?? 0) + 1);
      }
    }
  }
  for (const quoteId of quoteIds) {
    if (!pointIds.has(quoteId)) errors.push(`quote-map.json: missing point for ${quoteId}`);
  }
  if (Array.isArray(map.clusters)) {
    for (const cluster of map.clusters) {
      if (isRecord(cluster) && Number.isInteger(cluster.id) && cluster.count !== clusterPointCounts.get(cluster.id)) {
        errors.push(`quote-map.json: cluster ${cluster.id} count does not match its points`);
      }
    }
  }

  if (!isRecord(map.neighbors)) {
    errors.push('quote-map.json: neighbors must be keyed by quote ID');
  } else {
    const neighborKeys = new Set(Object.keys(map.neighbors));
    for (const quoteId of quoteIds) {
      const neighbors = map.neighbors[quoteId];
      if (!Array.isArray(neighbors) || neighbors.length !== NEIGHBORS_PER_QUOTE) {
        errors.push(`${quoteId}: expected ${NEIGHBORS_PER_QUOTE} neighbors`);
        continue;
      }
      if (new Set(neighbors).size !== neighbors.length) errors.push(`${quoteId}: neighbors must be unique`);
      if (neighbors.includes(quoteId)) errors.push(`${quoteId}: cannot be its own neighbor`);
      for (const neighborId of neighbors) {
        if (typeof neighborId !== 'string' || !quoteIds.has(neighborId)) {
          errors.push(`${quoteId}: unknown neighbor ${String(neighborId)}`);
        }
      }
      neighborKeys.delete(quoteId);
    }
    for (const extraKey of neighborKeys) errors.push(`quote-map.json: neighbors has unknown key ${extraKey}`);
  }

  return errors;
}

export function readQuoteWeaveData() {
  const mapSource = fs.readFileSync(MAP_PATH);
  return {
    quotes: JSON.parse(fs.readFileSync(QUOTES_PATH, 'utf8')),
    map: JSON.parse(mapSource.toString('utf8')),
    mapAssetDigest: calculateAssetDigest(mapSource),
  };
}

export function runQuoteWeaveDataCheck() {
  const { quotes, map, mapAssetDigest } = readQuoteWeaveData();
  const errors = validateQuoteWeaveData(quotes, map);
  if (mapAssetDigest !== QUOTE_MAP_CONFIG.assetDigest) {
    errors.push(
      `quote-map.json: assetDigest mismatch (expected ${mapAssetDigest}, received ${String(QUOTE_MAP_CONFIG.assetDigest)})`
    );
  }
  assert.equal(errors.length, 0, `Quote Weave data contract failed:\n- ${errors.join('\n- ')}`);
  return { quoteCount: quotes.length, digest: map.corpusDigest, mapAssetDigest };
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  const result = runQuoteWeaveDataCheck();
  console.log(`Quote Weave data contract passed: ${result.quoteCount} quotes, ${result.digest}`);
}
