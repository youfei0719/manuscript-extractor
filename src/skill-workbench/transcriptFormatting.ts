const SENTENCE_END = /[。！？!?；;]$/
const WEAK_END = /[，,、：:；;]$/
const SEMANTIC_BREAK = /(但是|不过|因此|所以|同时|后来|随后|如今|其实|可以说|问题是|更重要的是|第一|第二|第三|最后|原来|没想到)/

function splitLongRun(value: string) {
  const sentences = value.match(/[^。！？!?；;]+[。！？!?；;]+|[^。！？!?；;]+$/g) ?? [value]
  const paragraphs: string[] = []
  let current = ""
  let sentenceCount = 0

  const flush = () => {
    while (current.trim().length > 140) {
      const source = current.trim()
      const boundary = Math.max(source.lastIndexOf("，", 120), source.lastIndexOf("。", 120), source.lastIndexOf(",", 120))
      const splitAt = boundary >= 60 ? boundary + 1 : 120
      paragraphs.push(source.slice(0, splitAt).trim())
      current = source.slice(splitAt).trim()
    }
    const next = current.trim()
    if (next) paragraphs.push(next)
    current = ""
    sentenceCount = 0
  }

  for (const rawSentence of sentences) {
    const sentence = rawSentence.trim()
    if (!sentence) continue
    current += sentence
    if (SENTENCE_END.test(sentence)) sentenceCount += 1
    if (SENTENCE_END.test(sentence) && (sentenceCount >= 3 || current.length >= 90)) {
      flush()
      continue
    }
    if (current.length >= 130) {
      const boundary = Math.max(
        current.lastIndexOf("，", 130),
        current.lastIndexOf(",", 130),
        current.lastIndexOf("、", 130),
        current.lastIndexOf("；", 130),
        current.lastIndexOf(";", 130),
      )
      if (boundary >= 56) {
        paragraphs.push(current.slice(0, boundary + 1).trim())
        current = current.slice(boundary + 1).trim()
      } else {
        const semantic = current.slice(60).search(SEMANTIC_BREAK)
        if (semantic >= 0) {
          const splitAt = 60 + semantic
          paragraphs.push(current.slice(0, splitAt).trim())
          current = current.slice(splitAt).trim()
        } else if (current.length >= 150) {
          paragraphs.push(current.slice(0, 120).trim())
          current = current.slice(120).trim()
        }
      }
    } else if (WEAK_END.test(sentence) && current.length >= 100) {
      flush()
    }
  }
  if (paragraphs.length === 0 && current.trim().length > 80) {
    const source = current.trim()
    const semantic = source.slice(45).search(SEMANTIC_BREAK)
    const splitAt = semantic >= 0 ? 45 + semantic : 60
    paragraphs.push(source.slice(0, splitAt).trim())
    current = source.slice(splitAt).trim()
  }
  flush()
  return paragraphs
}

export function formatTranscript(value: string) {
  const normalized = value
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
  if (!normalized) return ""
  if (normalized.includes("\n\n")) return normalized

  return splitLongRun(normalized).join("\n\n")
}
