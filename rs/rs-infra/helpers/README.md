# rs_infra_helpers

## Usage:

```rust
    use rs_infra_helpers::fetcher::{BaseFetcher, BaseFetcherOptions, RequestOptions, TBaseFetcher};
    use reqwest::Method;

    let networkRequestOptions = NetworkRequestOptions {
        name: 'your_name',
        base_url: 'your_base_url',
        ..Default::default()
    };

    let networkRequest = NetworkRequest::new(networkRequestOptions);

    let requestOptions = RequestOptions {
        url: 'your_url',
        method: Method::GET,
        ..Default::default()
    };

    let response = network_request
        .get_fetcher()
        .send(request_options)
        .await?
        .text()
        .await?;

    println!("{response:#?}");
```
