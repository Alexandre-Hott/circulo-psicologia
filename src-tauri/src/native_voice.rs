use std::{
    fs,
    io::Write,
    path::Path,
    process::{Command, Stdio},
};
use zeroize::Zeroizing;

const MAX_SECONDS: f64 = 12.0;
const MIN_INPUT_RATE: u32 = 8_000;
const MAX_INPUT_RATE: u32 = 192_000;
const INITIAL_PROMPT: &str = "Agenda de sessões. Cadastrar paciente. Sessão semanal. Registrar comportamento na sessão. Observação, evolução e indicador.";

pub fn transcribe(
    resources: &Path,
    samples: &[f32],
    sample_rate: u32,
    patient_names: &[String],
) -> Result<String, String> {
    let pcm = Zeroizing::new(quantize_pcm(samples, sample_rate)?);
    if !resources.join("whisper-cli.exe").is_file() || !resources.join("ggml-base.bin").is_file() {
        return Err("Reconhecimento local não preparado. Execute `npm run voice:prepare` e tente novamente.".into());
    }

    let temp = tempfile::Builder::new()
        .prefix("circulo-voice-")
        .tempdir()
        .map_err(|error| format!("Não foi possível preparar áudio temporário: {error}"))?;
    let engine_dir = temp.path().join("engine");
    hard_link_voice_resources(resources, &engine_dir)?;
    let executable = engine_dir.join("whisper-cli.exe");
    let model = engine_dir.join("ggml-base.bin");
    let wav_path = temp.path().join("input.wav");
    let output_base = temp.path().join("transcription");
    let text_path = temp.path().join("transcription.txt");
    write_wav(&wav_path, &pcm, sample_rate)?;

    let prompt = Zeroizing::new(build_initial_prompt(patient_names));
    let mut command = Command::new(executable);
    command
        .arg("-m")
        .arg(model)
        .arg("-f")
        .arg(&wav_path)
        .arg("-l")
        .arg("pt")
        .arg("--prompt")
        .arg(&*prompt)
        .arg("-ng")
        .arg("-nt")
        .arg("-otxt")
        .arg("-of")
        .arg(output_base)
        .current_dir(&engine_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }

    let status = command
        .status()
        .map_err(|error| format!("Não foi possível executar o reconhecimento local: {error}"))?;
    if !status.success() {
        return Err(format!(
            "O reconhecimento local terminou com erro ({status})."
        ));
    }
    let transcript = Zeroizing::new(
        fs::read_to_string(&text_path)
            .map_err(|error| format!("O reconhecimento local não produziu texto: {error}"))?,
    );
    parse_generated_transcript(&transcript)
}

fn hard_link_voice_resources(resources: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir(destination)
        .map_err(|error| format!("Não foi possível preparar os recursos locais de voz: {error}"))?;
    let entries = fs::read_dir(resources)
        .map_err(|error| format!("Não foi possível acessar os recursos locais de voz: {error}"))?;
    for entry in entries {
        let entry =
            entry.map_err(|error| format!("Não foi possível ler um recurso de voz: {error}"))?;
        let file_type = entry
            .file_type()
            .map_err(|error| format!("Não foi possível inspecionar um recurso de voz: {error}"))?;
        if !file_type.is_file() {
            continue;
        }
        let file_name = entry.file_name();
        fs::hard_link(entry.path(), destination.join(file_name)).map_err(|error| {
            format!("Não foi possível preparar um recurso local de voz: {error}")
        })?;
    }
    Ok(())
}

fn build_initial_prompt(patient_names: &[String]) -> String {
    let mut prompt = INITIAL_PROMPT.to_owned();
    for name in patient_names.iter().take(40) {
        if name.chars().any(char::is_control) {
            continue;
        }
        let name = name.trim();
        if name.is_empty() || name.chars().count() > 80 {
            continue;
        }
        if prompt.len() + name.len() + 2 > 1_000 {
            break;
        }
        prompt.push(' ');
        prompt.push_str(name);
        prompt.push('.');
    }
    prompt
}

fn validate_pcm(samples: &[f32], sample_rate: u32) -> Result<(), String> {
    if !(MIN_INPUT_RATE..=MAX_INPUT_RATE).contains(&sample_rate) {
        return Err(format!(
            "Taxa de amostragem inválida; use entre {MIN_INPUT_RATE} e {MAX_INPUT_RATE} Hz."
        ));
    }
    if samples.is_empty() {
        return Err("O áudio está vazio.".into());
    }
    if samples.iter().any(|sample| !sample.is_finite()) {
        return Err("O áudio contém amostras inválidas.".into());
    }
    let duration = samples.len() as f64 / sample_rate as f64;
    if duration > MAX_SECONDS {
        return Err("O áudio excede o limite de 12 segundos.".into());
    }
    Ok(())
}

