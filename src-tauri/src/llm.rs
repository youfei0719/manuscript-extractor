use crate::audit;
use crate::db::DesktopDb;
use crate::settings::{api_client, load_settings, read_secret};
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProofreadRequest {
    pub transcript: String,
}

fn endpoint(base: &str, path: &str) -> String {
    format!(
        "{}/{}",
        base.trim_end_matches('/'),
        path.trim_start_matches('/')
    )
}

fn json_content(value: &Value) -> Result<String, String> {
    let content = value
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .ok_or_else(|| "模型没有返回可解析的文本内容".to_string())?;
    let trimmed = content.trim();
    if let Some(rest) = trimmed.strip_prefix("```json") {
        return Ok(rest.trim().trim_end_matches("```").trim().to_string());
    }
    if let Some(rest) = trimmed.strip_prefix("```") {
        return Ok(rest.trim().trim_end_matches("```").trim().to_string());
    }
    Ok(trimmed.to_string())
}

async fn chat_json(db: &DesktopDb, system: &str, user: &str) -> Result<(Value, String), String> {
    let settings = load_settings(db)?;
    if settings.llm_mode == "offline" {
        return Err("模型模式为 offline；请先在系统诊断配置真实模型连接".into());
    }
    if settings.llm_model.trim().is_empty() {
        return Err("尚未配置模型名称".into());
    }
    let key = read_secret("llm_api_key")?
        .ok_or_else(|| "尚未在系统凭据库保存模型 API Key".to_string())?;
    let body = json!({
        "model": settings.llm_model,
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user}
        ]
    });
    let (http, _) = api_client(&settings, 120)?;
    let url = endpoint(&settings.llm_api_base, "chat/completions");
    let response = http
        .post(&url)
        .bearer_auth(&key)
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("模型连接失败：{error}"))?;
    let mut status = response.status();
    let mut raw = response.text().await.map_err(|error| error.to_string())?;
    if status == reqwest::StatusCode::BAD_REQUEST
        && raw.to_ascii_lowercase().contains("response_format")
    {
        let mut fallback = body.clone();
        fallback
            .as_object_mut()
            .map(|object| object.remove("response_format"));
        let response = http
            .post(&url)
            .bearer_auth(&key)
            .json(&fallback)
            .send()
            .await
            .map_err(|error| format!("模型兼容请求失败：{error}"))?;
        status = response.status();
        raw = response.text().await.map_err(|error| error.to_string())?;
    }
    if !status.is_success() {
        let detail = serde_json::from_str::<Value>(&raw)
            .ok()
            .and_then(|value| {
                value
                    .pointer("/error/message")
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned)
            })
            .unwrap_or_else(|| raw.chars().take(300).collect());
        return Err(audit::provider_error("模型", status.as_u16(), &detail));
    }
    let envelope: Value =
        serde_json::from_str(&raw).map_err(|error| format!("模型响应不是 JSON：{error}"))?;
    let parsed = serde_json::from_str(&json_content(&envelope)?)
        .map_err(|error| format!("模型内容不是有效 JSON：{error}"))?;
    Ok((parsed, settings.llm_model))
}

fn required_text(value: &Value, key: &str) -> Result<String, String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .ok_or_else(|| format!("模型结果缺少 {key}"))
}

