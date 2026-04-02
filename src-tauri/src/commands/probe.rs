//! Shared probe functions for dependency checking.
//!
//! Extracted from the individual check commands to eliminate duplication.
//! All probe functions are non-destructive — they never modify system state.

use std::path::{Path, PathBuf};
use std::process::Command;

/// Decode process output bytes, trying strict UTF-8 first, falling back to lossy.
fn decode_output(bytes: &[u8]) -> String {
    String::from_utf8(bytes.to_vec())
        .unwrap_or_else(|e| String::from_utf8_lossy(e.as_bytes()).into_owned())
}

/// Check if a path points to a Windows Store Python stub.
///
/// The stub at `%LOCALAPPDATA%\Microsoft\WindowsApps\python3.exe` opens the
/// Microsoft Store instead of running Python. We detect it by checking for
/// "windowsapps" in the path.
#[cfg(target_os = "windows")]
pub fn is_windows_store_stub(path: &Path) -> bool {
    path.to_string_lossy()
        .to_lowercase()
        .contains("windowsapps")
}

/// Non-Windows platforms never have Store stubs.
#[cfg(not(target_os = "windows"))]
pub fn is_windows_store_stub(_path: &Path) -> bool {
    false
}

/// Find the Python executable on this system.
///
/// Tries `python3`, `python`, `py` (Windows), and common install paths.
pub fn find_python() -> Option<PathBuf> {
    for name in ["python3", "python", "py"] {
        if let Ok(path) = which::which(name) {
            if !is_windows_store_stub(&path) {
                return Some(path);
            }
        }
    }
    None
}

/// Check if a binary is available on PATH.
pub fn probe_binary(name: &str) -> bool {
    which::which(name).is_ok()
}

/// Get the version string from a binary by running it with a version flag.
/// Returns the first line of stdout, or stderr if stdout is empty.
pub fn probe_binary_version(name: &str, version_flag: &str) -> Option<String> {
    Command::new(name)
        .arg(version_flag)
        .output()
        .ok()
        .and_then(|o| {
            let stdout = decode_output(&o.stdout).trim().to_string();
            if !stdout.is_empty() {
                Some(stdout)
            } else {
                let stderr = decode_output(&o.stderr).trim().to_string();
                if !stderr.is_empty() {
                    Some(stderr)
                } else {
                    None
                }
            }
        })
}

/// Get the Python version string, handling both stdout and stderr output.
pub fn probe_python_version(python: &Path) -> Option<String> {
    Command::new(python)
        .arg("--version")
        .env("PYTHONUTF8", "1")
        .output()
        .ok()
        .and_then(|o| {
            let stdout = decode_output(&o.stdout).trim().to_string();
            if !stdout.is_empty() {
                Some(stdout)
            } else {
                let stderr = decode_output(&o.stderr).trim().to_string();
                if !stderr.is_empty() {
                    Some(stderr)
                } else {
                    None
                }
            }
        })
}

/// Check if a Python module can be imported.
pub fn probe_python_import(python: &Path, import_statement: &str) -> bool {
    Command::new(python)
        .args(["-c", import_statement])
        .env("PYTHONUTF8", "1")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Get the version of an installed Python package.
/// Runs `import <module>; print(<module>.__version__)`.
pub fn probe_python_package_version(python: &Path, module: &str) -> Option<String> {
    let code = format!("import {module}; print({module}.__version__)");
    Command::new(python)
        .args(["-c", &code])
        .env("PYTHONUTF8", "1")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| decode_output(&o.stdout).trim().to_string())
}

/// Check if CUDA is available via nvidia-smi.
pub fn probe_cuda() -> bool {
    Command::new("nvidia-smi")
        .arg("--query-gpu=name")
        .arg("--format=csv,noheader")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Check if CUDA is available through PyTorch.
pub fn probe_torch_cuda(python: &Path) -> bool {
    Command::new(python)
        .args([
            "-c",
            "import torch; print('yes' if torch.cuda.is_available() else 'no')",
        ])
        .env("PYTHONUTF8", "1")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| decode_output(&o.stdout).trim() == "yes")
        .unwrap_or(false)
}

/// Get the GPU name via nvidia-smi.
pub fn probe_gpu_name() -> Option<String> {
    Command::new("nvidia-smi")
        .arg("--query-gpu=name")
        .arg("--format=csv,noheader")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| decode_output(&o.stdout).trim().to_string())
}

