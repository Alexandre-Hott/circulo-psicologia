// Tests-only contract 72. Missing helpers intentionally cause compilation RED
// until the author implements the three confirmed private functions. No test
// launches Whisper, reads an audio/model resource, or performs inference.
use super::{
    build_initial_prompt, build_whisper_command, whisper_response_arguments,
    write_response_arguments, INITIAL_PROMPT,
};
use std::{ffi::OsStr, fs, path::Path};

fn expected_arguments(prompt: &str) -> Vec<&str> {
    // Preserve the existing flag order/settings; change only transport/paths.
    vec![
        "-m", "ggml-base.bin", "-f", "../input.wav", "-l", "pt", "--prompt", prompt,
        "-ng", "-nt", "-otxt", "-of", "../transcription",
    ]
}

#[test]
fn response_argument_order_and_relative_paths_match_existing_inference_settings() {
    let prompt = "José Fictício. Sessão fictícia.";
    assert_eq!(whisper_response_arguments(prompt), expected_arguments(prompt));
}

#[test]
fn response_arguments_keep_production_prompt_a_and_bounded_fictional_names_unchanged() {
    let prompt = build_initial_prompt(&["Ana Clara".into(), "José Fictício".into()]);
    assert_eq!(prompt, format!("{INITIAL_PROMPT} Ana Clara. José Fictício."));
    let args = whisper_response_arguments(&prompt);
    assert_eq!(args, expected_arguments(&prompt));
    assert_eq!(args[7].as_bytes(), prompt.as_bytes());
    assert!(prompt.len() <= 1_000);
}

#[test]
fn response_writer_emits_exact_utf8_order_without_bom_with_lf_and_final_lf() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("args.txt");
    let prompt = "José Fictício. Observação da sessão.";
    write_response_arguments(&path, &whisper_response_arguments(prompt)).unwrap();
    let bytes = fs::read(&path).unwrap();
    let expected = format!(
        "-m\nggml-base.bin\n-f\n../input.wav\n-l\npt\n--prompt\n{prompt}\n-ng\n-nt\n-otxt\n-of\n../transcription\n"
    );
    assert_eq!(bytes, expected.as_bytes());
    assert!(!bytes.starts_with(&[0xef, 0xbb, 0xbf]));
    assert!(!bytes.contains(&b'\r'));
    assert!(!bytes.contains(&0));
    assert_eq!(std::str::from_utf8(&bytes).unwrap(), expected);
}

#[test]
fn response_writer_preserves_literal_quotes_spaces_and_unicode_without_argv_escaping() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("args.txt");
    let prompt = "  José Fictício. Texto \"entre aspas\" com  dois espaços?!  ";
    let args = whisper_response_arguments(prompt);
    write_response_arguments(&path, &args).unwrap();
    let bytes = fs::read(&path).unwrap();
    let expected = args.join("\n") + "\n";
    assert_eq!(bytes, expected.as_bytes());
    let text = std::str::from_utf8(&bytes).unwrap();
    assert_eq!(text.split('\n').nth(7).unwrap(), prompt);
    assert!(!text.contains("\\\""));
}

fn rejects_control_before_creating_any_file(control: char) {
    let temp = tempfile::tempdir().unwrap();
    // Invalid argument can be anywhere, including the final one: validate the
    // whole vector before create_new/writing, not just the prompt or first line.
    let baseline = expected_arguments("José Fictício.");
    for index in 0..baseline.len() {
        let path = temp.path().join(format!("absent-{index}.txt"));
        let invalid = format!("{}{}--help", baseline[index], control);
        let mut args = baseline.clone();
        args[index] = &invalid;
        assert!(write_response_arguments(&path, &args).is_err());
        assert!(!path.exists(), "argument {index} must fail before file creation");
    }
    assert_eq!(fs::read_dir(temp.path()).unwrap().count(), 0);
}

fn rejects_control_without_touching_preexisting_file(control: char) {
    let temp = tempfile::tempdir().unwrap();
    let sentinel = b"preexisting recovery bytes\r\n\xff\x00";
    let baseline = expected_arguments("José Fictício.");
    for index in 0..baseline.len() {
        let path = temp.path().join(format!("existing-{index}.txt"));
        fs::write(&path, sentinel).unwrap();
        let invalid = format!("{}{}--help", baseline[index], control);
        let mut args = baseline.clone();
        args[index] = &invalid;
        assert!(write_response_arguments(&path, &args).is_err());
        assert_eq!(fs::read(&path).unwrap(), sentinel);
    }
}

