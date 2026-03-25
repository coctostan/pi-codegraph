export function tokenize(input: string): string[] {
  if (!input) return [];
  const parts = input.split(/\s+/).filter(Boolean);
  const tokens: string[] = [];
  for (const part of parts) {
    const segments = part.split(/_+/).filter(Boolean);
    for (const seg of segments) {
      const camelParts = seg.replace(/([a-z])([A-Z])/g, "$1\0$2")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1\0$2")
        .split("\0")
        .filter(Boolean);
      for (const cp of camelParts) {
        tokens.push(cp.toLowerCase());
      }
    }
  }
  return tokens;
}

export interface BM25Document {
  name: string;
  signature: string;
  file: string;
}

export interface BM25Result {
  id: string;
  score: number;
}

interface DocEntry {
  id: string;
  fieldTokens: { name: string[]; signature: string[]; file: string[] };
  fieldLengths: { name: number; signature: number; file: number };
}

const FIELD_WEIGHTS = { name: 3, signature: 2, file: 1 };
const K1 = 1.2;
const B = 0.75;

export class BM25Index {
  private docs: DocEntry[] = [];
  private docFreq: Map<string, { name: number; signature: number; file: number }> = new Map();
  private avgFieldLen = { name: 0, signature: 0, file: 0 };
  private built = false;

  addDocument(id: string, doc: BM25Document): void {
    const nameTokens = tokenize(doc.name);
    const sigTokens = tokenize(doc.signature.replace(/[^a-zA-Z0-9_\s]/g, " "));
    const fileTokens = tokenize(doc.file.replace(/[/\\.]/g, " "));
    this.docs.push({
      id,
      fieldTokens: { name: nameTokens, signature: sigTokens, file: fileTokens },
      fieldLengths: { name: nameTokens.length, signature: sigTokens.length, file: fileTokens.length },
    });
  }

  build(): void {
    const n = this.docs.length;
    if (n === 0) { this.built = true; return; }

    let totalName = 0, totalSig = 0, totalFile = 0;
    for (const doc of this.docs) {
      totalName += doc.fieldLengths.name;
      totalSig += doc.fieldLengths.signature;
      totalFile += doc.fieldLengths.file;

      const seenFields = { name: new Set<string>(), signature: new Set<string>(), file: new Set<string>() };
      for (const t of doc.fieldTokens.name) seenFields.name.add(t);
      for (const t of doc.fieldTokens.signature) seenFields.signature.add(t);
      for (const t of doc.fieldTokens.file) seenFields.file.add(t);

      const allTerms = new Set([...seenFields.name, ...seenFields.signature, ...seenFields.file]);
      for (const term of allTerms) {
        let entry = this.docFreq.get(term);
        if (!entry) { entry = { name: 0, signature: 0, file: 0 }; this.docFreq.set(term, entry); }
        if (seenFields.name.has(term)) entry.name++;
        if (seenFields.signature.has(term)) entry.signature++;
        if (seenFields.file.has(term)) entry.file++;
      }
    }

    this.avgFieldLen = { name: totalName / n, signature: totalSig / n, file: totalFile / n };
    this.built = true;
  }

  search(query: string, limit: number = 20): BM25Result[] {
    if (!this.built) throw new Error("Call build() before search()");
    const terms = tokenize(query);
    if (terms.length === 0) return [];

    const n = this.docs.length;
    const scores: { id: string; score: number }[] = [];

    for (const doc of this.docs) {
      let totalScore = 0;
      for (const term of terms) {
        const df = this.docFreq.get(term);
        if (!df) continue;

        for (const field of ["name", "signature", "file"] as const) {
          const fieldDf = df[field];
          if (fieldDf === 0) continue;

          const tf = doc.fieldTokens[field].filter((t) => t === term).length;
          if (tf === 0) continue;

          const idf = Math.log((n - fieldDf + 0.5) / (fieldDf + 0.5) + 1);
          const fieldLen = doc.fieldLengths[field];
          const avgLen = this.avgFieldLen[field] || 1;
          const tfNorm = (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * (fieldLen / avgLen)));
          totalScore += FIELD_WEIGHTS[field] * idf * tfNorm;
        }
      }
      if (totalScore > 0) scores.push({ id: doc.id, score: totalScore });
    }

    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, limit).map((s) => ({ id: s.id, score: Math.round(s.score * 1000) / 1000 }));
  }
}
