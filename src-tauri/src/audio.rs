use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tokio::sync::mpsc::UnboundedSender;

#[derive(Debug, Clone)]
pub struct AudioFormat {
    pub sample_rate: u32,
}

/// Starts WASAPI loopback capture on a background OS thread.
/// Sends raw int16 PCM chunks through `tx`.
/// Stops when `stop_flag` is set to true.
pub fn start_capture(
    tx: UnboundedSender<Vec<u8>>,
    stop_flag: Arc<AtomicBool>,
) -> Result<AudioFormat, String> {
    use wasapi::*;

    initialize_mta()
        .ok()
        .map_err(|e| format!("COM init failed: {e}"))?;

    let enumerator =
        DeviceEnumerator::new().map_err(|e| format!("DeviceEnumerator failed: {e}"))?;
    let device = enumerator
        .get_default_device(&Direction::Render)
        .map_err(|e| format!("No audio device: {e}"))?;
    let probe_client = device
        .get_iaudioclient()
        .map_err(|e| format!("AudioClient error: {e}"))?;

    let fmt = probe_client
        .get_mixformat()
        .map_err(|e| format!("MixFormat error: {e}"))?;

    let sample_rate = fmt.get_samplespersec();
    let channels = fmt.get_nchannels();
    let bytes_per_frame = fmt.get_blockalign() as usize;
    let bits_per_sample = fmt.get_bitspersample() as usize;
    let af = AudioFormat { sample_rate };

    std::thread::spawn(move || {
        if let Err(e) = capture_loop(tx, stop_flag, channels as usize, bytes_per_frame, bits_per_sample) {
            eprintln!("[audio] capture loop ended: {e}");
        }
    });

    Ok(af)
}

fn capture_loop(
    tx: UnboundedSender<Vec<u8>>,
    stop_flag: Arc<AtomicBool>,
    channels: usize,
    bytes_per_frame: usize,
    bits_per_sample: usize,
) -> Result<(), String> {
    use wasapi::*;

    initialize_mta()
        .ok()
        .map_err(|e| format!("COM init: {e}"))?;

    let enumerator =
        DeviceEnumerator::new().map_err(|e| format!("DeviceEnumerator: {e}"))?;
    let device = enumerator
        .get_default_device(&Direction::Render)
        .map_err(|e| format!("No audio device: {e}"))?;
    let mut audio_client = device
        .get_iaudioclient()
        .map_err(|e| format!("AudioClient: {e}"))?;
    let fmt = audio_client
        .get_mixformat()
        .map_err(|e| format!("MixFormat: {e}"))?;

    audio_client
        .initialize_client(
            &fmt,
            &Direction::Capture,
            &StreamMode::PollingShared {
                buffer_duration_hns: 500_000,
                autoconvert: true,
            },
        )
        .map_err(|e| format!("InitClient: {e}"))?;

    let capture_client = audio_client
        .get_audiocaptureclient()
        .map_err(|e| format!("CaptureClient: {e}"))?;
    audio_client
        .start_stream()
        .map_err(|e| format!("StartStream: {e}"))?;

    while !stop_flag.load(Ordering::Relaxed) {
        std::thread::sleep(std::time::Duration::from_millis(20));

        loop {
            let nframes = match capture_client.get_next_packet_size() {
                Ok(Some(n)) if n > 0 => n,
                Ok(_) => break,
                Err(_) => break,
            };

            let buf_size = nframes as usize * bytes_per_frame;
            let mut raw = vec![0u8; buf_size];

            if capture_client.read_from_device(&mut raw).is_err() {
                break;
            }

            let samples = raw_bytes_to_f32(&raw, bits_per_sample);
            let pcm_i16 = f32_to_mono_i16(&samples, channels);

            if tx.send(pcm_i16).is_err() {
                return Ok(());
            }
        }
    }

    audio_client
        .stop_stream()
        .map_err(|e| format!("StopStream: {e}"))?;
    Ok(())
}

/// Parse raw bytes from WASAPI capture into f32 samples.
/// Handles 32-bit IEEE float (common loopback format) and 16-bit PCM.
fn raw_bytes_to_f32(raw: &[u8], bits_per_sample: usize) -> Vec<f32> {
    match bits_per_sample {
        32 => raw
            .chunks_exact(4)
            .map(|b| f32::from_le_bytes(b.try_into().unwrap_or([0; 4])))
            .collect(),
        16 => raw
            .chunks_exact(2)
            .map(|b| i16::from_le_bytes(b.try_into().unwrap_or([0; 2])) as f32 / 32768.0)
            .collect(),
        _ => vec![0f32; raw.len() / (bits_per_sample.max(8) / 8)],
    }
}

/// Mix all channels to mono, then convert f32 [-1,1] → i16 LE bytes.
fn f32_to_mono_i16(samples: &[f32], channels: usize) -> Vec<u8> {
    let ch = channels.max(1);
    let frames = samples.len() / ch;
    let mut out = Vec::with_capacity(frames * 2);

    for i in 0..frames {
        let mut sum = 0f32;
        for c in 0..ch {
            sum += samples[i * ch + c];
        }
        let mono = (sum / ch as f32).clamp(-1.0, 1.0);
        let s = (mono * 32767.0) as i16;
        out.extend_from_slice(&s.to_le_bytes());
    }
    out
}
