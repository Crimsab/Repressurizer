pub(super) fn steam_api_url(base_url: &str, path: &str) -> String {
    format!(
        "{}/{}",
        base_url.trim_end_matches('/'),
        path.trim_start_matches('/')
    )
}

pub(super) fn request_error(context: &str, error: reqwest::Error) -> String {
    format!("{context}: {}", error.without_url())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn request_errors_do_not_expose_secret_query_parameters() {
        let secret = "sentinel-steam-api-secret";
        let error = reqwest::Client::new()
            .get(format!("http://127.0.0.1:0/test?key={secret}"))
            .send()
            .await
            .expect_err("the reserved local port must refuse the connection");

        let message = request_error("Steam request failed", error);
        assert!(!message.contains(secret));
        assert!(!message.contains("key="));
    }
}
