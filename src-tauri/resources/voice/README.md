This directory is intentionally kept free of model and executable binaries in Git.

On Windows, run `npm run voice:prepare` from the repository root. The script downloads
whisper.cpp v1.9.1 Windows x64 and the multilingual candidate `ggml-small-q5_1.bin` from their official
upstream locations and verifies pinned SHA-256 digests before preparing bundle resources.
Tauri dev/build intentionally fails with a setup message until those resources exist.

The packaged `THIRD-PARTY-NOTICES.txt` contains MIT and zlib license notices for
the included engine/model and SDL2 runtime.
This notice is versioned with the project and required by the preparation script
and Tauri build check; downloaded binaries and model files remain outside Git.

Candidate model SHA-256: `ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb`
(190085487 bytes). The explicit Tauri resource whitelist includes this model,
the current CLI/DLLs and notices, not the historical `ggml-base.bin`. An existing
base file remains untouched for historical diagnostic scripts; it is not a fallback.

The eight retained synthetic WAVs passed through the updated Rust opt-in backend:
5 correct requests, 2 failed and 1 confirmation unevaluated without UI context.
Native exit was 0; semantic evaluation exit was 2. Their actual-text UI replay
passed 8/8 checks, without repairing transcripts or implying full recognition.
The local 0.2.80 installer was built and audited for metadata only; installation,
internal extraction, signing and publication were not performed.
The earlier direct CLI A/B improved full intents from 3/4/1 to 5/2/1 without
regressing the three previous successes, but agenda and observation still failed.
Clinical literals improved from 2/4 to 3/4; median latency increased from 1.735s
to 4.694s in that separate direct CLI comparison.
This small artificial sample does not prove microphone or general precision.
No parser, clinical-text repair, automatic confirmation or save is added.
