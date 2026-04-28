// DynamoDB storage for meeting records.
//
// Table: ghostnote-meetings
//   Partition key: userId  (String) — user email
//   Sort key:      meetingId (String) — timestamp string, e.g. "1714230000000"
//   Attributes:    startedAt (N), endedAt (N), wordCount (N), questionCount (N), preview (S)
//
// Create the table once in AWS Console / CLI:
//   aws dynamodb create-table \
//     --table-name ghostnote-meetings \
//     --attribute-definitions AttributeName=userId,AttributeType=S AttributeName=meetingId,AttributeType=S \
//     --key-schema AttributeName=userId,KeyType=HASH AttributeName=meetingId,KeyType=RANGE \
//     --billing-mode PAY_PER_REQUEST \
//     --region us-east-2

use aws_sdk_dynamodb::{types::AttributeValue, Client};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

const TABLE: &str = "ghostnote-meetings";

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MeetingRecord {
    pub id: String,
    pub started_at: i64,
    pub ended_at: i64,
    pub word_count: u32,
    pub question_count: u32,
    pub preview: String,
}

pub async fn save_meeting(client: &Client, user_email: &str, m: &MeetingRecord) -> Result<(), String> {
    client
        .put_item()
        .table_name(TABLE)
        .item("userId",        AttributeValue::S(user_email.to_string()))
        .item("meetingId",     AttributeValue::S(m.id.clone()))
        .item("startedAt",     AttributeValue::N(m.started_at.to_string()))
        .item("endedAt",       AttributeValue::N(m.ended_at.to_string()))
        .item("wordCount",     AttributeValue::N(m.word_count.to_string()))
        .item("questionCount", AttributeValue::N(m.question_count.to_string()))
        .item("preview",       AttributeValue::S(m.preview.clone()))
        .send()
        .await
        .map_err(|e| format!("DynamoDB save: {e}"))?;
    Ok(())
}

pub async fn get_meetings(client: &Client, user_email: &str) -> Result<Vec<MeetingRecord>, String> {
    let resp = client
        .query()
        .table_name(TABLE)
        .key_condition_expression("userId = :uid")
        .expression_attribute_values(":uid", AttributeValue::S(user_email.to_string()))
        .scan_index_forward(false)
        .limit(50)
        .send()
        .await
        .map_err(|e| format!("DynamoDB query: {e}"))?;

    let mut meetings = Vec::new();
    for item in resp.items.unwrap_or_default() {
        if let Some(r) = item_to_record(&item) {
            meetings.push(r);
        }
    }
    Ok(meetings)
}

pub async fn delete_meeting(client: &Client, user_email: &str, meeting_id: &str) -> Result<(), String> {
    client
        .delete_item()
        .table_name(TABLE)
        .key("userId",    AttributeValue::S(user_email.to_string()))
        .key("meetingId", AttributeValue::S(meeting_id.to_string()))
        .send()
        .await
        .map_err(|e| format!("DynamoDB delete: {e}"))?;
    Ok(())
}

fn item_to_record(item: &HashMap<String, AttributeValue>) -> Option<MeetingRecord> {
    let s = |k: &str| -> Option<String> {
        item.get(k)?.as_s().ok().map(|v| v.clone())
    };
    let n = |k: &str| -> Option<i64> {
        item.get(k)?.as_n().ok()?.parse().ok()
    };
    Some(MeetingRecord {
        id:             s("meetingId")?,
        started_at:     n("startedAt")?,
        ended_at:       n("endedAt")?,
        word_count:     n("wordCount").unwrap_or(0) as u32,
        question_count: n("questionCount").unwrap_or(0) as u32,
        preview:        s("preview").unwrap_or_default(),
    })
}
