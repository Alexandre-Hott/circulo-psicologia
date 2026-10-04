// Contract 73: pure decoder for the opt-in synthetic reader ONLY. All WAVs here
// are constructed in memory; no retained capture, backend, model or ASR is used.
// Helpers intentionally absent initially: MAIN should report compilation RED.
use super::decode_synthetic_wav;

fn chunk(id: &[u8; 4], payload: &[u8]) -> Vec<u8> {
    let mut bytes = id.to_vec();
    bytes.extend_from_slice(&(payload.len() as u32).to_le_bytes());
    bytes.extend_from_slice(payload);
    if payload.len() % 2 != 0 {
        // Nonzero RIFF padding must be skipped, never interpreted as PCM.
        bytes.push(0xd5);
    }
    bytes
}

fn riff(chunks: &[Vec<u8>]) -> Vec<u8> {
    let mut body = b"WAVE".to_vec();
    for item in chunks {
        body.extend_from_slice(item);
    }
    let mut bytes = b"RIFF".to_vec();
    bytes.extend_from_slice(&(body.len() as u32).to_le_bytes());
    bytes.extend_from_slice(&body);
    bytes
}

fn fmt_payload(rate: u32, extended: bool) -> Vec<u8> {
    let mut bytes = Vec::new();
    bytes.extend_from_slice(&1u16.to_le_bytes()); // PCM
    bytes.extend_from_slice(&1u16.to_le_bytes()); // mono
    bytes.extend_from_slice(&rate.to_le_bytes());
    bytes.extend_from_slice(&(rate * 2).to_le_bytes());
    bytes.extend_from_slice(&2u16.to_le_bytes()); // blockAlign
    bytes.extend_from_slice(&16u16.to_le_bytes());
    if extended {
        bytes.extend_from_slice(&0u16.to_le_bytes()); // fmt18 / cbSize0
    }
    bytes
}

fn pcm(samples: &[i16]) -> Vec<u8> {
    samples.iter().flat_map(|sample| sample.to_le_bytes()).collect()
}

fn wav(rate: u32, extended: bool, samples: &[i16]) -> Vec<u8> {
    riff(&[
        chunk(b"fmt ", &fmt_payload(rate, extended)),
        chunk(b"data", &pcm(samples)),
    ])
}

fn exact_samples(bytes: &[u8], expected_rate: u32, expected: &[i16]) {
    let (rate, samples) = decode_synthetic_wav(bytes).expect("valid synthetic PCM WAV");
    assert_eq!(rate, expected_rate);
    assert_eq!(samples.len(), expected.len(), "headers, padding and metadata are not samples");
    for (index, (&actual, &integer)) in samples.iter().zip(expected).enumerate() {
        let normalized = integer as f32 / i16::MAX as f32;
        assert_eq!(actual.to_bits(), normalized.to_bits(), "exact existing PCM/32767 scale at sample {index}");
    }
}

fn refused(bytes: &[u8]) {
    assert!(decode_synthetic_wav(bytes).is_err(), "invalid/ambiguous WAV must be refused without repair");
}

#[test]
fn fmt16_decodes_exact_mono_little_endian_samples_starting_at_44() {
    let expected = [-32768, -32767, -16384, -1, 0, 1, 16384, 32767];
    let bytes = wav(22_050, false, &expected);
    assert_eq!(&bytes[44..], pcm(&expected));
    exact_samples(&bytes, 22_050, &expected);
}

#[test]
fn fmt18_decodes_pcm_at_46_without_injecting_the_last_two_data_size_bytes() {
    let expected = [1234, -2345, 32767, -32768];
    let bytes = wav(22_050, true, &expected);
    assert_eq!(&bytes[46..], pcm(&expected));
    assert_ne!(&bytes[44..], pcm(&expected));
    exact_samples(&bytes, 22_050, &expected);
}

#[test]
fn fmt16_and_fmt18_produce_bit_identical_samples_for_the_same_pcm() {
    let expected = [0, -1, 1, -32768, 32767];
    let a = decode_synthetic_wav(&wav(48_000, false, &expected)).unwrap();
    let b = decode_synthetic_wav(&wav(48_000, true, &expected)).unwrap();
    assert_eq!(a.0, b.0);
    assert_eq!(a.1.iter().map(|v| v.to_bits()).collect::<Vec<_>>(), b.1.iter().map(|v| v.to_bits()).collect::<Vec<_>>());
}

#[test]
fn minimum_i16_keeps_existing_divisor_without_clamping_or_rescaling() {
    let (_, samples) = decode_synthetic_wav(&wav(8_000, false, &[i16::MIN])).unwrap();
    assert_eq!(samples[0].to_bits(), (i16::MIN as f32 / 32767.0f32).to_bits());
    assert!(samples[0] < -1.0);
}

