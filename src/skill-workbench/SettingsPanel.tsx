import { CheckCircle2, KeyRound, LoaderCircle, RefreshCw, ServerCog, Wrench } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { isNativeDesktop, skillWorkbenchBridge } from "./skillWorkbenchBridge"
import type { LocalSettings, ProviderModels, SettingsUpdate } from "./types"

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function SettingsPanel({ onSettingsChanged }: { onSettingsChanged?: () => void }) {
  const [settings, setSettings] = useState<LocalSettings | null>(null)
  const [draft, setDraft] = useState<SettingsUpdate>({})
  const [models, setModels] = useState<ProviderModels | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setBusy("load")
    setError(null)
    try {
      const value = await skillWorkbenchBridge.getSettings()
      setSettings(value)
      if (value) {
        setDraft({
          llmMode: value.llmMode,
          llmModel: value.llmModel,
          llmApiBase: value.llmApiBase,
          asrModel: value.asrModel,
          asrApiBase: value.asrApiBase,
          skillSyncMode: value.skillSyncMode,
          skillRepositoryPath: value.skillRepositoryPath,
          skillRemote: value.skillRemote,
          skillRemoteUrl: value.skillRemoteUrl,
          skillBranch: value.skillBranch,
          networkProxy: value.networkProxy,
        })
      }
    } catch (reason) {
      setError(message(reason))
    } finally {
      setBusy(null)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const update = (patch: SettingsUpdate) => setDraft((current) => ({ ...current, ...patch }))
  const save = async () => {
    setBusy("save")
    setError(null)
    try {
      const value = await skillWorkbenchBridge.updateSettings(draft)
      setSettings(value)
      setDraft((current) => ({ ...current, llmApiKey: "", asrApiKey: "", douyinCookieString: "" }))
      const savedSecrets = [draft.llmApiKey, draft.asrApiKey, draft.douyinCookieString].some((value) => value?.trim())
      setNotice(savedSecrets ? "本机设置已保存；本次填写的密钥已进入系统凭据库。" : "本机设置已保存；本次没有新增或修改密钥。")
      onSettingsChanged?.()
      return true
    } catch (reason) {
      setError(message(reason))
      return false
    } finally {
      setBusy(null)
    }
  }

  const loadModels = async () => {
    if (!(await save())) return
    setBusy("models")
    setError(null)
    try {
      const value = await skillWorkbenchBridge.listProviderModels()
      setModels(value)
      if (value.recommendedModel) update({ llmModel: value.recommendedModel })
      setNotice(value.message)
    } catch (reason) {
      setError(message(reason))
    } finally {
      setBusy(null)
    }
  }

  const test = async () => {
    if (!(await save())) return
    setBusy("test")
    setError(null)
    try {
      const value = await skillWorkbenchBridge.testModelConnection()
      setNotice(`${value.message} · ${value.model}`)
    } catch (reason) {
      setError(message(reason))
    } finally {
      setBusy(null)
    }
  }


  const localAsr = draft.asrApiBase === "local://mlx-whisper"
  const chooseAsrBackend = (backend: "local" | "api") => update(backend === "local" ? {
    asrApiBase: "local://mlx-whisper",
    asrModel: "mlx-community/whisper-large-v3-turbo",
  } : {
    asrApiBase: draft.asrApiBase === "local://mlx-whisper" ? "https://api.openai.com/v1" : draft.asrApiBase,
    asrModel: (draft.asrModel ?? "").startsWith("mlx-community/") ? "whisper-1" : draft.asrModel,
  })

  if (!isNativeDesktop()) return <section className="settings-panel"><header><ServerCog size={17} /><div><h2>桌面运行时设置</h2><p>当前是浏览器只读预览。真实下载、转写、模型和凭据只在安装后的桌面端运行。</p></div></header></section>

  return <section className="settings-panel">
    <header><ServerCog size={17} /><div><h2>运行时设置</h2><p>模型与转写都在这里接入；密钥不写入数据库或运行日志。</p></div><button type="button" className="icon-command" title="刷新设置" onClick={() => void load()} disabled={busy !== null}>{busy === "load" ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}</button></header>
    {notice ? <div className="inline-notice is-success" role="status"><CheckCircle2 size={14} />{notice}</div> : null}
    {error ? <div className="inline-notice is-danger" role="alert">{error}</div> : null}

    <div className="settings-section">
      <div className="settings-title"><KeyRound size={15} /><strong>模型与转写连接</strong><span>{settings?.llmApiKeyConfigured ? "模型密钥已保存" : "模型密钥未配置"} · {settings?.asrBackend === "local_mlx" ? "本机转写无需密钥" : settings?.asrApiKeyConfigured ? "转写密钥已保存" : "转写密钥未配置"} · 网络：{settings?.networkProxySource ?? "检查中"}</span></div>
      <div className="settings-grid">
        <label>模型模式<select value={draft.llmMode ?? "offline"} onChange={(event) => update({ llmMode: event.target.value as LocalSettings["llmMode"] })}><option value="offline">offline</option><option value="optional">optional</option><option value="required">required</option></select></label>
        <label>文本模型<input value={draft.llmModel ?? ""} onChange={(event) => update({ llmModel: event.target.value })} /></label>
        <label>文本 API Base<input value={draft.llmApiBase ?? ""} onChange={(event) => update({ llmApiBase: event.target.value })} /></label>
        <label>文本 API Key<input type="password" value={draft.llmApiKey ?? ""} placeholder={settings?.llmApiKeyConfigured ? "已安全保存；留空不修改" : "保存到系统凭据库"} onChange={(event) => update({ llmApiKey: event.target.value })} /></label>
        <div className="settings-field"><span>转写方式</span><div className="segmented compact"><button type="button" className={localAsr ? "is-active" : ""} onClick={() => chooseAsrBackend("local")}>本机 MLX</button><button type="button" className={!localAsr ? "is-active" : ""} onClick={() => chooseAsrBackend("api")}>兼容 API</button></div></div>
        <label>转写模型<input value={draft.asrModel ?? ""} onChange={(event) => update({ asrModel: event.target.value })} /></label>
        {!localAsr ? <label>转写 API Base<input value={draft.asrApiBase ?? ""} onChange={(event) => update({ asrApiBase: event.target.value })} /></label> : null}
        {!localAsr ? <label>转写 API Key<input type="password" value={draft.asrApiKey ?? ""} placeholder="留空则复用文本 API Key" onChange={(event) => update({ asrApiKey: event.target.value })} /></label> : null}
        <label>网络代理（可选）<input value={draft.networkProxy ?? ""} placeholder="留空自动使用系统/环境代理" onChange={(event) => update({ networkProxy: event.target.value })} /></label>
        <label>yt-dlp 降级 Cookie（可选）<input type="password" value={draft.douyinCookieString ?? ""} placeholder={settings?.douyinCookieConfigured ? "已安全保存；留空不修改" : "无登录浏览器解析不需要 Cookie"} onChange={(event) => update({ douyinCookieString: event.target.value })} /></label>
      </div>
      {models?.models.length ? <label className="provider-model-select">服务商模型<select value={draft.llmModel ?? ""} onChange={(event) => update({ llmModel: event.target.value })}>{models.models.map((model) => <option value={model} key={model}>{model}</option>)}</select></label> : null}
      <div className="command-row"><button type="button" className="secondary-command" onClick={() => void save()} disabled={busy !== null}>保存设置</button><button type="button" className="secondary-command" onClick={() => void loadModels()} disabled={busy !== null}>{busy === "models" ? "读取中..." : "保存并拉取模型"}</button><button type="button" className="primary-command" onClick={() => void test()} disabled={busy !== null}>{busy === "test" ? "测试中..." : "测试模型连接"}</button></div>
    </div>

    <div className="settings-section">
      <div className="settings-title"><Wrench size={15} /><strong>真实运行依赖</strong><span>桌面端检查 PATH 与系统常见安装目录，不会显示虚假健康状态</span></div>
      <div className="tool-status-grid">{settings ? [["抖音无登录解析器", settings.douyinBrowser], ["yt-dlp 降级", settings.ytDlp], ["FFmpeg", settings.ffmpeg], ["MLX Whisper", settings.mlxWhisper]].map(([name, status]) => { const tool = status as LocalSettings["git"]; return <div key={name as string} className={tool.available ? "is-ready" : "is-missing"} title={tool.executablePath ?? tool.version}><strong>{name as string}</strong><span>{tool.version}</span></div> }) : null}</div>
    </div>
  </section>
}