/// Check if MPS (Apple Silicon GPU) is available. Always true on macOS.
pub fn probe_mps() -> bool {
    cfg!(target_os = "macos")
}

/// Get the PyTorch device string: "cuda", "mps", or "cpu".
pub fn probe_torch_device(python: &Path) -> Option<String> {
    Command::new(python)
        .args(["-c", "import torch; print('cuda' if torch.cuda.is_available() else 'mps' if torch.backends.mps.is_available() else 'cpu')"])
        .env("PYTHONUTF8", "1")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| decode_output(&o.stdout).trim().to_string())
}

/// Check if the torch + torchaudio import works.
pub fn probe_torchaudio(python: &Path) -> bool {
    probe_python_import(python, "import torch; import torchaudio")
}

/// Get the data directory for the app.
pub fn get_data_dir() -> PathBuf {
    directories::ProjectDirs::from("dev", "stemgen", "stemgen-gui")
        .map(|d| d.data_dir().to_path_buf())
        .unwrap_or_else(|| std::env::temp_dir().join("stemgen-gui"))
}

/// Refresh the current process's PATH environment variable from the OS.
///
/// On Windows, re-reads PATH from `cmd /C echo %PATH%` (which picks up
/// system-level changes made by installers like winget).
/// On Unix, re-reads PATH from the default shell profile.
pub fn refresh_path_from_registry() {
    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = Command::new("cmd").args(["/C", "echo", "%PATH%"]).output() {
            let path_str = decode_output(&output.stdout).trim().to_string();
            if !path_str.is_empty() && path_str != "%PATH%" {
                std::env::set_var("PATH", &path_str);
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(output) = Command::new("bash").args(["-lc", "echo $PATH"]).output() {
            let path_str = decode_output(&output.stdout).trim().to_string();
            if !path_str.is_empty() {
                std::env::set_var("PATH", &path_str);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_probe_binary_self() {
        // `which` itself should always be found in tests since we use it
        assert!(probe_binary("which") || probe_binary("where") || find_python().is_some());
    }

    #[test]
    fn test_mps_is_false_on_non_macos() {
        #[cfg(not(target_os = "macos"))]
        assert!(!probe_mps());

        #[cfg(target_os = "macos")]
        assert!(probe_mps());
    }

    #[test]
    fn test_decode_output_valid_utf8() {
        let bytes = "Hello, 世界!".as_bytes();
        assert_eq!(decode_output(bytes), "Hello, 世界!");
    }

    #[test]
    fn test_decode_output_invalid_utf8_falls_back_to_lossy() {
        // \xfc is 'ü' in Windows-1252/OEM-850 but invalid as a lone UTF-8 byte
        let bytes = vec![0x48, 0x65, 0x6c, 0x6c, 0x6f, 0xfc]; // "Hello" + invalid byte
        let result = decode_output(&bytes);
        assert!(result.starts_with("Hello"));
        // lossy conversion replaces invalid byte with U+FFFD
        assert!(result.contains('\u{FFFD}'));
    }

    #[test]
    fn fn_decode_output_empty() {
        assert_eq!(decode_output(&[]), "");
    }

    #[test]
    fn test_decode_output_ascii() {
        let bytes = b"ffmpeg version 4.2.1";
        assert_eq!(decode_output(bytes), "ffmpeg version 4.2.1");
    }

    #[test]
    fn test_is_windows_store_stub_with_windowsapps_path() {
        let stub = PathBuf::from(r"C:\Users\test\AppData\Local\Microsoft\WindowsApps\python3.exe");
        // On Windows this should be true; on non-Windows the cfg makes it always false
        #[cfg(target_os = "windows")]
        assert!(is_windows_store_stub(&stub));
        #[cfg(not(target_os = "windows"))]
        assert!(!is_windows_store_stub(&stub));
    }

    #[test]
    fn test_is_windows_store_stub_with_normal_path() {
        let normal = PathBuf::from(r"C:\Python312\python.exe");
        assert!(!is_windows_store_stub(&normal));
    }

    #[test]
    fn test_is_windows_store_stub_with_unix_path() {
        let unix = PathBuf::from("/usr/bin/python3");
        assert!(!is_windows_store_stub(&unix));
    }
}
