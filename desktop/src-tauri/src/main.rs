//! Omkreds FEM — skallen om modelvinduet.
//!
//! Beregningen er den samme Python-backend som omkreds.dk, pakket med
//! PyInstaller og lagt ind som resource (`backend/`). Ved start:
//!
//!   1. find en ledig port på 127.0.0.1
//!   2. start backend/omkreds-backend.exe --port N --no-browser, uden konsolvindue
//!   3. vis startsiden, og skift til http://127.0.0.1:N/fem.html, når den svarer
//!
//! Når programmet lukker, stoppes backend igen.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::{TcpListener, TcpStream};
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{Manager, RunEvent, Url, WebviewUrl, WebviewWindowBuilder};

struct Backend(Mutex<Option<Child>>);

fn ledig_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .unwrap_or(8765)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(Backend(Mutex::new(None)))
        .setup(|app| {
            let port = ledig_port();
            let exe = app
                .path()
                .resource_dir()?
                .join("backend")
                .join(if cfg!(windows) { "omkreds-backend.exe" } else { "omkreds-backend" });

            let mut cmd = Command::new(&exe);
            cmd.args(["--port", &port.to_string(), "--no-browser"]);
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x0800_0000;
                cmd.creation_flags(CREATE_NO_WINDOW);
            }
            let barn = cmd
                .spawn()
                .map_err(|e| format!("Kunne ikke starte beregningsdelen ({}): {e}", exe.display()))?;
            app.state::<Backend>().0.lock().unwrap().replace(barn);

            let vindue = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Omkreds FEM")
                .inner_size(1400.0, 900.0)
                .min_inner_size(900.0, 600.0)
                .maximized(true)
                .build()?;

            let url: Url = format!("http://127.0.0.1:{port}/fem.html").parse().unwrap();
            std::thread::spawn(move || {
                // Første start efter installation kan tage lidt tid (antivirus
                // scanner de udpakkede filer); vent op til to minutter.
                for _ in 0..1200 {
                    if TcpStream::connect(("127.0.0.1", port)).is_ok() {
                        std::thread::sleep(Duration::from_millis(300));
                        let _ = vindue.navigate(url);
                        return;
                    }
                    std::thread::sleep(Duration::from_millis(100));
                }
                let _ = vindue.eval(
                    "document.getElementById('status').textContent = \
                     'Beregningsdelen startede ikke. Send filen %TEMP%\\\\omkreds_fem.log til support.'",
                );
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Omkreds FEM kunne ikke starte")
        .run(|app, ev| {
            if let RunEvent::Exit = ev {
                if let Some(mut barn) = app.state::<Backend>().0.lock().unwrap().take() {
                    let _ = barn.kill();
                }
            }
        });
}