#[test]
fn cr_is_rejected_in_every_argument_before_file_creation() {
    rejects_control_before_creating_any_file('\r');
}

#[test]
fn lf_is_rejected_in_every_argument_before_file_creation() {
    rejects_control_before_creating_any_file('\n');
}

#[test]
fn nul_is_rejected_in_every_argument_before_file_creation() {
    rejects_control_before_creating_any_file('\0');
}

#[test]
fn cr_does_not_change_preexisting_response_bytes() {
    rejects_control_without_touching_preexisting_file('\r');
}

#[test]
fn lf_does_not_change_preexisting_response_bytes() {
    rejects_control_without_touching_preexisting_file('\n');
}

#[test]
fn nul_does_not_change_preexisting_response_bytes() {
    rejects_control_without_touching_preexisting_file('\0');
}

#[test]
fn valid_arguments_cannot_overwrite_an_existing_response_file() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("args.txt");
    let sentinel = b"preserved original\xff\r\n";
    fs::write(&path, sentinel).unwrap();
    assert!(write_response_arguments(&path, &whisper_response_arguments("José Fictício.")).is_err());
    assert_eq!(fs::read(&path).unwrap(), sentinel);
}

#[test]
fn create_new_refuses_even_an_existing_empty_file() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("args.txt");
    fs::write(&path, b"").unwrap();
    assert!(write_response_arguments(&path, &whisper_response_arguments("José Fictício.")).is_err());
    assert_eq!(fs::read(&path).unwrap(), b"");
}

#[test]
fn second_write_refuses_and_preserves_the_first_exact_response() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("args.txt");
    write_response_arguments(&path, &whisper_response_arguments("José Fictício.")).unwrap();
    let before = fs::read(&path).unwrap();
    assert!(write_response_arguments(&path, &whisper_response_arguments("Ana Clara.")).is_err());
    assert_eq!(fs::read(&path).unwrap(), before);
}

#[test]
fn command_has_only_ascii_relative_response_argument_and_preserves_unicode_cwd_and_program() {
    let temp = tempfile::tempdir().unwrap();
    let engine = temp.path().join("Área José Fictício").join("engine");
    let executable = engine.join("whisper-cli.exe");
    let command = build_whisper_command(&executable, &engine);
    assert_eq!(command.get_program(), executable.as_os_str());
    assert_eq!(command.get_current_dir(), Some(engine.as_path()));
    let args: Vec<_> = command.get_args().collect();
    assert_eq!(args, vec![OsStr::new("@args.txt")]);
    assert!(args[0].to_str().unwrap().is_ascii());
    assert!(command.get_envs().next().is_none(), "no per-command environment/code-page override");
    // Command has no stable public getters for Stdio or Windows creation flags.
    // Null stdio / CREATE_NO_WINDOW require author source review, not claims
    // based on Debug text or spawning a CLI from this unit suite.
}

#[test]
fn response_file_accepts_a_unicode_parent_without_encoding_its_path_into_arguments() {
    let temp = tempfile::tempdir().unwrap();
    let engine = temp.path().join("Área José Fictício").join("engine");
    fs::create_dir_all(&engine).unwrap();
    let path = engine.join("args.txt");
    let prompt = "José Fictício. \"Aspas literais\".";
    write_response_arguments(&path, &whisper_response_arguments(prompt)).unwrap();
    assert_eq!(fs::read(path).unwrap(), (expected_arguments(prompt).join("\n") + "\n").as_bytes());
    let command = build_whisper_command(&engine.join("whisper-cli.exe"), &engine);
    assert_eq!(command.get_args().collect::<Vec<_>>(), vec![OsStr::new("@args.txt")]);
}

#[test]
fn normal_tempdir_drop_removes_response_and_same_managed_workspace() {
    let root;
    let response;
    {
        let temp = tempfile::tempdir().unwrap();
        root = temp.path().to_owned();
        let engine = root.join("engine");
        fs::create_dir(&engine).unwrap();
        response = engine.join("args.txt");
        write_response_arguments(&response, &whisper_response_arguments("José Fictício.")).unwrap();
        assert!(response.is_file());
        assert!(Path::new(&root).exists());
    }
    assert!(!response.exists());
    assert!(!root.exists());
    // This is normal RAII cleanup only. Existing timeout tests cover a normal
    // child kill/wait path; neither suite proves cleanup safety after kill fails.
}
