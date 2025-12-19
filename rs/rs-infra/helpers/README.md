# rs_infra_helpers

RSAX Macros

Usage

```rust
use rs_infra_helpers::fetcher::{BaseFetcher, BaseFetcherOptions, RequestOptions, TBaseFetcher};

use reqwest::Method;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let token = "your_token";

    let base_url = "your_base_url";

    let opts = BaseFetcherOptions {
        base_url: base_url.to_string(),
        ..Default::default()
    };

    let fetcher = BaseFetcher::new(opts);

    let who_am_i_url = "/auth/who-am-i";

    let options = RequestOptions {
        url: who_am_i_url.to_string(),
        method: Method::GET,
        bearer_auth: Some(token.to_string()),
        ..Default::default()
    };

    let resp = fetcher.send(options).await?.text().await?;

    println!("{resp:#?}");

    Ok(())
}
```
