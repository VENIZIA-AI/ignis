use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fmt;

// --------------------------------------------------
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ApplicationError {
    pub status_code: u16,
    pub message_code: Option<String>,
    pub message: String,
    pub payload: Option<Value>,
}

// --------------------------------------------------
#[derive(Debug, Default, Clone)]
pub struct ApplicationErrorOptions {
    pub message: String,
    pub status_code: Option<u16>,
    pub message_code: Option<String>,
    pub payload: Option<Value>,
}

// --------------------------------------------------
impl ApplicationError {
    pub fn new(options: ApplicationErrorOptions) -> Self {
        Self {
            message: options.message,
            status_code: options.status_code.unwrap_or(400),
            message_code: options.message_code,
            payload: options.payload,
        }
    }
}

// --------------------------------------------------
impl fmt::Display for ApplicationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "ApplicationError [{}]: {}",
            self.status_code, self.message,
        )
    }
}

// --------------------------------------------------
impl std::error::Error for ApplicationError {}
