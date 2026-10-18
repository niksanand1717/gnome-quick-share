#[macro_use]
extern crate log;

use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use rqs_lib::channel::{ChannelAction, ChannelDirection, ChannelMessage};
use rqs_lib::State;
use rqs_lib::RQS;
use tokio::sync::broadcast;

#[derive(Clone, Default, serde::Serialize)]
struct TransferInfo {
    state: String,
    device: String,
    file: String,
    total_bytes: u64,
    received_bytes: u64,
    progress: u8,
    speed: String,
    last_file: String,
    pid: u32,
}

fn get_status_path() -> PathBuf {
    let runtime_dir = std::env::var("XDG_RUNTIME_DIR").unwrap_or_else(|_| "/tmp".to_string());
    PathBuf::from(runtime_dir).join("quickshare.json")
}

fn save_status(info: &TransferInfo) {
    if let Ok(json) = serde_json::to_string(info) {
        let _ = fs::write(get_status_path(), json);
    }
}

#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
    if std::env::var("RUST_LOG").is_err() {
        std::env::set_var(
            "RUST_LOG",
            "INFO,mdns_sd=ERROR,polling=ERROR,neli=ERROR,bluez_async=ERROR",
        );
    }
    tracing_subscriber::fmt::init();

    info!("Starting Quick Share Core Service (rqs_lib)...");
    let mut rqs = RQS::default();
    let (_send_tx, _ble) = rqs.run().await?;

    let discovery_channel = broadcast::channel(10);
    let _ = rqs.discovery(discovery_channel.0);

    let my_pid = std::process::id();
    let state = Arc::new(Mutex::new(TransferInfo {
        state: "idle".to_string(),
        pid: my_pid,
        ..Default::default()
    }));
    save_status(&TransferInfo {
        state: "idle".to_string(),
        pid: my_pid,
        ..Default::default()
    });

    let mut rx = rqs.message_sender.subscribe();
    let sender = rqs.message_sender.clone();
    let state_clone = Arc::clone(&state);

    tokio::spawn(async move {
        let mut last_instant = Instant::now();
        let mut last_ack = 0u64;

        while let Ok(msg) = rx.recv().await {
            if msg.direction != ChannelDirection::LibToFront {
                continue;
            }

            match msg.state {
                Some(State::WaitingForUserConsent) => {
                    info!("Incoming transfer request. Auto-accepting...");
                    let _ = sender.send(ChannelMessage {
                        id: msg.id.clone(),
                        direction: ChannelDirection::FrontToLib,
                        action: Some(ChannelAction::AcceptTransfer),
                        ..Default::default()
                    });

                    if let Some(meta) = &msg.meta {
                        let dev = meta.source.as_ref().map(|s| s.name.clone()).unwrap_or_else(|| "Android Device".to_string());
                        let raw_fname = meta.files.as_ref().and_then(|f| f.first()).cloned().unwrap_or_else(|| "File".to_string());
                        // Sanitize filename to prevent directory traversal
                        let fname = std::path::Path::new(&raw_fname)
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or("File")
                            .to_string();
                        
                        let mut st = state_clone.lock().unwrap();
                        st.state = "receiving".to_string();
                        st.device = dev.clone();
                        st.file = fname.clone();
                        st.total_bytes = meta.total_bytes;
                        st.received_bytes = 0;
                        st.progress = 0;
                        st.pid = my_pid;
                        last_instant = Instant::now();
                        last_ack = 0;
                        save_status(&st);

                        // 1 single notification when transfer starts
                        let _ = Command::new("notify-send")
                            .args([
                                "-i", "send-to-symbolic",
                                "-u", "low",
                                "Quick Share",
                                &format!("Receiving from {}: {}", dev, fname)
                            ])
                            .spawn();
                    }
                }
                Some(State::ReceivingFiles) => {
                    if let Some(meta) = &msg.meta {
                        let now = Instant::now();
                        let elapsed = now.duration_since(last_instant).as_secs_f64();
                        let mut speed_str = String::new();

                        if elapsed >= 0.5 {
                            let diff = meta.ack_bytes.saturating_sub(last_ack);
                            let mbps = (diff as f64 / elapsed) / (1024.0 * 1024.0);
                            speed_str = format!("{:.1} MB/s", mbps);
                            last_instant = now;
                            last_ack = meta.ack_bytes;
                        }

                        let percent = if meta.total_bytes > 0 {
                            ((meta.ack_bytes as f64 / meta.total_bytes as f64) * 100.0) as u8
                        } else {
                            0
                        };

                        let mut st = state_clone.lock().unwrap();
                        st.state = "receiving".to_string();
                        st.received_bytes = meta.ack_bytes;
                        st.total_bytes = meta.total_bytes;
                        st.progress = percent.min(100);
                        if !speed_str.is_empty() {
                            st.speed = speed_str;
                        }
                        // Zero popups during transfer - pure RAM status for the UI progress bar!
                        save_status(&st);
                    }
                }
                Some(State::Finished) => {
                    let mut st = state_clone.lock().unwrap();
                    st.state = "finished".to_string();
                    st.progress = 100;
                    let last = st.file.clone();
                    st.last_file = last.clone();
                    save_status(&st);

                    // 1 single notification when transfer completes
                    let _ = Command::new("notify-send")
                        .args([
                            "-i", "send-to-symbolic",
                            "-u", "normal",
                            "Quick Share",
                            &format!("✓ Received: {} (Saved to Downloads)", last)
                        ])
                        .spawn();
                    info!("Transfer finished successfully.");
                }
                Some(State::Cancelled) | Some(State::Disconnected) | Some(State::Rejected) => {
                    let mut st = state_clone.lock().unwrap();
                    if st.state == "receiving" {
                        info!("Transfer ended ({:?}). Resetting state to idle.", msg.state);
                        st.state = "idle".to_string();
                        st.progress = 0;
                        st.speed = String::new();
                        save_status(&st);
                    }
                }
                _ => {}
            }
        }
    });

    info!("Quick Share Daemon running (1 start + 1 finish notification). Ready for transfers.");
    #[cfg(unix)]
    {
        use tokio::signal::unix::{signal, SignalKind};
        let mut sigterm = signal(SignalKind::terminate())?;
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {
                info!("Received SIGINT signal.");
            }
            _ = sigterm.recv() => {
                info!("Received SIGTERM signal.");
            }
        }
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }

    info!("Stopping service cleanly.");
    let _ = fs::remove_file(get_status_path());
    rqs.stop().await;

    Ok(())
}
