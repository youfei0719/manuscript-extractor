import { expect, test } from "@playwright/test"

const transcript = "这是一份经授权的真实短视频稿件，用来验证原始转写、人工校对和确认稿历史保存流程。"

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop window minimum width is 720px")
  await page.goto("/")
})

test("首屏体现稿件提取闭环且不出现 Skill 文案", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "识别真实稿件" })).toBeVisible()
  await expect(page.getByText("授权来源 → 真实稿件 → AI 校对 → 确认稿")).toBeVisible()
  await expect(page.getByRole("button", { name: "识别稿件" })).toBeVisible()
  await expect(page.getByRole("button", { name: "稿件历史" })).toBeVisible()
  await expect(page.getByText(/Skill|沉淀|候选|发布/)).toHaveCount(0)
})

test("浏览器预览不会伪造下载、转写或自动校对", async ({ page }) => {
  await page.getByLabel("抖音分享文案或短链").fill("https://v.douyin.com/example/")
  await page.getByRole("button", { name: "开始提取并转写" }).click()
  await expect(page.getByText(/真实稿件获取失败：真实下载与转写只在 Mac \/ Windows 桌面端可用/)).toBeVisible()

  await page.getByRole("button", { name: "真实稿件" }).click()
  await page.getByLabel("来源名称或链接").fill("授权来源 A")
  await page.getByLabel("经授权的真实稿件").fill(transcript)
  await page.getByText("我确认这是真实稿件且来源已获授权").click()
  await page.getByRole("button", { name: "确认真实稿件" }).click()
  await expect(page.getByText(/文本校对失败：真实模型校对只在 Mac \/ Windows 桌面端可用/)).toBeVisible()
})

test("稿件历史页可搜索", async ({ page }) => {
  await page.getByRole("button", { name: "稿件历史" }).click()
  await expect(page.getByRole("heading", { name: "稿件历史" })).toBeVisible()
  await page.getByLabel("搜索稿件历史").fill("不存在的稿件")
  await expect(page.getByText("还没有确认稿")).toBeVisible()
})

test("设置页明确浏览器只读边界", async ({ page }) => {
  await page.getByRole("button", { name: "设置与诊断" }).click()
  await expect(page.getByRole("heading", { name: "设置与诊断" })).toBeVisible()
  await expect(page.getByText(/浏览器只读预览/)).toBeVisible()
  await expect(page.getByText(/真实下载、转写、模型和凭据/)).toBeVisible()
})

test("窄桌面窗口保持主流程顺序且无根级横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 780, height: 760 })
  await expect(page.getByRole("heading", { name: "识别真实稿件" })).toBeVisible()
  await expect(page.getByRole("button", { name: "识别稿件" }).getByText("识别稿件")).toBeVisible()
  await expect(page.getByRole("button", { name: "稿件历史" }).getByText("稿件历史")).toBeVisible()
  const overflow = await page.locator(".skill-shell").evaluate((element) => element.scrollWidth > element.clientWidth)
  expect(overflow).toBe(false)
})

test("手机宽度改为顶部导航且无横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole("button", { name: "识别稿件" })).toBeVisible()
  await expect(page.getByRole("button", { name: "稿件历史" })).toBeVisible()
  const overflow = await page.evaluate(() => document.body.scrollWidth > document.body.clientWidth)
  expect(overflow).toBe(false)
})