#[test]
fn unknown_even_chunks_before_between_and_after_essential_chunks_are_ignored() {
    let expected = [321, -654, 987];
    let bytes = riff(&[
        chunk(b"JUNK", &[1, 2, 3, 4]),
        chunk(b"fmt ", &fmt_payload(22_050, true)),
        chunk(b"LIST", &[5, 6]),
        chunk(b"data", &pcm(&expected)),
        chunk(b"INFO", &[7, 8]),
    ]);
    exact_samples(&bytes, 22_050, &expected);
}

#[test]
fn unknown_odd_chunks_skip_exactly_one_padding_byte_including_after_data() {
    let expected = [-1200, 2400];
    let bytes = riff(&[
        chunk(b"JUNK", &[0xaa]),
        chunk(b"fmt ", &fmt_payload(16_000, false)),
        chunk(b"LIST", &[0xbb, 0xcc, 0xdd]),
        chunk(b"data", &pcm(&expected)),
        chunk(b"INFO", &[0xee]),
    ]);
    exact_samples(&bytes, 16_000, &expected);
}

#[test]
fn every_supported_rate_boundary_preserves_samples_without_resampling() {
    for rate in [8_000, 16_000, 22_050, 48_000, 192_000] {
        exact_samples(&wav(rate, true, &[456, -789]), rate, &[456, -789]);
    }
}

#[test]
fn exactly_twelve_seconds_is_accepted_at_rate_boundaries() {
    for rate in [8_000, 192_000] {
        let samples = vec![123i16; rate as usize * 12];
        exact_samples(&wav(rate, false, &samples), rate, &samples);
    }
}

#[test]
fn one_sample_over_twelve_seconds_is_refused_at_rate_boundaries() {
    for rate in [8_000, 192_000] {
        refused(&wav(rate, false, &vec![0; rate as usize * 12 + 1]));
    }
}

#[test]
fn zero_and_out_of_bounds_sample_rates_are_refused() {
    for rate in [0, 7_999, 192_001] {
        refused(&wav(rate, false, &[1]));
    }
}

#[test]
fn empty_data_is_refused() {
    refused(&wav(22_050, true, &[]));
}

#[test]
fn odd_pcm_byte_count_is_refused_not_silently_dropped_by_chunks_exact() {
    refused(&riff(&[
        chunk(b"fmt ", &fmt_payload(22_050, false)),
        chunk(b"data", &[1, 2, 3]),
    ]));
}

#[test]
fn non_pcm_formats_are_refused() {
    for format in [0u16, 3, 6, 0xfffe] {
        let mut payload = fmt_payload(22_050, false);
        payload[0..2].copy_from_slice(&format.to_le_bytes());
        refused(&riff(&[chunk(b"fmt ", &payload), chunk(b"data", &pcm(&[1]))]));
    }
}

#[test]
fn non_mono_channels_are_refused() {
    for channels in [0u16, 2, 6] {
        let mut payload = fmt_payload(22_050, false);
        payload[2..4].copy_from_slice(&channels.to_le_bytes());
        refused(&riff(&[chunk(b"fmt ", &payload), chunk(b"data", &pcm(&[1]))]));
    }
}

#[test]
fn non_16_bit_depths_are_refused() {
    for bits in [0u16, 8, 24, 32] {
        let mut payload = fmt_payload(22_050, false);
        payload[14..16].copy_from_slice(&bits.to_le_bytes());
        refused(&riff(&[chunk(b"fmt ", &payload), chunk(b"data", &pcm(&[1]))]));
    }
}

#[test]
fn incorrect_block_alignment_is_refused() {
    for alignment in [0u16, 1, 4] {
        let mut payload = fmt_payload(22_050, false);
        payload[12..14].copy_from_slice(&alignment.to_le_bytes());
        refused(&riff(&[chunk(b"fmt ", &payload), chunk(b"data", &pcm(&[1]))]));
    }
}

#[test]
fn incorrect_byte_rate_is_refused() {
    for byte_rate in [0u32, 22_050, 44_099, 44_101] {
        let mut payload = fmt_payload(22_050, false);
        payload[8..12].copy_from_slice(&byte_rate.to_le_bytes());
        refused(&riff(&[chunk(b"fmt ", &payload), chunk(b"data", &pcm(&[1]))]));
    }
}

#[test]
fn fmt_chunk_sizes_other_than_16_or_18_are_refused() {
    for length in [0, 8, 15, 17, 20, 40] {
        let mut payload = fmt_payload(22_050, true);
        payload.resize(length, 0);
        refused(&riff(&[chunk(b"fmt ", &payload), chunk(b"data", &pcm(&[1]))]));
    }
}

