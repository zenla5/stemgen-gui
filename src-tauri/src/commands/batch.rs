use serde::{Deserialize, Serialize};

/// Status of a batch queue item.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BatchQueueStatus {
    Pending,
    Processing,
    Done,
    Error,
    Cancelled,
}

impl std::fmt::Display for BatchQueueStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            BatchQueueStatus::Pending => write!(f, "pending"),
            BatchQueueStatus::Processing => write!(f, "processing"),
            BatchQueueStatus::Done => write!(f, "done"),
            BatchQueueStatus::Error => write!(f, "error"),
            BatchQueueStatus::Cancelled => write!(f, "cancelled"),
        }
    }
}

impl BatchQueueStatus {
    /// Parse from the string stored in SQLite.
    pub fn from_db(s: &str) -> Option<Self> {
        match s {
            "pending" => Some(Self::Pending),
            "processing" => Some(Self::Processing),
            "done" => Some(Self::Done),
            "error" => Some(Self::Error),
            "cancelled" => Some(Self::Cancelled),
            _ => None,
        }
    }
}

/// A single item in the batch processing queue.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchQueueItem {
    pub id: String,
    pub root_id: String,
    pub source_path: String,
    pub status: BatchQueueStatus,
    pub model_id: String,
    pub dj_preset: Option<String>,
    pub output_format: Option<String>,
    pub created_at: String,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub error_message: Option<String>,
    pub priority: i64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_batch_queue_status_serialization() {
        assert_eq!(
            serde_json::to_string(&BatchQueueStatus::Pending).unwrap(),
            "\"pending\""
        );
        assert_eq!(
            serde_json::to_string(&BatchQueueStatus::Processing).unwrap(),
            "\"processing\""
        );
        assert_eq!(
            serde_json::to_string(&BatchQueueStatus::Done).unwrap(),
            "\"done\""
        );
        assert_eq!(
            serde_json::to_string(&BatchQueueStatus::Error).unwrap(),
            "\"error\""
        );
        assert_eq!(
            serde_json::to_string(&BatchQueueStatus::Cancelled).unwrap(),
            "\"cancelled\""
        );
    }

    #[test]
    fn test_batch_queue_status_deserialization() {
        let pending: BatchQueueStatus = serde_json::from_str("\"pending\"").unwrap();
        assert_eq!(pending, BatchQueueStatus::Pending);

        let processing: BatchQueueStatus = serde_json::from_str("\"processing\"").unwrap();
        assert_eq!(processing, BatchQueueStatus::Processing);

        let done: BatchQueueStatus = serde_json::from_str("\"done\"").unwrap();
        assert_eq!(done, BatchQueueStatus::Done);

        let error: BatchQueueStatus = serde_json::from_str("\"error\"").unwrap();
        assert_eq!(error, BatchQueueStatus::Error);

        let cancelled: BatchQueueStatus = serde_json::from_str("\"cancelled\"").unwrap();
        assert_eq!(cancelled, BatchQueueStatus::Cancelled);
    }

    #[test]
    fn test_batch_queue_status_from_db() {
        assert_eq!(
            BatchQueueStatus::from_db("pending"),
            Some(BatchQueueStatus::Pending)
        );
        assert_eq!(
            BatchQueueStatus::from_db("processing"),
            Some(BatchQueueStatus::Processing)
        );
        assert_eq!(
            BatchQueueStatus::from_db("done"),
            Some(BatchQueueStatus::Done)
        );
        assert_eq!(
            BatchQueueStatus::from_db("error"),
            Some(BatchQueueStatus::Error)
        );
        assert_eq!(
            BatchQueueStatus::from_db("cancelled"),
            Some(BatchQueueStatus::Cancelled)
        );
        assert_eq!(BatchQueueStatus::from_db("invalid"), None);
    }

    #[test]
    fn test_batch_queue_status_display() {
        assert_eq!(format!("{}", BatchQueueStatus::Pending), "pending");
        assert_eq!(format!("{}", BatchQueueStatus::Processing), "processing");
        assert_eq!(format!("{}", BatchQueueStatus::Done), "done");
        assert_eq!(format!("{}", BatchQueueStatus::Error), "error");
        assert_eq!(format!("{}", BatchQueueStatus::Cancelled), "cancelled");
    }

    #[test]
    fn test_batch_queue_item_serialization_roundtrip() {
        let item = BatchQueueItem {
            id: "item_001".to_string(),
            root_id: "root_abc".to_string(),
            source_path: "/music/track1.mp3".to_string(),
            status: BatchQueueStatus::Pending,
            model_id: "bs_roformer".to_string(),
            dj_preset: Some("traktor".to_string()),
            output_format: Some("alac".to_string()),
            created_at: "2024-03-28T12:00:00Z".to_string(),
            started_at: None,
            finished_at: None,
            error_message: None,
            priority: 0,
        };

        let json = serde_json::to_string(&item).unwrap();
        assert!(json.contains("item_001"));
        assert!(json.contains("root_abc"));
        assert!(json.contains("pending"));

        let deserialized: BatchQueueItem = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, "item_001");
        assert_eq!(deserialized.root_id, "root_abc");
        assert_eq!(deserialized.status, BatchQueueStatus::Pending);
        assert_eq!(deserialized.model_id, "bs_roformer");
        assert_eq!(deserialized.dj_preset, Some("traktor".to_string()));
        assert!(deserialized.started_at.is_none());
    }

    #[test]
    fn test_batch_queue_item_error_status() {
        let item = BatchQueueItem {
            id: "item_err".to_string(),
            root_id: "root_abc".to_string(),
            source_path: "/music/track2.flac".to_string(),
            status: BatchQueueStatus::Error,
            model_id: "htdemucs".to_string(),
            dj_preset: None,
            output_format: None,
            created_at: "2024-03-28T12:00:00Z".to_string(),
            started_at: Some("2024-03-28T12:01:00Z".to_string()),
            finished_at: Some("2024-03-28T12:05:00Z".to_string()),
            error_message: Some("Sidecar timeout".to_string()),
            priority: 5,
        };

        let json = serde_json::to_string(&item).unwrap();
        let deserialized: BatchQueueItem = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.status, BatchQueueStatus::Error);
        assert_eq!(
            deserialized.error_message,
            Some("Sidecar timeout".to_string())
        );
        assert_eq!(deserialized.priority, 5);
    }
}
