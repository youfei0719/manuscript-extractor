import { invoke } from "@tauri-apps/api/core"
import type {
  DiagnosticLog,
  LocalSettings,
  MediaExtractionResult,
  MediaProgress,
  ProviderModels,
  RuntimeHealth,
  SettingsUpdate,
  SourceRecord,
  TranscriptProofreadResult,
  RecognitionSession,
  TranscriptRecord,
  TranscriptExport,
  AppUpdateInfo,
} from "./types"

export interface PersistedRecognitionState {
  session: RecognitionSession
  records: TranscriptRecord[]
}

const browserDiagnosticLogs: DiagnosticLog[] = []

function normalizedDiagnosticLog(log: Partial<DiagnosticLog>): DiagnosticLog {
  return {
    id: log.id ?? `diagnostic-${crypto.randomUUID()}`,
    traceId: log.traceId ?? `ui-${crypto.randomUUID()}`,
    action: log.action ?? "ui.unknown",
    stage: log.stage ?? "interaction",
    status: log.status ?? "info",
    code: log.code ?? "UI_EVENT",
    message: log.message ?? "界面行为已记录",
    location: log.location ?? "SkillWorkbench.tsx",
    detail: log.detail ?? null,
    createdAt: log.createdAt ?? new Date().toISOString(),
  }
}

export function isNativeDesktop() {
  return "__TAURI_INTERNALS__" in window || window.location.protocol === "tauri:"
}

