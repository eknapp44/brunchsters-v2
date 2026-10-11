import { describe, expect, it } from 'vitest';
import { escapeHtml, safeHttpUrl } from './escapeHtml';

describe('escapeHtml', () => {
  it('escapes the five characters that can open or close markup', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
  });

  it('leaves ordinary text alone', () => {
    expect(escapeHtml('Sunday brunch at Joe’s Café')).toBe('Sunday brunch at Joe’s Café');
  });

  it('escapes the ampersand first so entities are not double-decoded', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });
});

describe('safeHttpUrl', () => {
  it('keeps http and https URLs', () => {
    expect(safeHttpUrl('https://maps.google.com/?cid=1')).toBe('https://maps.google.com/?cid=1');
    expect(safeHttpUrl('http://example.com/')).toBe('http://example.com/');
  });

  it('drops schemes that can run code or embed data', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeHttpUrl('data:text/html,<script>alert(1)</script>')).toBeUndefined();
  });

  it('drops text that is not a URL at all', () => {
    expect(safeHttpUrl('not a url')).toBeUndefined();
    expect(safeHttpUrl('')).toBeUndefined();
  });
});
