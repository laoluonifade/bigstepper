/**
 * A policy page: plain text as written. Lines like "3. Heading" and "3.1 Heading" become headings, lines
 * starting "* " become lists, blank lines separate paragraphs.
 */
export interface LegalDocument {
  slug: 'terms' | 'privacy' | 'safety';
  title: string;
  effective: string;
  updated: string;
  body: string;
}