export const skillWorkbenchBridge = {
  async recordDiagnosticLog(log: Partial<DiagnosticLog>): Promise<DiagnosticLog> {
    const normalized = normalizedDiagnosticLog(log)
    if (isNativeDesktop()) return invoke<DiagnosticLog>("record_diagnostic_log", { log: normalized })
    browserDiagnosticLogs.unshift(normalized)
    return normalized
  },

  async listDiagnosticLogs(limit = 100): Promise<DiagnosticLog[]> {
    if (isNativeDesktop()) return invoke<DiagnosticLog[]>("list_diagnostic_logs", { limit })
    return browserDiagnosticLogs.slice(0, limit)
  },

  async clearDiagnosticLogs(): Promise<void> {
    if (isNativeDesktop()) {
      await invoke("clear_diagnostic_logs")
      return
    }
    browserDiagnosticLogs.splice(0, browserDiagnosticLogs.length)
  },

  async loadRecognition(): Promise<PersistedRecognitionState | null> {
    if (isNativeDesktop()) {
      return invoke<PersistedRecognitionState | null>("load_transcript_workbench_state")
    }
    return null
  },

  async saveRecognition(state: PersistedRecognitionState): Promise<void> {
    if (isNativeDesktop()) {
      await invoke("save_transcript_workbench_state", { state })
    }
  },

  async exportTranscript(record: TranscriptRecord, format: TranscriptExport["format"]): Promise<TranscriptExport> {
    const extension = format === "markdown" ? "md" : "txt"
    const content = format === "markdown"
      ? `# ${record.title}\n\n${record.confirmedTranscript.trim()}\n`
      : `${record.confirmedTranscript.trim()}\n`
    if (!isNativeDesktop()) {
      const blob = new Blob([content], { type: format === "markdown" ? "text/markdown;charset=utf-8" : "text/plain;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `${record.title || "确认稿"}.${extension}`
      anchor.click()
      URL.revokeObjectURL(url)
      return { format, path: anchor.download, exportedAt: new Date().toISOString() }
    }
    const { save } = await import("@tauri-apps/plugin-dialog")
    const path = await save({ defaultPath: `${record.title || "确认稿"}.${extension}`, filters: [{ name: format === "markdown" ? "Markdown" : "文本", extensions: [extension] }] })
    if (!path) throw new Error("已取消导出")
    await invoke("export_transcript", { path, content })
    return { format, path, exportedAt: new Date().toISOString() }
  },

  async selectLocalMedia(browserFile?: File): Promise<SourceRecord | null> {
    if (!isNativeDesktop()) {
      if (!browserFile) return null
      return {
        id: `source-${crypto.randomUUID()}`,
        mode: "local_media",
        label: browserFile.name,
        value: browserFile.name,
        authorized: true,
        mediaLocalOnly: true,
        createdAt: new Date().toISOString(),
      }
    }
    const { open } = await import("@tauri-apps/plugin-dialog")
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "视频或音频", extensions: ["mp4", "mov", "m4v", "webm", "mp3", "m4a", "wav", "aac", "flac"] }],
    })
    if (typeof selected !== "string") return null
    const tasks = await invoke<Array<{ id: string; media: { fileName: string; path: string } }>>("import_media", { paths: [selected] })
    const task = tasks[0]
    if (!task) return null
    return {
      id: task.id,
      mode: "local_media",
      label: task.media.fileName,
      value: task.media.path,
      authorized: true,
      mediaLocalOnly: true,
      createdAt: new Date().toISOString(),
    }
  },

  async runtimeHealth(): Promise<RuntimeHealth> {
    if (isNativeDesktop()) return invoke<RuntimeHealth>("runtime_health")
    return {
      mode: "browser",
      database: "unavailable",
      mediaPipeline: {
        status: "unavailable",
        label: "浏览器预览不运行本机媒体链",
        version: "not-available",
        protocolVersion: "native-v1",
      },
      credentialStore: "unavailable",
      checkedAt: new Date().toISOString(),
    }
  },

  async processMedia(mode: "douyin_link" | "local_media", input: string): Promise<MediaExtractionResult> {
    if (!isNativeDesktop()) throw new Error("真实下载与转写只在 Mac / Windows 桌面端可用")
    return invoke<MediaExtractionResult>("process_media_source", { request: { mode, input } })
  },

  async proofreadTranscript(transcript: string): Promise<TranscriptProofreadResult> {
    if (!isNativeDesktop()) throw new Error("真实模型校对只在 Mac / Windows 桌面端可用")
    return invoke<TranscriptProofreadResult>("proofread_transcript", { request: { transcript } })
  },

  async getSettings(): Promise<LocalSettings | null> {
    if (!isNativeDesktop()) return null
    return invoke<LocalSettings>("get_local_settings")
  },

  async updateSettings(update: SettingsUpdate): Promise<LocalSettings> {
    if (!isNativeDesktop()) throw new Error("本机设置只在 Mac / Windows 桌面端可用")
    return invoke<LocalSettings>("update_local_settings", { update })
  },

  async listProviderModels(): Promise<ProviderModels> {
    if (!isNativeDesktop()) throw new Error("模型连接只在 Mac / Windows 桌面端可用")
    return invoke<ProviderModels>("list_provider_models")
  },

  async testModelConnection(): Promise<{ passed: boolean; model: string; message: string }> {
    if (!isNativeDesktop()) throw new Error("模型连接只在 Mac / Windows 桌面端可用")
    return invoke("test_model_connection")
  },

  async checkForUpdate(): Promise<AppUpdateInfo | null> {
    if (!isNativeDesktop()) return null
    try {
      const { check } = await import("@tauri-apps/plugin-updater")
      const update = await check()
      if (!update) return null
      return {
        currentVersion: update.currentVersion,
        version: update.version,
        date: update.date ?? null,
        body: update.body ?? "本次更新暂无详细说明。",
      }
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : String(reason)
      if (/404|latest\.json|endpoint/i.test(detail)) throw new Error("更新信息暂不可用。最新版本正在发布中，请稍后再试。")
      throw new Error("无法连接更新服务，请检查网络后重试。")
    }
  },

  async installUpdate(): Promise<void> {
    if (!isNativeDesktop()) throw new Error("应用内更新只在安装后的桌面端可用")
    const { check } = await import("@tauri-apps/plugin-updater")
    const update = await check()
    if (!update) throw new Error("当前已经是最新版本")
    await update.downloadAndInstall()
    const { relaunch } = await import("@tauri-apps/plugin-process")
    await relaunch()
  },

  async onMediaProgress(handler: (progress: MediaProgress) => void): Promise<() => void> {
    if (!isNativeDesktop()) return () => undefined
    const { listen } = await import("@tauri-apps/api/event")
    return listen<MediaProgress>("media-progress", (event) => handler(event.payload))
  },

}
