import { ArrowDownToLine, CalendarDays, CheckCircle2, CircleAlert, LoaderCircle, X } from "lucide-react"
import { useState } from "react"
import type { AppUpdateInfo } from "./types"

export function UpdateDialog({ update, onClose, onInstall }: { update: AppUpdateInfo; onClose: () => void; onInstall: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const install = async () => {
    setBusy(true)
    setError(null)
    try { await onInstall() } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setBusy(false) }
  }
  const notes = update.body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  return <div className="update-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="update-dialog" role="dialog" aria-modal="true" aria-labelledby="update-title">
      <header><div className="update-icon"><ArrowDownToLine size={19} /></div><div><span>发现新版本</span><h2 id="update-title">稿件提取 {update.version}</h2></div><button type="button" className="icon-command" title="关闭" onClick={onClose} disabled={busy}><X size={16} /></button></header>
      <div className="update-version-row"><strong>当前版本 {update.currentVersion}</strong><span>→</span><strong className="is-new">新版本 {update.version}</strong>{update.date ? <small><CalendarDays size={13} />{new Date(update.date).toLocaleDateString("zh-CN")}</small> : null}</div>
      <div className="update-notes"><strong>本次更新</strong>{notes.length ? <ul>{notes.map((line, index) => <li key={`${line}-${index}`}>{line.replace(/^[-*]\s*/, "")}</li>)}</ul> : <p>本次更新暂无详细说明。</p>}</div>
      {error ? <div className="inline-notice is-danger"><CircleAlert size={14} />{error}</div> : null}
      <footer><button type="button" className="secondary-command" onClick={onClose} disabled={busy}>稍后更新</button><button type="button" className="primary-command" onClick={() => void install()} disabled={busy}>{busy ? <><LoaderCircle className="spin" size={15} />正在下载并安装...</> : <><CheckCircle2 size={15} />立即更新并重启</>}</button></footer>
    </section>
  </div>
}
