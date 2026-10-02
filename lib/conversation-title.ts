/** Keep the automatic title short without cutting through an emoji. */
export function titleFromMessage(text: string, maxLength = 60): string {
  const compact = text.trim().replace(/\s+/gu, ' ');
  let title = '';

  for (const { segment } of new Intl.Segmenter(undefined, {
    granularity: 'grapheme',
  }).segment(compact)) {
    if (title.length + segment.length > maxLength) break;
    title += segment;
  }

  return title || 'New conversation';
}
