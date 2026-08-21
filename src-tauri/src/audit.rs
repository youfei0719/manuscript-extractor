use crate::db::DesktopDb;
use regex::Regex;
use serde_json::{json, Value};

pub fn record(
    db: &DesktopDb,
    trace_id: &str,
    action: &str,
    stage: &str,
    status: &str,
    code: &str,
    message: &str,
    location: &str,
    detail: Option<&str>,
) -> Result<Value, String> {
    let safe_detail = detail.map(sanitize_detail);
    db.record_diagnostic_log(&json!({
        "traceId": trace_id,
        "action": action,
        "stage": stage,
        "status": status,
        "code": code,
        "message": message,
        "location": location,
        "detail": safe_detail,
    })).map_err(|error| error.to_string())
}

pub fn failure_code(action: &str, error: &str) -> &'static str {
    if action == "media.process" {
        if error.contains("本机 MLX Whisper") {
            return "MEDIA_LOCAL_TRANSCRIPTION_FAILED";
        }
        if error.contains("无法读取本机转写结果") || error.contains("No such file or directory") {
            return "MEDIA_TRANSCRIPT_RESULT_MISSING";
        }
        if error.contains("yt-dlp") || error.contains("抖音") {
            return "MEDIA_DOWNLOAD_FAILED";
        }
        if error.contains("FFmpeg") || error.contains("ffmpeg") {
            return "MEDIA_AUDIO_EXTRACTION_FAILED";
        }
        if error.contains("转写") || error.contains("audio/transcriptions") {
            return "MEDIA_TRANSCRIPTION_FAILED";
        }
        return "MEDIA_PROCESS_FAILED";
    }
    if action.starts_with("llm.") {
        if error.contains("尚未配置") || error.contains("凭据库") || error.contains("offline") {
            return "LLM_CONFIGURATION_REQUIRED";
        }
        if error.contains("模型请求失败") || error.contains("模型连接失败") {
            return "LLM_REQUEST_FAILED";
        }
        return "LLM_RESPONSE_INVALID";
    }
    if action.starts_with("publish.") { return "PUBLISH_OPERATION_FAILED"; }
    "RUNTIME_OPERATION_FAILED"
}

pub fn sanitize_detail(value: &str) -> String {
    let mut output = value.replace('\n', " ").replace('\r', " ");
    for pattern in [r"sk-[A-Za-z0-9._-]+", r"Bearer\s+[^\s]+", r"https?://[^\s]+", r"/(Users|private|var)/[^\s]+"] {
        if let Ok(regex) = Regex::new(pattern) {
            output = regex.replace_all(&output, "[已脱敏]").into_owned();
        }
    }
    output.chars().take(1200).collect()
}

pub fn provider_error(service: &str, status: u16, detail: &str) -> String {
    if matches!(status, 401 | 403) {
        return format!("{service}服务拒绝请求，请检查服务地址和对应的 API 密钥。")
    }
    if status == 429 {
        return format!("{service}服务当前请求过于频繁，请稍后重试。")
    }
    if (500..=599).contains(&status) {
        return format!("{service}服务暂时不可用（HTTP {status}），请稍后重试；若持续失败，请检查服务商状态或切换模型。")
    }
    format!(
        "{service}请求失败（HTTP {status}）：{}",
        sanitize_detail(detail)
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitizes_credentials_urls_and_paths() {
        let value = sanitize_detail("Bearer abc https://example.test/a sk-secret /Users/a/video.mp4");
        assert!(!value.contains("abc"));
        assert!(!value.contains("example.test"));
        assert!(!value.contains("/Users/a"));
    }

    #[test]
    fn hides_provider_credentials_from_user_errors() {
        let value = provider_error("转写", 401, "Incorrect API key provided: sensitive-token");
        assert_eq!(value, "转写服务拒绝请求，请检查服务地址和对应的 API 密钥。");
        assert!(!value.contains("sensitive-token"));
    }

    #[test]
    fn gives_actionable_transient_provider_error() {
        let value = provider_error("模型", 502, "error code: 502");
        assert!(value.contains("暂时不可用"));
        assert!(!value.contains("error code"));
    }
}
