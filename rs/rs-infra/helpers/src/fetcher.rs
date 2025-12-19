use async_trait::async_trait;
use reqwest::{
    Client, Error, Method, RequestBuilder, Response,
    header::{CONTENT_TYPE, HeaderMap, HeaderValue},
};
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
    pub name: Option<String>,
    pub base_url: String,
    pub headers: Option<HeaderMap>,
    pub timeout: Option<Duration>,
}

// --------------------------------------------------
#[derive(Debug, Clone)]
pub struct BaseFetcher {
    pub name: Option<String>,
    pub base_url: String,
    client: Client,
}

// --------------------------------------------------
#[async_trait]
pub trait TBaseFetcher: Sized {
    fn new(options: BaseFetcherOptions) -> Self;

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
        let mut default_headers = headers.unwrap_or_default();

        default_headers
            .entry(CONTENT_TYPE)
            .or_insert(HeaderValue::from_static("application/json"));

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
    async fn send(&self, options: RequestOptions) -> Result<Response, Error> {
        let full_url = format!(
            "{}/{}",
            self.base_url.trim_end_matches('/'),
            options.url.trim_start_matches('/')
        );

        let mut rb: RequestBuilder = self.client.request(options.method, &full_url);

        if let Some(headers_data) = options.headers {
            rb = rb.headers(headers_data);
        }

        if let Some(bearer_auth_data) = options.bearer_auth {
            rb = rb.bearer_auth(bearer_auth_data);
        }

        if let Some(body_data) = options.body {
            rb = rb.json(&body_data);
        }

        if let Some(query_data) = options.query {
            rb = rb.query(&query_data);
        }

        rb.send().await
    }
}
