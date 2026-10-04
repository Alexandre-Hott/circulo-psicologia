This directory is intentionally kept free of model and executable binaries in Git.

On Windows, run `npm run voice:prepare` from the repository root. The script downloads
whisper.cpp v1.9.1 Windows x64 and the multilingual ggml-base model from their official
upstream locations and verifies pinned SHA-256 digests before preparing bundle resources.
Tauri dev/build intentionally fails with a setup message until those resources exist.

The packaged `THIRD-PARTY-NOTICES.txt` contains MIT and zlib license notices for
the included engine/model and SDL2 runtime.
This notice is versioned with the project and required by the preparation script
and Tauri build check; downloaded binaries and model files remain outside Git.
