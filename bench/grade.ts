/** A task's answer key: every `all` item must appear in the answer, no `none` item may. */
export interface AnswerKey {
  all: string[];
  none?: string[];
}

export interface Grade {
  correct: boolean;
  answer: string | null;
  missing: string[];
  unexpected: string[];
}

const ANSWER_BLOCK = /<answer>([\s\S]*?)<\/answer>/g;

/** The last `<answer>…</answer>` block of a reply, trimmed, or null when it has none. */
export function extractAnswer(text: string): string | null {
  const blocks = [...text.matchAll(ANSWER_BLOCK)];
  const last = blocks.at(-1);
  return last ? last[1]!.trim() : null;
}

/** Score a final reply against its key by substring match inside the answer block only. */
export function grade(key: AnswerKey, finalText: string): Grade {
  const answer = extractAnswer(finalText);
  const body = answer ?? "";
  const missing = key.all.filter((item) => !body.includes(item));
  const unexpected = (key.none ?? []).filter((item) => body.includes(item));
  return { correct: answer !== null && missing.length === 0 && unexpected.length === 0, answer, missing, unexpected };
}