pub async fn proofread_transcript(db: &DesktopDb, request: ProofreadRequest) -> Result<Value, String> {
    let transcript = request.transcript.trim();
    if transcript.chars().count() < 40 {
        return Err("真实稿件至少需要 40 个字才能校对".into());
    }
    let system = r#"你是中文短视频口播稿校对编辑。只依据给出的 ASR 真实转写稿，识别错别字、同音误识别、明显漏字、重复字和会改变上下文语义的错误。绝不补造未出现的事实、人名、数字或情节；无法确认的内容必须放入 uncertainties，不得擅自改写。先按语义组织自然段，再返回 JSON：formattedTranscript（保留全部原意、以空行分隔自然段的完整稿件）、corrections（数组，每项含 original、replacement、reason、confidence；confidence 为 0-100 整数）、uncertainties（字符串数组）。没有可确认修改时 corrections 返回空数组。"#;
    let user = format!("请校对并分段以下真实转写稿：\n\n{}", transcript);
    let (value, model) = chat_json(db, system, &user).await?;
    let formatted = required_text(&value, "formattedTranscript")?;
    let corrections = value
        .get("corrections")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .enumerate()
                .filter_map(|(index, item)| {
                    let original = item.get("original").and_then(Value::as_str)?.trim();
                    let replacement = item.get("replacement").and_then(Value::as_str)?.trim();
                    let reason = item.get("reason").and_then(Value::as_str)?.trim();
                    if original.is_empty() || replacement.is_empty() || original == replacement || reason.is_empty() {
                        return None;
                    }
                    let confidence = item.get("confidence").and_then(Value::as_f64).unwrap_or(0.0).clamp(0.0, 100.0).round() as u8;
                    Some(json!({
                        "id": format!("correction-{}", index + 1),
                        "original": original,
                        "replacement": replacement,
                        "reason": reason,
                        "confidence": confidence,
                        "status": "pending"
                    }))
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let uncertainties = value
        .get("uncertainties")
        .and_then(Value::as_array)
        .map(|items| items.iter().filter_map(Value::as_str).map(str::trim).filter(|item| !item.is_empty()).collect::<Vec<_>>())
        .unwrap_or_default();
    Ok(json!({
        "originalTranscript": transcript,
        "formattedTranscript": formatted,
        "corrections": corrections,
        "uncertainties": uncertainties,
        "provider": model
    }))
}

pub async fn list_models(db: &DesktopDb) -> Result<Value, String> {
    let key = read_secret("llm_api_key")?.ok_or_else(|| "尚未保存模型 API Key".to_string())?;
    let settings = load_settings(db)?;
    let (http, _) = api_client(&settings, 120)?;
    let response = http
        .get(endpoint(&settings.llm_api_base, "models"))
        .bearer_auth(key)
        .send()
        .await
        .map_err(|error| format!("拉取模型失败：{error}"))?;
    let status = response.status();
    let value: Value = response.json().await.map_err(|error| error.to_string())?;
    if !status.is_success() {
        return Err(value
            .pointer("/error/message")
            .and_then(Value::as_str)
            .unwrap_or("模型服务拒绝请求")
            .to_string());
    }
    let mut models: Vec<String> = value
        .get("data")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| {
            item.get("id")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
        })
        .collect();
    models.sort();
    models.truncate(200);
    let recommended = if models.contains(&settings.llm_model) {
        settings.llm_model
    } else {
        models
            .iter()
            .find(|model| model.contains("gpt-4.1-mini"))
            .cloned()
            .or_else(|| models.first().cloned())
            .unwrap_or_default()
    };
    Ok(
        json!({"models": models, "recommendedModel": recommended, "message": "已从服务商读取真实模型列表"}),
    )
}

pub async fn test_connection(db: &DesktopDb) -> Result<Value, String> {
    let (value, model) = chat_json(
        db,
        "只返回 JSON：{\"ok\":true,\"message\":\"连接正常\"}",
        "测试模型连接，不要输出其他内容。",
    )
    .await?;
    let passed = value.get("ok").and_then(Value::as_bool).unwrap_or(false);
    Ok(json!({
        "passed": passed,
        "model": model,
        "message": if passed { "模型连接与 JSON 输出均正常" } else { "模型已响应，但未通过结构化输出检查" }
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_fenced_json_content() {
        let value = json!({"choices":[{"message":{"content":"```json\n{\"ok\":true}\n```"}}]});
        assert_eq!(json_content(&value).unwrap(), "{\"ok\":true}");
    }
}
