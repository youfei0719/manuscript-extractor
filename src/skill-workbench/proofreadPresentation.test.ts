import { describe, expect, it } from "vitest"
import { proofreadPresentation } from "./proofreadPresentation"

describe("AI 校对状态呈现", () => {
  it("按连接、校对、分段顺序显示明确阶段", () => {
    expect(proofreadPresentation("connecting", true).label).toBe("正在连接模型")
    expect(proofreadPresentation("reviewing", true).label).toBe("模型正在校对稿件")
    expect(proofreadPresentation("formatting", true).label).toBe("正在整理语义段落")
  })

  it("失败状态提供重试动作并说明原稿保留", () => {
    const value = proofreadPresentation("error", false)
    expect(value.status).toBe("校对没有完成")
    expect(value.label).toBe("重新运行 AI 校对")
    expect(value.isRetry).toBe(true)
    expect(value.description).toContain("原始转写不会丢失")
  })

  it("空闲状态不显示运行中动画", () => {
    expect(proofreadPresentation("idle", false)).toMatchObject({ isRunning: false, isRetry: false })
  })
})
