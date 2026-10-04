fn main() {
    #[cfg(windows)]
    {
        let voice_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/voice");
        for required in [
            "whisper-cli.exe",
            "ggml-base.bin",
            "ggml.dll",
            "ggml-base.dll",
            "ggml-cpu-x64.dll",
            "whisper.dll",
            "THIRD-PARTY-NOTICES.txt",
        ] {
            if !voice_dir.join(required).is_file() {
                panic!(
                    "Recurso de reconhecimento de voz ausente: {}. Prepare os recursos oficiais com `npm run voice:prepare` antes de executar Tauri dev/build.",
                    voice_dir.join(required).display()
                );
            }
        }
    }
    tauri_build::build()
}
