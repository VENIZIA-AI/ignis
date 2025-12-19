use async_trait::async_trait;
use reqwest::header::{CONTENT_TYPE, HeaderMap, HeaderValue};

use crate::network::fetcher::base_fetcher::{BaseFetcher, BaseFetcherOptions, TBaseFetcher};

// --------------------------------------------------
#[derive(Debug, Default, Clone)]
pub struct NetworkRequestOptions {
    pub name: String,
    pub base_url: String,
    pub headers: Option<HeaderMap>,
}

// --------------------------------------------------
#[async_trait]
pub trait TNetworkRequest: Sized {
    fn new(options: NetworkRequestOptions) -> Self;

    fn get_fetcher(&self) -> &BaseFetcher;

    // async fn send<T: DeserializeOwned>(
    //     &self,
    //     options: RequestOptions,
    // ) -> Result<T, ApplicationError>;
}

// --------------------------------------------------
pub struct NetworkRequest {
    pub base_url: String,
    fetcher: BaseFetcher,
}

// --------------------------------------------------
#[async_trait]
impl TNetworkRequest for NetworkRequest {
    // --------------------------------------------------
    fn new(options: NetworkRequestOptions) -> Self {
        let NetworkRequestOptions {
            name,
            base_url,
            headers,
        } = options;

        let mut default_headers = headers.unwrap_or_default();

        default_headers
            .entry(CONTENT_TYPE)
            .or_insert(HeaderValue::from_static("application/json"));

        let fetcher_options = BaseFetcherOptions {
            name,
            base_url: base_url.clone(),
            headers: Some(default_headers),
            ..Default::default()
        };

        let fetcher = BaseFetcher::new(fetcher_options);

        NetworkRequest { base_url, fetcher }
    }

    // --------------------------------------------------
    fn get_fetcher(&self) -> &BaseFetcher {
        &self.fetcher
    }

    // --------------------------------------------------
    // async fn send<T: DeserializeOwned>(
    //     &self,
    //     options: RequestOptions,
    // ) -> Result<T, ApplicationError> {
    //     let response = self.fetcher.send(options).await.map_err(|e| {
    //         ApplicationError::new(ApplicationErrorOptions {
    //             message: format!("Network request failed: {}", e),
    //             ..Default::default()
    //         })
    //     })?;

    //     let status = response.status();

    //     if status.is_success() {
    //         let data = response.json::<T>().await.map_err(|e| {
    //             ApplicationError::new(ApplicationErrorOptions {
    //                 message: format!("Failed to parse response JSON: {}", e),
    //                 status_code: Some(status.as_u16()),
    //                 ..Default::default()
    //             })
    //         })?;
    //         Ok(data)
    //     } else {
    //         Err(ApplicationError::new(ApplicationErrorOptions {
    //             message: format!("HTTP Error: {}", status),
    //             status_code: Some(status.as_u16()),
    //             ..Default::default()
    //         }))
    //     }
    // }
}
