/**
 * generate-quote-map.mjs — build the quote-weave "Idea Map".
 *
 * Build-time only (never runs in the browser or CI). Embeds every quote with a
 * sentence-transformer, reduces the 384-dim vectors to 2D with UMAP, clusters
 * them with k-means, and computes each quote's nearest semantic neighbors. The
 * output (src/assets/data/quote-map.json) is committed and shipped; the model
 * and these deps stay out of the bundle entirely.
 *
 * Run (the isolated lockfile keeps these heavy build-only dependencies out of
 * normal app installs while making regeneration repeatable):
 *   npm --prefix scripts/quote-map-tooling ci
 *   npm --prefix scripts/quote-map-tooling run generate
 *
 * Cluster THEME LABELS are authored by hand after inspecting each cluster's
 * members (see CLUSTER_LABELS below) — they are editorial groupings, not
 * claimed as algorithmic output.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { QUOTE_MAP_CLUSTER_LABELS, QUOTE_MAP_CONFIG } from './quote-map.config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QUOTES_PATH = path.join(ROOT, 'src/assets/data/quotes.json');
const OUT_PATH = path.join(ROOT, 'src/assets/data/quote-map.json');
const TOOLING_PACKAGE_PATH = path.join(ROOT, 'scripts/quote-map-tooling/package.json');
const toolingPackage = JSON.parse(fs.readFileSync(TOOLING_PACKAGE_PATH, 'utf8'));
const toolingRequire = createRequire(TOOLING_PACKAGE_PATH);

const {
  clusterCount: CLUSTER_COUNT,
  neighborsPerQuote: NEIGHBORS_PER_QUOTE,
  seed: SEED,
  schemaVersion: SCHEMA_VERSION,
  generatorVersion: GENERATOR_VERSION,
  modelId: MODEL_ID,
  modelRevision: MODEL_REVISION,
  labelReviewCorpusDigest: LABEL_REVIEW_CORPUS_DIGEST,
} = QUOTE_MAP_CONFIG;

for (const [dependency, expectedVersion] of Object.entries(QUOTE_MAP_CONFIG.tooling)) {
  assert.equal(
    toolingPackage.dependencies[dependency],
    expectedVersion,
    `scripts/quote-map-tooling/package.json must pin ${dependency} to ${expectedVersion}`
  );
}

/**
 * Human theme labels, authored after inspecting each cluster's members (the
 * script prints them). Index = cluster id from the deterministic k-means.
 * Re-derive these if SEED, CLUSTER_COUNT, or the corpus changes.
 */
const CLUSTER_LABELS = QUOTE_MAP_CLUSTER_LABELS;

async function loadPinnedTooling() {
  const transformersEntry = toolingRequire.resolve('@xenova/transformers');
  const transformers = await import(pathToFileURL(transformersEntry).href);
  const { UMAP } = toolingRequire('umap-js');
  return { pipeline: transformers.pipeline, UMAP };
}

