import { Link } from '@tanstack/react-router';
import { Fragment, type ReactNode, useEffect } from 'react';
import { PRIVACY } from '../legal/privacy';
import { SAFETY } from '../legal/safety';
import { TERMS } from '../legal/terms';
import { LEGAL_LINKS } from '../legal/links';
import type { LegalDocument } from '../legal/types';

type Block =
  | { kind: 'section'; id: string; text: string }
  | { kind: 'subsection'; text: string }
  | { kind: 'label'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'paragraph'; lines: string[] };

/** Blank lines split blocks; numbered lines are headings; "* " lines are lists; short unpunctuated lines are labels. */
function parse(body: string): Block[] {
  return body.split(/\n\s*\n/).map((chunk): Block => {
    const lines = chunk.split('\n').map((line) => line.trim()).filter(Boolean);
    const first = lines[0] ?? '';
    if (lines.length === 1 && /^\d+\.\s/.test(first)) return { kind: 'section', id: `section-${first.split('.')[0]}`, text: first };
    if (lines.length === 1 && /^\d+\.\d+\s/.test(first)) return { kind: 'subsection', text: first };
    if (lines.every((line) => line.startsWith('* '))) return { kind: 'list', items: lines.map((line) => line.slice(2)) };
    if (lines.length === 1 && first.length <= 40 && !/[.:?]$/.test(first)) return { kind: 'label', text: first };
    return { kind: 'paragraph', lines };
  });
}

const EMAIL = /([\w.+-]+@[\w-]+\.[\w.]+)/g;

/** Email addresses become mail links; everything else stays exactly as written. */
function withLinks(text: string): ReactNode {
  return text.split(EMAIL).map((part, index) => index % 2
    ? <a key={index} href={`mailto:${part}`} className="font-semibold text-ink underline underline-offset-2">{part}</a>
    : part);
}

/** "Contract: Processing necessary…" reads better with its term in bold. */
function listItem(text: string): ReactNode {
  const match = /^([A-Z][^:]{2,60}):\s(.+)$/.exec(text);
  return match ? <><span className="font-semibold text-ink">{match[1]}:</span> {withLinks(match[2])}</> : withLinks(text);
}

function LegalPage({ document }: { document: LegalDocument }) {
  const blocks = parse(document.body);
  const sections = blocks.filter((block): block is Extract<Block, { kind: 'section' }> => block.kind === 'section');
  useEffect(() => {
    const previous = window.document.title;
    window.document.title = `${document.title} · Jump`;
    return () => { window.document.title = previous; };
  }, [document.title]);

  return <article className="mx-auto max-w-2xl pb-16">
    <p className="eyebrow">Legal</p>
    <h1 className="mt-1 text-[30px] font-extrabold leading-tight tracking-tight sm:text-[36px]">{document.title}</h1>
    <p className="mt-2 text-[13px] text-ink-3">
      Effective {document.effective} · Last updated {document.updated} · Jump is operated by Voyatech Limited
    </p>

    <nav className="mt-6 rounded-xl border border-line bg-card px-4 py-3" aria-label="On this page">
      <details>
        <summary className="cursor-pointer text-[13px] font-semibold">On this page</summary>
        <ol className="mt-2 columns-1 gap-6 text-[13px] sm:columns-2">
          {sections.map((section) => <li key={section.id} className="break-inside-avoid py-0.5">
            <a href={`#${section.id}`} className="text-ink-2 hover:text-ink hover:underline">{section.text}</a>
          </li>)}
        </ol>
      </details>
    </nav>

    <div className="mt-8 text-[15px] leading-relaxed text-ink-2">
      {blocks.map((block, index) => {
        switch (block.kind) {
          case 'section':
            return <h2 key={index} id={block.id} className="mt-10 scroll-mt-20 text-[19px] font-bold tracking-tight text-ink first:mt-0">{block.text}</h2>;
          case 'subsection':
            return <h3 key={index} className="mt-6 text-[16px] font-semibold text-ink">{block.text}</h3>;
          case 'label':
            return <p key={index} className="mt-5 text-[14px] font-semibold text-ink">{block.text}</p>;
          case 'list':
            return <ul key={index} className="mt-3 space-y-1.5 pl-5 marker:text-ink-3 [list-style:disc]">
              {block.items.map((item, itemIndex) => <li key={itemIndex}>{listItem(item)}</li>)}
            </ul>;
          case 'paragraph':
            return <p key={index} className="mt-3">
              {block.lines.map((line, lineIndex) => <Fragment key={lineIndex}>{lineIndex > 0 && <br />}{withLinks(line)}</Fragment>)}
            </p>;
        }
      })}
    </div>

    <nav className="mt-14 border-t border-line pt-6" aria-label="Other policies">
      <p className="text-[13px] font-semibold text-ink-3">Also read</p>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-[14px]">
        {LEGAL_LINKS.filter((link) => link.to !== `/${document.slug}`).map((link) => <li key={link.to}>
          <Link to={link.to} className="font-semibold text-ink underline-offset-4 hover:underline">{link.label}</Link>
        </li>)}
      </ul>
    </nav>
  </article>;
}

export const TermsPage = () => <LegalPage document={TERMS} />;
export const PrivacyPage = () => <LegalPage document={PRIVACY} />;
export const SafetyPage = () => <LegalPage document={SAFETY} />;
