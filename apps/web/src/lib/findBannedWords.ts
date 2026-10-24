import ts from 'typescript';

// The corporate words the voice rules ban (`docs/voice-and-copy.md`, rule 4; the source is
// `design-docs/Brand Voice.html`). A friend in the group chat does not say them.
export const BANNED_WORDS: readonly { readonly word: string; readonly pattern: RegExp }[] = [
  { word: 'attendees', pattern: /\battendees\b/i },
  { word: 'event', pattern: /\bevents?\b/i },
  { word: 'leverage', pattern: /\bleverag(e|es|ed|ing)\b/i },
  { word: 'utilize', pattern: /\butili[sz](e|es|ed|ing)\b/i },
  { word: 'reach out', pattern: /\breach(es|ed|ing)? out\b/i },
  { word: 'community', pattern: /\bcommunit(y|ies)\b/i },
  { word: 'engage', pattern: /\bengag(e|es|ed|ing|ement)\b/i },
  { word: 'action required', pattern: /\baction required\b/i },
  { word: 'touch base', pattern: /\btouch(es|ed|ing)? base\b/i },
  { word: 'circle back', pattern: /\bcircle(s|d)? back\b/i },
  { word: 'connect', pattern: /\bconnect(s|ed|ing|ion|ions)?\b/i },
  { word: 'successfully', pattern: /\bsuccessful(ly)?\b/i },
  { word: 'awesome!', pattern: /\bawesome!/i },
  { word: 'amazing!', pattern: /\bamazing!/i },
];

export type BannedWordFinding = {
  readonly line: number;
  readonly word: string;
  readonly text: string;
};

// The words a person reads in one source file: string and template literals, and JSX text. Code,
// identifiers, comments and CSS class names are not read by anyone, so they are not scanned.
// Strings that are not words (an import path, a header name) are skipped by the allowlist, which
// is a list of whole strings, never of words.
export function findBannedWords(params: {
  readonly source: string;
  readonly fileName: string;
  readonly allowedStrings?: readonly string[];
}): readonly BannedWordFinding[] {
  const { source, fileName } = params;
  const allowed = new Set(params.allowedStrings ?? []);
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const findings: BannedWordFinding[] = [];

  function check(node: ts.Node, text: string): void {
    const trimmed = text.trim();
    if (trimmed === '' || allowed.has(trimmed)) return;
    for (const { word, pattern } of BANNED_WORDS) {
      if (!pattern.test(trimmed)) continue;
      const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
      findings.push({ line: line + 1, word, text: trimmed.slice(0, 80) });
    }
  }

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    ) {
      check(node, node.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return findings;
}
