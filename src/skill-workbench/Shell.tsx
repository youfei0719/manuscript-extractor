import { FileText, History, Settings2 } from "lucide-react"
import manuscriptExtractorLogo from "../assets/manuscript-extractor-logo.png"
import { useEffect, useRef, type ReactNode } from "react"
import type { RecognitionPage } from "./types"

export function WorkbenchShell({ page, onPageChange, onSettings, children }: { page: RecognitionPage; onPageChange: (page: RecognitionPage) => void; onSettings: () => void; children: ReactNode }) {
  const mainRef = useRef<HTMLElement>(null)
  useEffect(() => { mainRef.current?.scrollTo({ top: 0, left: 0 }) }, [page])
  return <div className="skill-shell">
    <aside className="skill-sidebar" aria-label="稿件提取主导航">
      <div className="skill-brand"><span className="brand-mark"><img src={manuscriptExtractorLogo} alt="稿件提取 logo" /></span><div><strong>稿件提取</strong><small>短视频稿件提取工作台</small></div></div>
      <nav><div className="nav-group"><span>主流程</span><button type="button" aria-label="识别稿件" aria-current={page === "recognize" ? "page" : undefined} className={page === "recognize" ? "is-active" : ""} onClick={() => onPageChange("recognize")}><FileText size={15} /><strong>识别稿件</strong></button></div><div className="nav-group"><span>记录</span><button type="button" aria-label="稿件历史" aria-current={page === "history" ? "page" : undefined} className={page === "history" ? "is-active" : ""} onClick={() => onPageChange("history")}><History size={15} /><strong>稿件历史</strong></button></div></nav>
      <button type="button" aria-label="设置与诊断" title="设置与诊断" className={`sidebar-settings${page === "settings" ? " is-active" : ""}`} onClick={onSettings}><Settings2 size={15} /><strong>设置与诊断</strong></button>
      <div className="main-path"><span>工作边界</span><p>只识别、转写和校对经授权的真实稿件，确认稿保存在本机。</p></div>
    </aside>
    <div className="skill-main"><header className="asset-header"><div><span>稿件识别主线</span><strong>授权来源 → 真实稿件 → AI 校对 → 确认稿</strong></div><div className="team-account"><FileText size={14} /><strong>本机工作区</strong><small>原始媒体不会进入历史稿件</small></div></header><main ref={mainRef}>{children}</main></div>
  </div>
}
