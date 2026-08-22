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
        if error.contains("拒绝请求") || error.contains("API 密钥") || error.contains("HTTP 401") || error.contains("HTTP 403") {
            return "MEDIA_TRANSCRIPTION_AUTH_FAILED";
        }
        if error.contains("请求过于频繁") || error.contains("HTTP 429") {
            return "MEDIA_TRANSCRIPTION_RATE_LIMITED";
        }
        if error.contains("暂时不可用") || error.contains("HTTP 500") || error.contains("HTTP 502") || error.contains("HTTP 503") || error.contains("HTTP 504") {
            return "MEDIA_TRANSCRIPTION_PROVIDER_UNAVAILABLE";
        }
        if error.contains("连接失败") || error.contains("timed out") || error.contains("connection") {
            return "MEDIA_TRANSCRIPTION_CONNECTION_FAILED";
        }
        if error.contains("转写结果") || error.contains("有效 JSON") || error.contains("text 字段") {
            return "MEDIA_TRANSCRIPTION_RESULT_INVALID";
        }
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
        if error.contains("拒绝请求") || error.contains("API 密钥") || error.contains("HTTP 401") || error.contains("HTTP 403") {
            return "LLM_AUTH_FAILED";
        }
        if error.contains("请求过于频繁") || error.contains("HTTP 429") {
            return "LLM_RATE_LIMITED";
        }
        if error.contains("暂时不可用") || error.contains("HTTP 500") || error.contains("HTTP 502") || error.contains("HTTP 503") || error.contains("HTTP 504") {
            return "LLM_PROVIDER_UNAVAILABLE";
        }
        if error.contains("连接失败") || error.contains("timed out") || error.contains("connection") {
            return "LLM_CONNECTION_FAILED";
        }
        if error.contains("模型内容不是有效 JSON") || error.contains("模型响应不是 JSON") || error.contains("可解析的文本内容") || error.contains("模型结果缺少") {
            return "LLM_RESPONSE_INVALID";
        }
        return "LLM_REQUEST_FAILED";
    }
    if action.contains("transcription") {
        if error.contains("拒绝请求") || error.contains("API 密钥") || error.contains("HTTP 401") || error.contains("HTTP 403") {
            return "MEDIA_TRANSCRIPTION_AUTH_FAILED";
        }
        if error.contains("请求过于频繁") || error.contains("HTTP 429") {
            return "MEDIA_TRANSCRIPTION_RATE_LIMITED";
        }
        if error.contains("暂时不可用") || error.contains("HTTP 500") || error.contains("HTTP 502") || error.contains("HTTP 503") || error.contains("HTTP 504") {
            return "MEDIA_TRANSCRIPTION_PROVIDER_UNAVAILABLE";
        }
        if error.contains("连接失败") || error.contains("timed out") || error.contains("connection") {
            return "MEDIA_TRANSCRIPTION_CONNECTION_FAILED";
        }
        if error.contains("转写结果") || error.contains("有效 JSON") || error.contains("text 字段") {
            return "MEDIA_TRANSCRIPTION_RESULT_INVALID";
        }
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
        let normalized = detail.trim().to_ascii_lowercase();
        if normalized.contains("upstream authentication failed") {
            return format!("{service}上游认证失败（HTTP {status}），请在服务商控制台检查分组和上游账号状态。")
        }
        if normalized.contains("upstream access forbidden") {
            return format!("{service}上游拒绝访问（HTTP {status}），请更换可用分组或联系服务商管理员。")
        }
        if normalized.contains("all available accounts exhausted") {
            return format!("{service}上游可用账号已耗尽（HTTP {status}），请稍后重试或切换模型/分组。")
        }
        if normalized.contains("no available accounts") {
            return format!("{service}当前分组没有可用上游账号（HTTP {status}），请更换分组或稍后重试。")
        }
        if normalized.contains("upstream service overloaded") {
            return format!("{service}上游服务过载（HTTP {status}），请稍后重试。")
        }
        let safe_detail = sanitize_detail(detail);
        if !safe_detail.is_empty()
            && safe_detail.len() <= 180
            && !safe_detail.starts_with('{')
            && !safe_detail.to_ascii_lowercase().contains("error code")
        {
            return format!("{service}服务暂时不可用（HTTP {status}）：{safe_detail}")
        }
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

    #[test]
    fn preserves_actionable_upstream_502_causes_without_sensitive_details() {
        assert_eq!(
            provider_error("模型", 502, "Upstream authentication failed, please contact administrator"),
            "模型上游认证失败（HTTP 502），请在服务商控制台检查分组和上游账号状态。"
        );
        assert!(provider_error("模型", 502, "Upstream service temporarily unavailable").contains("Upstream service temporarily unavailable"));
        assert!(!provider_error("模型", 502, "Bearer sk-secret").contains("sk-secret"));
    }

    #[test]
    fn classifies_llm_failures_by_root_cause() {
        assert_eq!(failure_code("llm.proofread", "模型服务暂时不可用（HTTP 502）"), "LLM_PROVIDER_UNAVAILABLE");
        assert_eq!(failure_code("llm.proofread", "模型服务拒绝请求，请检查服务地址和对应的 API 密钥。"), "LLM_AUTH_FAILED");
        assert_eq!(failure_code("llm.proofread", "模型服务当前请求过于频繁，请稍后重试。"), "LLM_RATE_LIMITED");
        assert_eq!(failure_code("llm.proofread", "模型连接失败：timed out"), "LLM_CONNECTION_FAILED");
        assert_eq!(failure_code("llm.proofread", "模型内容不是有效 JSON"), "LLM_RESPONSE_INVALID");
        assert_eq!(failure_code("llm.proofread", "模型请求失败（HTTP 400）：参数错误"), "LLM_REQUEST_FAILED");
    }
}
