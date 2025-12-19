use reqwest::Method;
use rs_infra::network::{
    fetcher::base_fetcher::{RequestOptions, TBaseFetcher},
    network_request::{NetworkRequest, NetworkRequestOptions, TNetworkRequest},
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJXbVhzM2JXYmFaOC9GcDdZaEdWeWFEcnNKL2tMdFFsRTNoQzlhTTdPNUhrPSI6IkFONHBwTkdSWW9lbkwwNmIxN0RTTlovc3ZBbGUwSi9YbWtBalhrSDJpbXM9IiwibXVZN0lYYmhxbWRKT3AyUGlRTEhYY0swaFdwM2x2U2EvTE1PeThpRU44QT0iOiJORldxTmFNblFvdHY0eUgrK0FuUmdkSmRNaTYvVEgrRkF2cHE3NWlvMlpFPSIsIndYd3VXblNFUWs5OXM5eTZpYUU4cDlHbm1XNjNvcUdtSFhrWEtFbEFWSU09IjoiSGVaOVkzaWhleGVPVW1QZ0dSNnhsN3E5N3J0SVZKa0d6akM1QzR6N0RBST0iLCJ2dThUdWk0Rk0wbFZuNnpFMXRpNU9kNEZOaGowS3pyRUx2ajhXb1RYWDJBPSI6IllrcmU1ZXRLbEZzTzlUQWRjTGRtYXBsYzJkblZyakRIU2lhOUJ5akRsMXM9IiwiaWF0IjoxNzY1OTY4NjE4LCJleHAiOjE3NjYzMzYzOTl9.9lkRD7PcGcEH9mZwFeiOGQ8VVb_u2GdusXffkHeAtw8";

    let base_url = "https://develop.nx-seller-be.eventry.phatnt.com/v1/api";

    println!("Using base URL: {}", base_url);

    let network_request_options = NetworkRequestOptions {
        name: "RS_INFRA".to_string(),
        base_url: base_url.to_string(),
        ..Default::default()
    };

    let network_request = NetworkRequest::new(network_request_options);

    let request_options = RequestOptions {
        url: "/auth/who-am-i".to_string(),
        method: Method::GET,
        bearer_auth: Some(token.to_string()),
        ..Default::default()
    };

    let response = network_request
        .get_fetcher()
        .send(request_options)
        .await?
        .text()
        .await?;

    println!("{response:#?}");

    Ok(())
}