fn quantize_pcm(samples: &[f32], sample_rate: u32) -> Result<Vec<i16>, String> {
    validate_pcm(samples, sample_rate)?;
    Ok(samples
        .iter()
        .map(|sample| (sample.clamp(-1.0, 1.0) * i16::MAX as f32).round() as i16)
        .collect())
}

fn write_wav(path: &Path, samples: &[i16], sample_rate: u32) -> Result<(), String> {
    let data_len = samples
        .len()
        .checked_mul(2)
        .and_then(|size| u32::try_from(size).ok())
        .ok_or_else(|| "Áudio grande demais para o formato WAV.".to_owned())?;
    let riff_len = 36u32
        .checked_add(data_len)
        .ok_or_else(|| "Áudio grande demais para o formato WAV.".to_owned())?;
    let mut file = fs::File::create(path)
        .map_err(|error| format!("Não foi possível criar o áudio temporário: {error}"))?;
    file.write_all(b"RIFF")
        .and_then(|_| file.write_all(&riff_len.to_le_bytes()))
        .and_then(|_| file.write_all(b"WAVEfmt "))
        .and_then(|_| file.write_all(&16u32.to_le_bytes()))
        .and_then(|_| file.write_all(&1u16.to_le_bytes())) // PCM
        .and_then(|_| file.write_all(&1u16.to_le_bytes())) // mono
        .and_then(|_| file.write_all(&sample_rate.to_le_bytes()))
        .and_then(|_| file.write_all(&(sample_rate * 2).to_le_bytes()))
        .and_then(|_| file.write_all(&2u16.to_le_bytes()))
        .and_then(|_| file.write_all(&16u16.to_le_bytes()))
        .and_then(|_| file.write_all(b"data"))
        .and_then(|_| file.write_all(&data_len.to_le_bytes()))
        .map_err(|error| format!("Falha ao gravar cabeçalho WAV temporário: {error}"))?;
    for sample in samples {
        file.write_all(&sample.to_le_bytes())
            .map_err(|error| format!("Falha ao gravar WAV temporário: {error}"))?;
    }
    file.flush()
        .map_err(|error| format!("Falha ao concluir WAV temporário: {error}"))
}

