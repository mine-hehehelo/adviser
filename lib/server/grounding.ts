import 'server-only';

const MAX_CHUNK_CHARACTERS = 1_000;
const MAX_SELECTED_CHUNKS = 2;

const STOP_WORDS = new Set([
  'about',
  'after',
  'again',
  'also',
  'and',
  'are',
  'because',
  'been',
  'before',
  'being',
  'but',
  'can',
  'could',
  'does',
  'for',
  'from',
  'have',
  'how',
  'into',
  'just',
  'more',
  'not',
  'that',
  'the',
  'their',
  'then',
  'there',
  'these',
  'they',
  'this',
  'was',
  'what',
  'when',
  'where',
  'which',
  'with',
  'would',
  'you',
  'your',
]);

function extractKeywords(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];

  return new Set(
    words.filter(
      (word) => word.length >= 3 && !STOP_WORDS.has(word)
    )
  );
}

function createChunks(referenceText: string): string[] {
  const paragraphs = referenceText
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    const combined = currentChunk
      ? `${currentChunk}\n${paragraph}`
      : paragraph;

    if (
      currentChunk &&
      combined.length > MAX_CHUNK_CHARACTERS
    ) {
      chunks.push(currentChunk);
      currentChunk = paragraph;
    } else {
      currentChunk = combined;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

export function findRelevantGrounding(
  referenceText: string,
  userMessage: string
): string {
  const chunks = createChunks(referenceText);

  if (chunks.length === 0) {
    return '';
  }

  const queryKeywords = extractKeywords(userMessage);

  const rankedChunks = chunks
    .map((chunk, index) => {
      const chunkKeywords = extractKeywords(chunk);

      const score = [...queryKeywords].filter((keyword) =>
        chunkKeywords.has(keyword)
      ).length;

      return {
        chunk,
        index,
        score,
      };
    })
    .filter((result) => result.score > 0)
    .sort((first, second) => second.score - first.score)
    .slice(0, MAX_SELECTED_CHUNKS)
    .sort((first, second) => first.index - second.index);

  if (rankedChunks.length === 0) {
    return chunks[0];
  }

  return rankedChunks
    .map((result) => result.chunk)
    .join('\n\n');
}