// Mulberry32 — deterministic PRNG so the map is reproducible across runs.
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cosine(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

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

function canonicalCorpus(quotes) {
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

function corpusDigest(quotes) {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(canonicalCorpus(quotes)))
    .digest('hex')}`;
}

function kmeans(vecs, k, rand, iterations = 50) {
  const dim = vecs[0].length;
  // k-means++ style seeding for stable clusters
  const centroids = [vecs[Math.floor(rand() * vecs.length)].slice()];
  while (centroids.length < k) {
    const d2 = vecs.map((v) => Math.min(...centroids.map((c) => 1 - cosine(v, c))));
    const sum = d2.reduce((a, b) => a + b, 0);
    let r = rand() * sum;
    let idx = 0;
    while (r > 0 && idx < d2.length - 1) r -= d2[idx++];
    centroids.push(vecs[idx].slice());
  }
  let assign = new Array(vecs.length).fill(0);
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (let i = 0; i < vecs.length; i++) {
      let best = 0;
      let bestSim = -Infinity;
      for (let c = 0; c < k; c++) {
        const sim = cosine(vecs[i], centroids[c]);
        if (sim > bestSim) {
          bestSim = sim;
          best = c;
        }
      }
      if (assign[i] !== best) {
        assign[i] = best;
        moved = true;
      }
    }
    for (let c = 0; c < k; c++) {
      const members = vecs.filter((_, i) => assign[i] === c);
      if (!members.length) continue;
      const mean = new Array(dim).fill(0);
      for (const m of members) for (let d = 0; d < dim; d++) mean[d] += m[d];
      let norm = 0;
      for (let d = 0; d < dim; d++) {
        mean[d] /= members.length;
        norm += mean[d] * mean[d];
      }
      norm = Math.sqrt(norm) || 1;
      for (let d = 0; d < dim; d++) mean[d] /= norm;
      centroids[c] = mean;
    }
    if (!moved) break;
  }
  return assign;
}

async function main() {
  const quotes = JSON.parse(fs.readFileSync(QUOTES_PATH, 'utf8'));
  const digest = corpusDigest(quotes);
  console.log(`Loaded ${quotes.length} quotes. Loading embedding model…`);
  const { pipeline, UMAP } = await loadPinnedTooling();
  const extract = await pipeline('feature-extraction', MODEL_ID, { revision: MODEL_REVISION });

  const embeddings = [];
  for (let i = 0; i < quotes.length; i++) {
    const out = await extract(quotes[i].text, { pooling: 'mean', normalize: true });
    embeddings.push(Array.from(out.data));
    if ((i + 1) % 40 === 0) console.log(`  embedded ${i + 1}/${quotes.length}`);
  }

  console.log('Reducing to 2D with UMAP…');
  const umap = new UMAP({ nComponents: 2, nNeighbors: 10, minDist: 0.4, spread: 1.4, random: mulberry32(SEED) });
  const rawCoords = umap.fit(embeddings);

  // Per-cluster LOCAL layout only. The renderer owns the frame composition
  // (it places each theme's territory to fill the canvas and tessellates them
  // with a Voronoi partition, adapting to the live aspect ratio). Here we just
  // emit each quote's position *within its own theme* — its intra-cluster UMAP
  // structure, recentered to the cluster origin and normalized to a unit disk
  // (95th-percentile radius so one outlier can't shrink the whole cloud). So
  // "nearby quotes share ideas" stays true inside every territory.
  const assign = kmeans(embeddings, CLUSTER_COUNT, mulberry32(SEED));
  const local = new Array(rawCoords.length);
  for (let c = 0; c < CLUSTER_COUNT; c++) {
    const idxs = rawCoords.map((_, i) => i).filter((i) => assign[i] === c);
    const cx = idxs.reduce((s, i) => s + rawCoords[i][0], 0) / idxs.length;
    const cy = idxs.reduce((s, i) => s + rawCoords[i][1], 0) / idxs.length;
    const dists = idxs.map((i) => Math.hypot(rawCoords[i][0] - cx, rawCoords[i][1] - cy)).sort((a, b) => a - b);
    const normR = dists[Math.floor(dists.length * 0.95)] || dists[dists.length - 1] || 1;
    for (const i of idxs) {
      local[i] = [(rawCoords[i][0] - cx) / normR, (rawCoords[i][1] - cy) / normR];
    }
  }

  console.log('Computing nearest semantic neighbors…');
  const neighbors = Object.fromEntries(
    embeddings.map((v, i) => [
      quotes[i].id,
      embeddings
        .map((w, j) => [j, cosine(v, w)])
        .filter(([j]) => j !== i)
        .sort((a, b) => b[1] - a[1])
        .slice(0, NEIGHBORS_PER_QUOTE)
        .map(([j]) => quotes[j].id),
    ])
  );

  // Print each cluster's members so the labels in CLUSTER_LABELS can be authored.
  for (let c = 0; c < CLUSTER_COUNT; c++) {
    const members = quotes.filter((_, i) => assign[i] === c);
    console.log(`\n— cluster ${c} (${members.length}) —`);
    for (const m of members) console.log(`   "${m.text.slice(0, 60)}" — ${m.author}`);
  }
  assert.equal(
    digest,
    LABEL_REVIEW_CORPUS_DIGEST,
    'Cluster membership is printed above. Review every cluster, then update map.labelReviewCorpusDigest in quote-weave-contract.json and rerun.'
  );

  const points = quotes.map((quote, i) => ({
    quoteId: quote.id,
    lx: Number(local[i][0].toFixed(4)),
    ly: Number(local[i][1].toFixed(4)),
    cluster: assign[i],
  }));

  const clusters = CLUSTER_LABELS.map((c, id) => ({
    id,
    label: c.label,
    blurb: c.blurb,
    count: assign.filter((a) => a === id).length,
  }));

  const map = {
    schemaVersion: SCHEMA_VERSION,
    generatorVersion: GENERATOR_VERSION,
    seed: SEED,
    corpusDigest: digest,
    labelReviewCorpusDigest: LABEL_REVIEW_CORPUS_DIGEST,
    generatedBy: 'scripts/generate-quote-map.mjs (Transformers.js + UMAP)',
    model: MODEL_ID,
    modelRevision: MODEL_REVISION,
    tooling: QUOTE_MAP_CONFIG.tooling,
    clusterCount: CLUSTER_COUNT,
    clusters,
    points,
    neighbors,
  };
  const mapSource = `${JSON.stringify(map, null, 2)}\n`;
  const assetDigest = `sha256:${createHash('sha256').update(mapSource).digest('hex')}`;
  fs.writeFileSync(OUT_PATH, mapSource);
  console.log(`\nWrote ${OUT_PATH} (${(fs.statSync(OUT_PATH).size / 1024).toFixed(1)} KB)`);
  console.log('Now review the shared contract labels against the cluster dumps above.');
  console.log(`Then set map.assetDigest in quote-weave-contract.json to ${assetDigest}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