fn parse_generated_transcript(contents: &str) -> Result<String, String> {
    let transcript = contents.trim();
    if transcript.is_empty() {
        return Err(
            "Não foi possível reconhecer fala. Tente novamente ou digite o comando.".into(),
        );
    }
    Ok(transcript.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;
    use std::path::PathBuf;

    #[test]
    fn rejects_invalid_rate_empty_non_finite_and_overlong_audio() {
        assert!(validate_pcm(&[0.0], 7_999).is_err());
        assert!(validate_pcm(&[0.0], 192_001).is_err());
        assert!(validate_pcm(&[], 16_000).is_err());
        assert!(validate_pcm(&[f32::NAN], 16_000).is_err());
        assert!(validate_pcm(&[f32::INFINITY], 16_000).is_err());
        assert!(validate_pcm(&vec![0.0; 192_001], 16_000).is_err());
        assert!(validate_pcm(&vec![0.0; 192_000], 16_000).is_ok());
    }

    #[test]
    fn quantizes_pcm_without_changing_duration_and_clamps_range() {
        let samples = vec![-1.5, 0.0, 1.5, 0.5, -0.5, 0.0];
        let result = quantize_pcm(&samples, 48_000).unwrap();
        assert_eq!(result.len(), samples.len());
        assert_eq!(result[0], -i16::MAX);
        assert_eq!(result[1], 0);
        assert!(result[2] > 0);
    }

    #[test]
    fn preserves_input_sample_rate_in_the_wav() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("audio.wav");
        let result = quantize_pcm(&[-1.0, 0.0, 1.0], 22_050).unwrap();
        write_wav(&path, &result, 22_050).unwrap();
        let bytes = fs::read(path).unwrap();
        assert_eq!(
            u32::from_le_bytes(bytes[24..28].try_into().unwrap()),
            22_050
        );
        assert_eq!(u32::from_le_bytes(bytes[40..44].try_into().unwrap()), 6);
    }

    #[test]
    fn writes_valid_mono_pcm_wav_header_and_payload() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("audio.wav");
        write_wav(&path, &[-2, 0, 2], 16_000).unwrap();
        let mut bytes = Vec::new();
        fs::File::open(path)
            .unwrap()
            .read_to_end(&mut bytes)
            .unwrap();
        assert_eq!(&bytes[0..4], b"RIFF");
        assert_eq!(u32::from_le_bytes(bytes[4..8].try_into().unwrap()), 42);
        assert_eq!(&bytes[8..12], b"WAVE");
        assert_eq!(u16::from_le_bytes(bytes[22..24].try_into().unwrap()), 1);
        assert_eq!(
            u32::from_le_bytes(bytes[24..28].try_into().unwrap()),
            16_000
        );
        assert_eq!(u16::from_le_bytes(bytes[34..36].try_into().unwrap()), 16);
        assert_eq!(&bytes[36..40], b"data");
        assert_eq!(u32::from_le_bytes(bytes[40..44].try_into().unwrap()), 6);
        assert_eq!(
            &bytes[44..],
            &[-2i16, 0, 2]
                .iter()
                .flat_map(|x| x.to_le_bytes())
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn reads_only_nonempty_generated_text() {
        assert_eq!(
            parse_generated_transcript("  Olá, mundo.\r\n").unwrap(),
            "Olá, mundo."
        );
        assert!(parse_generated_transcript(" \n ").is_err());
    }

    #[test]
    fn initial_prompt_includes_bounded_local_catalog_names() {
        let prompt = build_initial_prompt(&["Ana Clara".into(), "Bia Fictícia".into()]);
        assert!(prompt.contains("Ana Clara."));
        assert!(prompt.contains("Bia Fictícia."));
        assert!(prompt.starts_with(INITIAL_PROMPT));
    }

    #[test]
    fn initial_prompt_ignores_invalid_or_oversized_catalog_names() {
        let names = vec![
            "\nmalicious".into(),
            " ".into(),
            "a".repeat(81),
            "Ana Clara".into(),
        ];
        let prompt = build_initial_prompt(&names);
        assert!(!prompt.contains("malicious"));
        assert!(!prompt.contains(&"a".repeat(81)));
        assert!(prompt.contains("Ana Clara."));
        assert!(prompt.len() <= 1_000);
    }

    #[test]
    fn temp_audio_is_removed_when_scope_ends() {
        let dir_path: PathBuf;
        {
            let dir = tempfile::tempdir().unwrap();
            dir_path = dir.path().to_owned();
            write_wav(&dir.path().join("input.wav"), &[1, 2], 22_050).unwrap();
            assert!(dir.path().join("input.wav").exists());
        }
        assert!(!dir_path.exists());
    }

    #[test]
    fn voice_resources_are_hard_linked_into_the_ascii_temp_workspace() {
        let source = tempfile::tempdir().unwrap();
        let destination_root = tempfile::tempdir().unwrap();
        let destination = destination_root.path().join("engine");
        fs::write(source.path().join("whisper-cli.exe"), b"engine").unwrap();
        fs::write(source.path().join("ggml-base.bin"), b"model").unwrap();
        fs::write(source.path().join("ggml-cpu-x64.dll"), b"backend").unwrap();
        fs::create_dir(source.path().join("ignored-directory")).unwrap();

        hard_link_voice_resources(source.path(), &destination).unwrap();
        for name in ["whisper-cli.exe", "ggml-base.bin", "ggml-cpu-x64.dll"] {
            let linked = destination.join(name);
            assert_eq!(
                fs::read(linked).unwrap(),
                fs::read(source.path().join(name)).unwrap()
            );
        }
        assert!(!destination.join("ignored-directory").exists());
    }

    #[test]
    #[ignore = "teste opt-in: requer WAVs sintéticos em CIRCULO_SYNTHETIC_WAV_DIRECTORY e recursos locais Whisper"]
    fn transcribes_synthetic_wav_through_the_same_local_backend_as_the_app() {
        let wav_directory = std::env::var_os("CIRCULO_SYNTHETIC_WAV_DIRECTORY")
            .expect("CIRCULO_SYNTHETIC_WAV_DIRECTORY deve apontar para WAVs SAPI fictícios");
        let wav_directory = PathBuf::from(wav_directory);
        let resources = std::env::var_os("CIRCULO_TEST_VOICE_RESOURCES")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/voice"));
        for index in 0..3 {
            let wav_path = wav_directory.join(format!("synthetic-command-{index}.wav"));
            let bytes = fs::read(&wav_path).expect("ler áudio WAV sintético");
            assert!(bytes.len() >= 44, "WAV sintético truncado");
            assert_eq!(&bytes[0..4], b"RIFF");
            assert_eq!(&bytes[8..12], b"WAVE");
            assert_eq!(u16::from_le_bytes(bytes[22..24].try_into().unwrap()), 1);
            assert_eq!(u16::from_le_bytes(bytes[34..36].try_into().unwrap()), 16);
            let sample_rate = u32::from_le_bytes(bytes[24..28].try_into().unwrap());
            let samples = bytes[44..]
                .chunks_exact(2)
                .map(|chunk| i16::from_le_bytes([chunk[0], chunk[1]]) as f32 / i16::MAX as f32)
                .collect::<Vec<_>>();
            let transcript = transcribe(
                &resources,
                &samples,
                sample_rate,
                &["Ana Clara".into(), "Bia Fictícia".into()],
            )
            .unwrap();
            assert!(!transcript.trim().is_empty());
            println!("Transcrição sintética Rust #{index}: {transcript}");
        }
    }
}
