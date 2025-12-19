use async_trait::async_trait;
use reqwest::{Client, Error, Method, RequestBuilder, Response, header::HeaderMap};
use serde_json::Value;
use std::time::Duration;

const TIME_OUT: Duration = Duration::from_mins(1);

// --------------------------------------------------
#[derive(Debug, Default)]
pub struct RequestOptions {
    pub url: String,
    pub method: Method,

    pub headers: Option<HeaderMap>,
    pub bearer_auth: Option<String>,

    pub body: Option<Value>,
    pub query: Option<Value>,
}

// --------------------------------------------------
#[derive(Debug, Default, Clone)]
pub struct BaseFetcherOptions {
    pub name: String,
    pub base_url: String,
    pub headers: Option<HeaderMap>,
    pub timeout: Option<Duration>,
}

// --------------------------------------------------
#[derive(Debug, Clone)]
pub struct BaseFetcher {
    pub name: String,
    pub base_url: String,
    client: Client,
}

// --------------------------------------------------
#[async_trait]
pub trait TBaseFetcher: Sized {
    fn new(options: BaseFetcherOptions) -> Self;

    fn get_request_url(&self, path: &str) -> String;

    async fn send(&self, options: RequestOptions) -> Result<Response, Error>;

    async fn get(&self, options: RequestOptions) -> Result<Response, Error> {
        let opts = RequestOptions {
            method: Method::GET,
            ..options
        };
        self.send(opts).await
    }

    async fn post(&self, options: RequestOptions) -> Result<Response, Error> {
        let opts = RequestOptions {
            method: Method::POST,
            ..options
        };
        self.send(opts).await
    }

    async fn put(&self, options: RequestOptions) -> Result<Response, Error> {
        let opts = RequestOptions {
            method: Method::PUT,
            ..options
        };
        self.send(opts).await
    }

    async fn patch(&self, options: RequestOptions) -> Result<Response, Error> {
        let opts = RequestOptions {
            method: Method::PATCH,
            ..options
        };
        self.send(opts).await
    }

    async fn delete(&self, options: RequestOptions) -> Result<Response, Error> {
        let opts = RequestOptions {
            method: Method::DELETE,
            ..options
        };
        self.send(opts).await
    }
}

#[async_trait]
impl TBaseFetcher for BaseFetcher {
    // --------------------------------------------------
    fn new(options: BaseFetcherOptions) -> Self {
        let BaseFetcherOptions {
            name,
            base_url,
            headers,
            timeout,
        } = options;

        let timeout_value: Duration = timeout.unwrap_or(TIME_OUT);
        let default_headers = headers.unwrap_or_default();

        let client = Client::builder()
            .timeout(timeout_value)
            .default_headers(default_headers)
            .build()
            .unwrap_or_else(|_| Client::new());

        let fetcher = BaseFetcher {
            name,
            base_url,
            client,
        };

        println!(
            "Creating new network request worker instance! Name: {:?}",
            fetcher.name
        );

        fetcher
    }

    // --------------------------------------------------
    fn get_request_url(&self, path: &str) -> String {
        format!(
            "{}/{}",
            self.base_url.trim_end_matches('/'),
            path.trim_start_matches('/')
        )
    }

    // --------------------------------------------------
    async fn send(&self, options: RequestOptions) -> Result<Response, Error> {
        let RequestOptions {
            url,
            method,
            headers,
            bearer_auth,
            body,
            query,
        } = options;

        let url: String = self.get_request_url(&url);

        let mut rb: RequestBuilder = self.client.request(method, &url);

        if let Some(headers_data) = headers {
            rb = rb.headers(headers_data);
        }

        if let Some(bearer_auth_data) = bearer_auth {
            rb = rb.bearer_auth(bearer_auth_data);
        }

        if let Some(body_data) = body {
            rb = rb.json(&body_data);
        }

        if let Some(query_data) = query {
            rb = rb.query(&query_data);
        }

        rb.send().await
    }
}
