import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const CONTRACT_PATH = path.resolve(SCRIPT_DIR, '../src/assets/data/quote-weave-contract.json');
const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));

/**
 * Browser and Node tooling both consume quote-weave-contract.json. Keep this
 * module as the Node-friendly adapter so generation, CI validation, and the
 * shipped reader cannot develop separate schema/version constants.
 */
export const QUOTE_DATA_CONTRACT = Object.freeze({
  quoteIdPattern: contract.quoteIdPattern,
  authorIdPattern: contract.authorIdPattern,
  attributionStatuses: Object.freeze([...contract.attributionStatuses]),
  disallowedSourceHosts: Object.freeze([...contract.disallowedSourceHosts]),
});

export const QUOTE_MAP_CONFIG = Object.freeze({
  schemaVersion: contract.map.schemaVersion,
  generatorVersion: contract.map.generatorVersion,
  clusterCount: contract.map.clusterCount,
  neighborsPerQuote: contract.map.neighborsPerQuote,
  seed: contract.map.seed,
  modelId: contract.map.modelId,
  modelRevision: contract.map.modelRevision,
  tooling: Object.freeze({ ...contract.map.tooling }),
  // Content-addresses the complete generated map so map-only changes cannot
  // reuse an immutable browser/Cloudflare cache entry.
  assetDigest: contract.map.assetDigest,
  // Updated only after the generated clusters have been inspected and the
  // handwritten labels in the shared contract still describe their members.
  labelReviewCorpusDigest: contract.map.labelReviewCorpusDigest,
});

export const QUOTE_MAP_CLUSTER_LABELS = Object.freeze(
  contract.map.clusterLabels.map((cluster) => Object.freeze({ ...cluster }))
);
