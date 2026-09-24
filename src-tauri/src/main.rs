#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Deliberately no filesystem, shell, network, database or crypto commands yet.
// Those capabilities will be exposed as narrowly scoped, audited Tauri commands.
fn main() {
  tauri::Builder::default()
    .run(tauri::generate_context!())
    .expect("erro ao iniciar Círculo")
}
