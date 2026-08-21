const SENTENCE_END = /[。！？!?]$/

export function formatTranscript(value: string) {
  const normalized = value
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
  if (!normalized || normalized.includes("\n\n")) return normalized

  const sentences = normalized.match(/[^。！？!?]+[。！？!?]+|[^。！？!?]+$/g) ?? [normalized]
  const paragraphs: string[] = []
  let current: string[] = []
  let currentLength = 0

  for (const rawSentence of sentences) {
    const sentence = rawSentence.trim()
    if (!sentence) continue
    current.push(sentence)
    currentLength += sentence.length
    if (SENTENCE_END.test(sentence) && (current.length >= 3 || currentLength >= 90)) {
      paragraphs.push(current.join(""))
      current = []
      currentLength = 0
    }
  }
  if (current.length) paragraphs.push(current.join(""))
  return paragraphs.join("\n\n")
}
