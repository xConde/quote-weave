/**
 * One-time, stable-ID curation pass for Quote Weave.
 *
 * Unlike the retired index-based generator, this script can only update the
 * exact quote IDs listed below. It fails if an ID is missing, then writes the
 * smaller source-audited collection in this editorial order.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const QUOTES_PATH = path.join(ROOT, 'src/assets/data/quotes.json');

const CANONICAL_IDENTITIES = {
  'quote-cb2bf7e1': {
    text: 'We suffer more often in imagination than in reality.',
    authorId: 'author-seneca',
    author: 'Seneca',
    category: 'Stoicism',
  },
  'quote-f37e164e': {
    text: 'It is not that we have a short space of time, but that we waste much of it.',
    authorId: 'author-seneca',
    author: 'Seneca',
    category: 'Stoicism',
  },
  'quote-467a31c3': {
    text: 'First say to yourself what you would be, and then do what you have to do.',
    authorId: 'author-epictetus',
    author: 'Epictetus',
    category: 'Stoicism',
  },
  'quote-6f10f6d5': {
    text: 'It is difficulties that show what men are.',
    authorId: 'author-epictetus',
    author: 'Epictetus',
    category: 'Stoicism',
  },
  'quote-bcea54b4': {
    text: 'Make the best use of what is in your power, and take the rest as it happens.',
    authorId: 'author-epictetus',
    author: 'Epictetus',
    category: 'Stoicism',
  },
  'quote-11ae8231': {
    text: 'Lead me, Zeus, and you too, Destiny, wherever your decrees have assigned me.',
    authorId: 'author-cleanthes',
    author: 'Cleanthes',
    category: 'Stoicism',
  },
  'quote-dd26a88c': {
    text: 'We have two ears and one mouth, so we should listen more than we speak.',
    authorId: 'author-zeno-of-citium',
    author: 'Zeno of Citium',
    category: 'Stoicism',
  },
  'quote-c01bdab3': {
    text: 'Simplicity is prerequisite for reliability.',
    authorId: 'author-edsger-dijkstra',
    author: 'Edsger Dijkstra',
    category: 'Programming',
  },
  'quote-129ebc70': {
    text: 'The art of programming is the art of organizing complexity.',
    authorId: 'author-edsger-dijkstra',
    author: 'Edsger Dijkstra',
    category: 'Programming',
  },
  'quote-2063a22c': {
    text: 'We should forget about small efficiencies, say about 97% of the time: premature optimization is the root of all evil.',
    authorId: 'author-donald-knuth',
    author: 'Donald Knuth',
    category: 'Programming',
  },
  'quote-96ad11f4': {
    text: 'The Analytical Engine weaves algebraical patterns just as the Jacquard-loom weaves flowers and leaves.',
    authorId: 'author-ada-lovelace',
    author: 'Ada Lovelace',
    category: 'Programming',
  },
  'quote-e7d87672': {
    text: 'Programs must be written for people to read, and only incidentally for machines to execute.',
    authorId: 'author-harold-abelson-and-gerald-jay-sussman',
    author: 'Harold Abelson and Gerald Jay Sussman',
    category: 'Programming',
  },
  'quote-8e1b85c5': {
    text: 'Talk is cheap. Show me the code.',
    authorId: 'author-linus-torvalds',
    author: 'Linus Torvalds',
    category: 'Programming',
  },
  'quote-3d8b75e4': {
    text: "A language that doesn't affect the way you think about programming is not worth knowing.",
    authorId: 'author-alan-perlis',
    author: 'Alan Perlis',
    category: 'Programming',
  },
  'quote-1f0ee81c': {
    text: 'The unexamined life is not worth living.',
    authorId: 'author-socrates',
    author: 'Socrates',
    category: 'Philosophy',
  },
  'quote-269f99bb': {
    text: 'I think, therefore I am.',
    authorId: 'author-rene-descartes',
    author: 'René Descartes',
    category: 'Philosophy',
  },
  'quote-c0bfa9b6': {
    text: 'Act only according to that maxim whereby you can will that it should become a universal law.',
    authorId: 'author-immanuel-kant',
    author: 'Immanuel Kant',
    category: 'Philosophy',
  },
  'quote-b02d6af3': {
    text: 'Whereof one cannot speak, thereof one must be silent.',
    authorId: 'author-ludwig-wittgenstein',
    author: 'Ludwig Wittgenstein',
    category: 'Philosophy',
  },
  'quote-2a687efa': {
    text: "I'm not afraid of storms, for I'm learning how to sail my ship.",
    authorId: 'author-louisa-may-alcott',
    author: 'Louisa May Alcott',
    category: 'Philosophy',
  },
  'quote-8eec36ed': {
    text: 'He who has a why to live can bear almost any how.',
    authorId: 'author-friedrich-nietzsche',
    author: 'Friedrich Nietzsche',
    category: 'Philosophy',
  },
  'quote-4c0e2a0e': {
    text: 'The Cosmos is all that is or ever was or ever will be.',
    authorId: 'author-carl-sagan',
    author: 'Carl Sagan',
    category: 'Science Fiction',
  },
  'quote-2cc547c1': {
    text: 'For small creatures such as we, the vastness is bearable only through love.',
    authorId: 'author-ann-druyan',
    author: 'Ann Druyan',
    category: 'Science Fiction',
  },
  'quote-2e7cdc59': {
    text: 'We live in capitalism. Its power seems inescapable. So did the divine right of kings.',
    authorId: 'author-ursula-k-le-guin',
    author: 'Ursula K. Le Guin',
    category: 'Science Fiction',
  },
  'quote-cdb01015': {
    text: 'Reality is that which, when you stop believing in it, does not go away.',
    authorId: 'author-philip-k-dick',
    author: 'Philip K. Dick',
    category: 'Science Fiction',
  },
  'quote-7f3d5ca': {
    text: 'All that you touch You Change. All that you Change Changes you.',
    authorId: 'author-octavia-butler',
    author: 'Octavia Butler',
    category: 'Science Fiction',
  },
  'quote-c7c1c1e3': {
    text: 'Beware; for I am fearless, and therefore powerful.',
    authorId: 'author-mary-shelley',
    author: 'Mary Shelley',
    category: 'Science Fiction',
  },
  'quote-d12de119': {
    text: 'Nothing is so painful to the human mind as a great and sudden change.',
    authorId: 'author-mary-shelley',
    author: 'Mary Shelley',
    category: 'Science Fiction',
  },
  'quote-1e09324': {
    text: 'Drama is life with the dull bits cut out.',
    authorId: 'author-alfred-hitchcock',
    author: 'Alfred Hitchcock',
    category: 'Filmmaking',
  },
  'quote-416a37a0': {
    text: 'Once you overcome the one-inch-tall barrier of subtitles, you will be introduced to so many more amazing films.',
    authorId: 'author-bong-joon-ho',
    author: 'Bong Joon-ho',
    category: 'Filmmaking',
  },
  'quote-d364d0f5': {
    text: 'Every film should have its own world, a logic and feel to it that expands beyond the exact image that the audience is seeing.',
    authorId: 'author-christopher-nolan',
    author: 'Christopher Nolan',
    category: 'Filmmaking',
  },
};

export const CURATION = [
  {
    id: 'quote-cb2bf7e1',
    source: {
      citation: 'Moral Letters to Lucilius, Letter 13',
      title: 'Moral Letters to Lucilius',
      url: 'https://en.wikisource.org/wiki/Moral_letters_to_Lucilius/Letter_13',
      translator: 'Richard M. Gummere',
      locator: 'Letter 13',
    },
  },
  {
    id: 'quote-f37e164e',
    text: 'It is not that we have a short space of time, but that we waste much of it.',
    source: {
      citation: 'On the Shortness of Life, Chapter I',
      title: 'On the Shortness of Life',
      url: 'https://en.wikisource.org/wiki/On_the_shortness_of_life/Chapter_I',
      locator: 'Chapter I',
    },
  },
  {
    id: 'quote-467a31c3',
    attributionStatus: 'reported',
    source: {
      citation: 'Discourses, Book III, Chapter 23; reported by Arrian',
      title: 'Discourses of Epictetus',
      url: 'https://en.wikisource.org/wiki/All_the_Works_of_Epictetus%2C_Which_Are_Now_Extant/Book_3/Chapter_23',
      translator: 'Elizabeth Carter',
      locator: 'Book III, Chapter 23',
    },
  },
  {
    id: 'quote-6f10f6d5',
    attributionStatus: 'reported',
    source: {
      citation: 'Discourses, Book I, Chapter 24; reported by Arrian',
      title: 'Discourses of Epictetus',
      url: 'https://en.wikisource.org/wiki/Epictetus%2C_the_Discourses_as_reported_by_Arrian%2C_the_Manual%2C_and_Fragments/Book_1/Chapter_24',
      translator: 'W. A. Oldfather',
      locator: 'Book I, Chapter 24',
    },
  },
  {
    id: 'quote-bcea54b4',
    attributionStatus: 'reported',
    source: {
      citation: 'Discourses, Book I, Chapter 1; reported by Arrian',
      title: 'Discourses of Epictetus',
      url: 'https://en.wikisource.org/wiki/Page%3AAll_the_works_of_Epictetus_-_which_are_now_extant%3B_consisting_of_his_Discourses%2C_preserved_by_Arrian%2C_in_four_books%2C_the_Enchiridion%2C_and_fragments_%28IA_allworksofepicte00epic%29.pdf/55',
      translator: 'Elizabeth Carter',
      locator: 'Book I, Chapter 1',
      note: 'Wording normalized from Carter’s translation.',
    },
  },
  {
    id: 'quote-11ae8231',
    attributionStatus: 'reported',
    source: {
      citation: 'Cleanthes fragment preserved in Enchiridion 53',
      title: 'Enchiridion',
      url: 'https://en.wikisource.org/wiki/The_Discourses_of_Epictetus/The_Encheiridion%2C_or_Manual',
      locator: 'Section 53',
    },
  },
  {
    id: 'quote-dd26a88c',
    attributionStatus: 'reported',
    source: {
      citation: 'Diogenes Laërtius, Lives of Eminent Philosophers 7.23',
      title: 'Lives of Eminent Philosophers',
      url: 'https://www.perseus.tufts.edu/hopper/text?doc=Perseus%3Atext%3A1999.01.0258%3Abook%3D7%3Achapter%3D1',
      translator: 'R. D. Hicks',
      locator: 'Book VII, section 23',
      note: 'Modernized from “listen the more and talk the less.”',
    },
  },
  {
    id: 'quote-c01bdab3',
    source: {
      citation: 'EWD498, How Do We Tell Truths That Might Hurt?',
      title: 'How Do We Tell Truths That Might Hurt?',
      url: 'https://www.cs.utexas.edu/~EWD/ewd04xx/EWD498.PDF',
      locator: 'Handwritten annotation',
    },
  },
  {
    id: 'quote-129ebc70',
    source: {
      citation: 'EWD249, Notes on Structured Programming',
      title: 'Notes on Structured Programming',
      url: 'https://www.cs.utexas.edu/~EWD/transcriptions/EWD02xx/EWD249/EWD249.html',
      locator: 'Opening paragraph',
      note: 'Opening clause of a longer sentence.',
    },
  },
  {
    id: 'quote-2063a22c',
    text: 'We should forget about small efficiencies, say about 97% of the time: premature optimization is the root of all evil.',
    source: {
      citation: 'Structured Programming with go to Statements (1974)',
      title: 'Structured Programming with go to Statements',
      year: 1974,
      url: 'https://doi.org/10.1145/356635.356640',
    },
  },
  {
    id: 'quote-96ad11f4',
    text: 'The Analytical Engine weaves algebraical patterns just as the Jacquard-loom weaves flowers and leaves.',
    source: {
      citation: 'Sketch of the Analytical Engine, Note A (1843)',
      title: 'Sketch of the Analytical Engine Invented by Charles Babbage',
      year: 1843,
      url: 'https://www.cs.yale.edu/homes/tap/Files/ada-lovelace-notes.html',
      locator: 'Note A',
    },
  },
  {
    id: 'quote-e7d87672',
    authorId: 'author-harold-abelson-and-gerald-jay-sussman',
    author: 'Harold Abelson and Gerald Jay Sussman',
    source: {
      citation: 'Structure and Interpretation of Computer Programs, first-edition preface',
      title: 'Structure and Interpretation of Computer Programs',
      url: 'https://mitp-content-server.mit.edu/books/content/sectbyfn/books_pres_0/6515/sicp.zip/index.html',
      locator: 'Preface to the First Edition',
      note: 'The book is by Harold Abelson and Gerald Jay Sussman, with Julie Sussman.',
    },
  },
  {
    id: 'quote-8e1b85c5',
    source: {
      citation: 'Linux kernel mailing-list post, 25 August 2000',
      title: 'Linux kernel mailing-list post',
      year: 2000,
      url: 'https://lkml.org/lkml/2000/8/25/132',
    },
  },
  {
    id: 'quote-3d8b75e4',
    source: {
      citation: 'Epigrams on Programming, epigram 19 (1982)',
      title: 'Epigrams on Programming',
      year: 1982,
      url: 'https://www.cs.yale.edu/homes/perlis-alan/quotes.html',
      locator: 'Epigram 19',
    },
  },
  {
    id: 'quote-1f0ee81c',
    attributionStatus: 'reported',
    source: {
      citation: 'Plato, Apology 38a',
      title: 'Apology',
      url: 'https://classics.mit.edu/Plato/apology.html',
      translator: 'Benjamin Jowett',
      locator: '38a',
      note: 'Socrates as reported by Plato; wording contracted from Jowett’s translation.',
    },
  },
  {
    id: 'quote-269f99bb',
    text: 'I think, therefore I am.',
    author: 'René Descartes',
    source: {
      citation: 'Discourse on the Method, Part IV',
      title: 'Discourse on the Method',
      url: 'https://www.gutenberg.org/files/59/59-h/59-h.htm',
      translator: 'John Veitch',
      locator: 'Part IV',
    },
  },
  {
    id: 'quote-c0bfa9b6',
    source: {
      citation: 'Groundwork of the Metaphysics of Morals, Section II',
      title: 'Groundwork of the Metaphysics of Morals',
      url: 'https://en.wikisource.org/wiki/Groundwork_of_the_Metaphysics_of_Morals',
      locator: 'Section II',
      note: 'Modern English rendering; wording varies by translation.',
    },
  },
  {
    id: 'quote-b02d6af3',
    source: {
      citation: 'Tractatus Logico-Philosophicus, proposition 7 (1922)',
      title: 'Tractatus Logico-Philosophicus',
      year: 1922,
      url: 'https://en.wikisource.org/wiki/Tractatus_Logico-Philosophicus/7',
      translator: 'C. K. Ogden',
      locator: 'Proposition 7',
    },
  },
  {
    id: 'quote-2a687efa',
    text: "I'm not afraid of storms, for I'm learning how to sail my ship.",
    source: {
      citation: 'Little Women, Part II, Chapter 44 (1869)',
      title: 'Little Women',
      year: 1869,
      url: 'https://www.gutenberg.org/files/514/514-h/514-h.htm',
      locator: 'Part II, Chapter 44',
      note: 'Spoken by Amy March.',
    },
  },
  {
    id: 'quote-8eec36ed',
    source: {
      citation: 'Twilight of the Idols, “Maxims and Arrows” §12',
      title: 'Twilight of the Idols',
      url: 'https://www.gutenberg.org/ebooks/52263',
      locator: 'Maxims and Arrows, section 12',
      note: 'English wording varies by translation.',
    },
  },
  {
    id: 'quote-4c0e2a0e',
    text: 'The Cosmos is all that is or ever was or ever will be.',
    source: {
      citation: 'Cosmos (1980)',
      title: 'Cosmos',
      year: 1980,
      url: 'https://carlsagan.com/books/',
    },
  },
  {
    id: 'quote-2cc547c1',
    authorId: 'author-ann-druyan',
    author: 'Ann Druyan',
    source: {
      citation: 'Contact (1985)',
      title: 'Contact',
      year: 1985,
      url: 'https://carlsagan.com/books/',
      note: 'The official Sagan portal credits this line to Ann Druyan.',
    },
  },
  {
    id: 'quote-2e7cdc59',
    source: {
      citation: 'National Book Foundation Medal speech, 19 November 2014',
      title: 'National Book Foundation Medal acceptance speech',
      year: 2014,
      url: 'https://www.ursulakleguin.com/nbf-medal',
    },
  },
  {
    id: 'quote-cdb01015',
    source: {
      citation: 'How to Build a Universe That Doesn’t Fall Apart Two Days Later',
      title: 'How to Build a Universe That Doesn’t Fall Apart Two Days Later',
      url: 'https://philipdick.com/mirror/essays/How_to_Build_a_Universe.pdf',
      note: 'Dick says in the essay that he formulated the sentence in 1972.',
    },
  },
  {
    id: 'quote-7f3d5ca',
    text: 'All that you touch You Change. All that you Change Changes you.',
    source: {
      citation: 'Parable of the Sower (1993)',
      title: 'Parable of the Sower',
      year: 1993,
      url: 'https://teachers.yale.edu/curriculum/viewer/initiative_18.05.05_u',
      note: 'Capitalization follows the Earthseed verse in the novel.',
    },
  },
  {
    id: 'quote-c7c1c1e3',
    text: 'Beware; for I am fearless, and therefore powerful.',
    source: {
      citation: 'Frankenstein; or, The Modern Prometheus, Chapter 20',
      title: 'Frankenstein; or, The Modern Prometheus',
      url: 'https://www.gutenberg.org/files/42324/42324-h/42324-h.htm',
      locator: 'Chapter 20',
    },
  },
  {
    id: 'quote-d12de119',
    source: {
      citation: 'Frankenstein; or, The Modern Prometheus, Chapter 23',
      title: 'Frankenstein; or, The Modern Prometheus',
      url: 'https://www.gutenberg.org/files/42324/42324-h/42324-h.htm',
      locator: 'Chapter 23',
    },
  },
  {
    id: 'quote-1e09324',
    source: {
      citation: 'BBC Picture Parade interview, 5 July 1960',
      title: 'Picture Parade interview',
      year: 1960,
      url: 'https://web.archive.org/web/20240228231033id_/https://the.hitchcock.zone/wiki/Picture_Parade_%28BBC%2C_05/Jul/1960%29',
    },
  },
  {
    id: 'quote-416a37a0',
    source: {
      citation: '77th Golden Globe Awards acceptance remarks (2020)',
      title: 'Golden Globe acceptance remarks',
      year: 2020,
      url: 'https://goldenglobes.com/articles/neons-tom-quinn-eye-talent/',
      note: 'Delivered through an interpreter.',
    },
  },
  {
    id: 'quote-d364d0f5',
    text: 'Every film should have its own world, a logic and feel to it that expands beyond the exact image that the audience is seeing.',
    authorId: 'author-christopher-nolan',
    author: 'Christopher Nolan',
    source: {
      citation: 'DGA Quarterly, “The Traditionalist: Christopher Nolan” (2012)',
      title: 'The Traditionalist: Christopher Nolan',
      year: 2012,
      url: 'https://www.dga.org/craft/dgaq/issues/1202-spring-2012/dga-interview-christopher-nolan',
    },
  },
];

export function curateQuoteRecords(existing) {
  const byId = new Map(existing.map((quote) => [quote.id, quote]));
  const curated = CURATION.map(({ id, attributionStatus = 'sourced', source, ...corrections }) => {
    const original = byId.get(id);
    assert(original, `Missing expected quote ${id}`);

    const canonical = CANONICAL_IDENTITIES[id];
    assert(canonical, `Missing canonical identity for ${id}`);
    for (const field of ['text', 'authorId', 'author', 'category']) {
      assert.equal(
        original[field],
        canonical[field],
        `${id}: canonical ${field} mismatch; refusing to attach source metadata to a changed quote`
      );
    }

    return { ...original, ...corrections, attributionStatus, source };
  });

  assert.equal(new Set(curated.map((quote) => quote.id)).size, CURATION.length, 'Curation IDs must be unique');
  return curated;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  const existing = JSON.parse(fs.readFileSync(QUOTES_PATH, 'utf8'));
  const curated = curateQuoteRecords(existing);
  fs.writeFileSync(QUOTES_PATH, `${JSON.stringify(curated, null, 2)}\n`);
  console.log(`Wrote ${curated.length} source-audited quotes to ${QUOTES_PATH}`);
}
