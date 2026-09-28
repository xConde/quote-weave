import quotesData from '../../assets/data/quotes.json';
import type { Quote } from './services/quote-collection.service';

/**
 * Data-integrity guard for the quote corpus. These tests lock in attribution
 * and category corrections (PR: content integrity) so a future edit can't
 * silently reintroduce a misattribution. The portfolio has a no-fabrication
 * rule; this file is its enforcement for quote-weave.
 */
describe('quotes.json data integrity', () => {
  const quotes = quotesData as Quote[];

  const find = (fragment: string): Quote => {
    const matches = quotes.filter((q) => q.text.includes(fragment));
    expect(matches.length).withContext(`exactly one quote contains "${fragment}"`).toBe(1);
    return matches[0];
  };

  it('every entry has stable identity, explicit attribution status, and display fields', () => {
    const categories = new Set(['Stoicism', 'Philosophy', 'Programming', 'Science Fiction', 'Filmmaking']);
    for (const q of quotes) {
      expect(q.text.trim().length).toBeGreaterThan(0);
      expect(q.author.trim().length).toBeGreaterThan(0);
      expect(q.id).toMatch(/^quote-[a-f0-9]{1,8}$/);
      expect(q.authorId).toMatch(/^author-[a-z0-9-]+$/);
      expect(['sourced', 'reported']).toContain(q.attributionStatus);
      expect(categories.has(q.category)).withContext(`unknown category "${q.category}"`).toBeTrue();
      expect(q.source?.url)
        .withContext(`missing source URL for ${q.id}`)
        .toMatch(/^https:\/\//);
    }
  });

  it('no source field is ever an empty string (omit it instead)', () => {
    for (const q of quotes) {
      if (q.source !== undefined) {
        expect(q.source.citation.trim().length)
          .withContext(`empty source on "${q.text.slice(0, 40)}"`)
          .toBeGreaterThan(0);
      }
    }
  });

  describe('corrected misattributions stay corrected', () => {
    it('the "storms" quote is Louisa May Alcott (not Ada Lovelace), in Philosophy, cited', () => {
      const q = find("I'm not afraid of storms");
      expect(q.author).toBe('Louisa May Alcott');
      expect(q.category).toBe('Philosophy');
      expect(q.source?.citation).toContain('Little Women');
    });

    it('the Contact line is credited to Ann Druyan rather than silently left under Carl Sagan', () => {
      const q = find('For small creatures such as we');
      expect(q.author).toBe('Ann Druyan');
      expect(q.source?.citation).toContain('Contact');
    });

    it('the film-world quote is credited to Christopher Nolan rather than Jordan Peele', () => {
      const q = find('Every film should have its own world');
      expect(q.author).toBe('Christopher Nolan');
      expect(q.source?.citation).toContain('DGA Quarterly');
      expect(quotes.some((x) => x.author === 'Jordan Peele')).toBeFalse();
    });

    it('does not publish the removed pop-aphorism attributions', () => {
      expect(quotes.some((q) => q.author === 'Unknown')).toBeFalse();
      expect(quotes.some((q) => q.author === 'John Johnson')).toBeFalse();
      expect(quotes.some((q) => q.text.includes('Luck is what happens when preparation'))).toBeFalse();
    });

    it('the Zeno "two ears" quote keeps its documented attribution + source', () => {
      const q = find('two ears and one mouth');
      expect(q.author).toBe('Zeno of Citium');
      expect(q.source).toBeTruthy();
    });
  });
});
