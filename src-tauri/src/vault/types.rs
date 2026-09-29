use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultStatus {
    pub initialized: bool,
    pub unlocked: bool,
    pub profile_state: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClinicalPatient {
    pub id: String,
    pub revision: i64,
    pub name: String,
    pub life_cycle: String,
    pub age: Option<i64>,
    pub birth_date: Option<String>,
    pub self_requester: Option<String>,
    pub preferred_modality: String,
    pub archived_at: Option<String>,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatientInput {
    pub name: String,
    pub life_cycle: String,
    pub age: Option<i64>,
    #[serde(default, deserialize_with = "present_nullable")]
    pub birth_date: Option<Option<String>>,
    #[serde(default, deserialize_with = "present_nullable")]
    pub self_requester: Option<Option<String>>,
    pub preferred_modality: String,
}
fn present_nullable<'de, D: serde::Deserializer<'de>>(deserializer: D) -> Result<Option<Option<String>>, D::Error> {
    Option::<String>::deserialize(deserializer).map(Some)
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelatedPartyRoles {
    pub requester: bool,
    pub legal_guardian: bool,
    pub administrative_contact: bool,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelatedPartyInput {
    pub name: String,
    pub relation: String,
    pub roles: RelatedPartyRoles,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelatedParty {
    pub id: String,
    pub patient_id: String,
    pub revision: i64,
    pub name: String,
    pub relation: String,
    pub roles: RelatedPartyRoles,
    pub archived_at: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgendaSeries {
    pub id: String,
    pub patient_id: String,
    pub weekday: i64,
    pub start: String,
    pub end: String,
    pub frequency: String,
    pub start_date: String,
    pub end_date: Option<String>,
    pub modality: String,
    pub meeting_link: Option<String>,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgendaSeriesInput {
    pub patient_id: String,
    pub weekday: i64,
    pub start: String,
    pub end: String,
    pub frequency: String,
    pub start_date: String,
    pub end_date: Option<String>,
    pub modality: String,
    pub meeting_link: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgendaOccurrence {
    pub id: String,
    pub series_id: String,
    pub patient_id: String,
    pub original_date: String,
    pub date: String,
    pub start: String,
    pub end: String,
    pub status: String,
    pub frequency: String,
    pub modality: String,
    pub meeting_link: Option<String>,
    pub was_rescheduled: bool,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgendaEvent {
    pub id: String,
    pub series_id: String,
    pub action: String,
    pub original_date: String,
    pub effective_date: Option<String>,
    pub start: Option<String>,
    pub end: Option<String>,
    pub reason: Option<String>,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RescheduleInput {
    pub date: String,
    pub start: String,
    pub end: String,
    pub reason: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BehaviorTemplate {
    pub id: String,
    pub title: String,
    pub description: String,
    pub version: i64,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDraftInput {
    pub observation: String,
    #[serde(default)]
    pub procedures: String,
    #[serde(default)]
    pub outcome_decision: String,
    #[serde(default)]
    pub referral_closure: Option<String>,
    pub behavior_ids: Vec<String>,
    #[serde(default)]
    pub indicators: Vec<IndicatorEntry>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndicatorEntry {
    pub id: String,
    pub value: Option<i64>,
    pub note: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDraft {
    pub id: String,
    pub patient_id: String,
    pub series_id: String,
    pub original_date: String,
    pub observation: String,
    pub procedures: String,
    pub outcome_decision: String,
    pub referral_closure: Option<String>,
    pub behavior_ids: Vec<String>,
    pub indicators: Vec<IndicatorEntry>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndicatorDefinition {
    pub id: String,
    pub version: i64,
    pub name: String,
    pub definition: String,
    pub labels: Vec<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BehaviorSnapshot {
    pub template_id: String,
    pub template_version: i64,
    pub title: String,
    pub description: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndicatorSnapshot {
    pub id: String,
    pub version: i64,
    pub name: String,
    pub definition: String,
    pub labels: Vec<String>,
    pub value: Option<i64>,
    pub note: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClinicalSession {
    pub id: String,
    pub patient_id: String,
    pub session_date: String,
    pub start: String,
    pub end: String,
    pub modality: String,
    pub was_rescheduled: bool,
    pub observation: String,
    pub procedures: Option<String>,
    pub outcome_decision: Option<String>,
    pub referral_closure: Option<String>,
    pub behaviors: Vec<BehaviorSnapshot>,
    pub indicators: Vec<IndicatorSnapshot>,
    pub author: Option<ProfessionalIdentity>,
    pub recorded_at: Option<String>,
}
#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProfessionalIdentity {
    pub display_name: String,
    pub registration: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaseContextRevision {
    pub id: String,
    pub patient_id: String,
    pub recorded_at: String,
    pub demand: String,
    pub objectives: String,
    pub author: Option<ProfessionalIdentity>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoBackupStatus {
    pub dirty: bool,
    pub error: Option<String>,
    pub available: bool,
    pub present: bool,
    pub key_envelope_present: bool,
    pub last_verified_at: Option<String>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupPreview {
    pub schema_version: i64,
    pub created_at: i64,
    pub size_bytes: u64,
    pub profile_state: String,
    pub replaces_existing: bool,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryCategory {
    pub category: String,
    pub count: u64,
    pub bytes: u64,
    pub size_complete: bool,
    pub oldest_at: Option<String>,
    pub newest_at: Option<String>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryInventory {
    pub categories: Vec<RecoveryCategory>,
    pub eligible_count: u64,
    pub eligible_bytes: u64,
    pub cleanup_blocked: bool,
}

pub fn indicator_catalog() -> Vec<IndicatorDefinition> {
    serde_json::from_str(crate::vault::indicators::DESKTOP_INDICATOR_CATALOG_JSON)
        .unwrap_or_default()
}
