export type ProofreadPhase = "idle" | "connecting" | "reviewing" | "formatting" | "error"

export interface ProofreadPresentation {
  label: string
  status: string
  description: string
  isRunning: boolean
  isRetry: boolean
}

export function proofreadPresentation(phase: ProofreadPhase, proofreading: boolean): ProofreadPresentation {
  const label = phase === "connecting"
    ? "正在连接模型"
    : phase === "reviewing"
      ? "模型正在校对稿件"
      : phase === "formatting"
        ? "正在整理语义段落"
        : phase === "error"
          ? "重新运行 AI 校对"
          : "运行 AI 校对"
  return {
    label,
    status: proofreading ? label : phase === "error" ? "校对没有完成" : "准备校对",
    description: proofreading
      ? "请求完成后会自动整理自然段并显示修改建议"
      : phase === "error"
        ? "可检查设置后重新运行，原始转写不会丢失"
        : "AI 将只基于当前真实稿件提出可审核修改",
    isRunning: proofreading,
    isRetry: phase === "error",
  }
}
