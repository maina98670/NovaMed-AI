/**
 * Tiny zero-dependency markdown renderer for AI medical reports.
 * Handles: headings (#, ##, ###), bold (**), italic (*), inline code (`),
 * unordered lists (-, *), ordered lists (1.), blockquotes (>),
 * horizontal rules (---), tables, paragraphs and line breaks.
 *
 * Output is intentionally conservative: no raw HTML is injected.
 */
import React from 'react';

function renderInline(text, keyBase = 'i') {
  // escape HTML-ish chars first
  let safe = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  // inline code
  safe = safe.replace(/`([^`]+)`/g, '<code>$1</code>');
  // bold **text**
  safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // italics *text* (single asterisk, but not part of bullet starters)
  safe = safe.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  // emphasised __text__
  safe = safe.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  return <span key={keyBase} dangerouslySetInnerHTML={{ __html: safe }} />;
}

export function Markdown({ text }) {
  if (!text) return null;
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // blank line → flush
    if (!line.trim()) { i++; continue; }

    // heading
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const Tag = `h${Math.min(level + 2, 6)}`; // shift down so h1 of MD looks like h3 in page
      blocks.push(React.createElement(Tag, { key: 'h' + i, className: 'md-h' }, renderInline(h[2], 'h' + i)));
      i++; continue;
    }

    // horizontal rule
    if (/^---+$/.test(line.trim())) {
      blocks.push(<hr key={'hr' + i} className="md-hr" />);
      i++; continue;
    }

    // blockquote
    if (line.startsWith('> ')) {
      const lines2 = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        lines2.push(lines[i].slice(2));
        i++;
      }
      blocks.push(
        <blockquote key={'bq' + i} className="md-bq">
          {lines2.map((l, k) => <div key={k}>{renderInline(l, 'bq' + i + '-' + k)}</div>)}
        </blockquote>
      );
      continue;
    }

    // unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        const m = /^\s*[-*]\s+(.*)$/.exec(lines[i]);
        items.push(m[1]);
        i++;
      }
      blocks.push(
        <ul key={'ul' + i} className="md-ul">
          {items.map((it, k) => <li key={k}>{renderInline(it, 'li' + i + '-' + k)}</li>)}
        </ul>
      );
      continue;
    }

    // ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        const m = /^\s*\d+\.\s+(.*)$/.exec(lines[i]);
        items.push(m[1]);
        i++;
      }
      blocks.push(
        <ol key={'ol' + i} className="md-ol">
          {items.map((it, k) => <li key={k}>{renderInline(it, 'oli' + i + '-' + k)}</li>)}
        </ol>
      );
      continue;
    }

    // table (simple): | a | b | followed by | --- | --- |
    if (line.includes('|') && i + 1 < lines.length && /\|\s*-{3,}/.test(lines[i + 1])) {
      const splitRow = (s) => {
        let parts = s.split('|').map(x => x.trim());
        if (parts.length && parts[0] === '') parts.shift();
        if (parts.length && parts[parts.length - 1] === '') parts.pop();
        return parts;
      };
      const head = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      blocks.push(
        <div key={'tbl' + i} className="md-tbl-wrap">
          <table className="md-tbl">
            <thead><tr>{head.map((h2, k) => <th key={k}>{renderInline(h2, 'th' + i + '-' + k)}</th>)}</tr></thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri}>{row.map((c, ci) => <td key={ci}>{renderInline(c, 'td' + ri + '-' + ci)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // paragraph (collect consecutive non-blank, non-block lines)
    const paraLines = [];
    while (i < lines.length && lines[i].trim() &&
           !/^(#{1,6})\s+/.test(lines[i]) &&
           !/^\s*[-*]\s+/.test(lines[i]) &&
           !/^\s*\d+\.\s+/.test(lines[i]) &&
           !lines[i].startsWith('> ') &&
           !/^---+$/.test(lines[i].trim())) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={'p' + i} className="md-p">
        {paraLines.map((l, k) => (
          <React.Fragment key={k}>
            {renderInline(l, 'p' + i + '-' + k)}
            {k < paraLines.length - 1 && <br />}
          </React.Fragment>
        ))}
      </p>
    );
  }

  return <div className="md">{blocks}</div>;
}

export default Markdown;