#[test]
fn missing_fmt_is_refused() {
    refused(&riff(&[chunk(b"data", &pcm(&[1]))]));
}

#[test]
fn missing_data_is_refused() {
    refused(&riff(&[chunk(b"fmt ", &fmt_payload(22_050, false))]));
}

#[test]
fn duplicate_identical_fmt_chunks_are_ambiguous_and_refused() {
    let fmt = chunk(b"fmt ", &fmt_payload(22_050, false));
    refused(&riff(&[fmt.clone(), fmt, chunk(b"data", &pcm(&[1]))]));
}

#[test]
fn duplicate_conflicting_fmt_chunks_are_refused() {
    refused(&riff(&[
        chunk(b"fmt ", &fmt_payload(22_050, false)),
        chunk(b"data", &pcm(&[1])),
        chunk(b"fmt ", &fmt_payload(48_000, true)),
    ]));
}

#[test]
fn duplicate_data_chunks_are_refused_not_merged_or_first_match_selected() {
    refused(&riff(&[
        chunk(b"fmt ", &fmt_payload(22_050, true)),
        chunk(b"data", &pcm(&[1])),
        chunk(b"data", &pcm(&[2])),
    ]));
}

#[test]
fn all_truncated_prefixes_of_a_valid_wav_are_refused_without_panicking() {
    let bytes = wav(22_050, true, &[100, -100]);
    for length in 0..bytes.len() {
        refused(&bytes[..length]);
    }
}

#[test]
fn non_riff_and_big_endian_rifx_are_refused() {
    for marker in [b"NOPE", b"RIFX", b"RF64"] {
        let mut bytes = wav(22_050, false, &[1]);
        bytes[0..4].copy_from_slice(marker);
        refused(&bytes);
    }
}

#[test]
fn non_wave_container_is_refused() {
    let mut bytes = wav(22_050, false, &[1]);
    bytes[8..12].copy_from_slice(b"AVI ");
    refused(&bytes);
}

#[test]
fn riff_declared_size_larger_or_smaller_than_actual_bytes_is_refused() {
    let original = wav(22_050, false, &[1]);
    let declared = (original.len() - 8) as u32;
    for size in [0, 4, declared - 1, declared + 1, u32::MAX] {
        let mut bytes = original.clone();
        bytes[4..8].copy_from_slice(&size.to_le_bytes());
        refused(&bytes);
    }
}

#[test]
fn trailing_bytes_outside_declared_riff_are_refused() {
    let mut bytes = wav(22_050, false, &[1]);
    bytes.extend_from_slice(b"extra");
    refused(&bytes);
}

#[test]
fn partial_chunk_header_inside_correctly_sized_riff_is_refused() {
    let fmt = chunk(b"fmt ", &fmt_payload(22_050, false));
    let data = chunk(b"data", &pcm(&[1]));
    for length in 1..8 {
        refused(&riff(&[fmt.clone(), data.clone(), b"JUNKxxx"[..length].to_vec()]));
    }
}

#[test]
fn declared_chunk_payload_past_riff_end_is_refused() {
    let mut bad_data = chunk(b"data", &pcm(&[1]));
    bad_data[4..8].copy_from_slice(&4u32.to_le_bytes());
    refused(&riff(&[chunk(b"fmt ", &fmt_payload(22_050, false)), bad_data]));
}

#[test]
fn maximum_declared_chunk_length_is_refused_without_overflow_or_allocation() {
    let mut bad = b"JUNK".to_vec();
    bad.extend_from_slice(&u32::MAX.to_le_bytes());
    refused(&riff(&[
        chunk(b"fmt ", &fmt_payload(22_050, false)),
        chunk(b"data", &pcm(&[1])),
        bad,
    ]));
}

#[test]
fn missing_odd_chunk_padding_inside_correctly_sized_riff_is_refused() {
    let mut odd = chunk(b"JUNK", &[0xaa]);
    odd.pop();
    refused(&riff(&[
        chunk(b"fmt ", &fmt_payload(22_050, false)),
        chunk(b"data", &pcm(&[1])),
        odd,
    ]));
}

#[test]
fn chunk_bounds_are_checked_before_ignoring_unknown_chunks() {
    let mut unknown = chunk(b"LIST", &[1, 2]);
    unknown[4..8].copy_from_slice(&100u32.to_le_bytes());
    refused(&riff(&[
        chunk(b"fmt ", &fmt_payload(22_050, false)),
        chunk(b"data", &pcm(&[1])),
        unknown,
    ]));
}
