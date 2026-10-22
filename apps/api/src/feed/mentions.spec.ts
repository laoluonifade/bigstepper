import { extractMentions } from './mentions';

describe('extractMentions', () => {
  it('finds @handles at word starts, once each, lowercased', () => {
    expect(extractMentions('@Ada great run with @bola_1 and @ada!')).toEqual(['ada', 'bola_1']);
  });

  it('ignores emails and single letters', () => {
    expect(extractMentions('mail me at a@jump.ng or @x')).toEqual([]);
  });
});
