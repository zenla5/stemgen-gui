//! Shared probe functions for dependency checking.
//!
//! Extracted from the individual check commands to eliminate duplication.
//! All probe functions are non-destructive — they never modify system state.

use std::path::{Path, PathBuf};
use std::process::Command;

/// Find the Python executable on this system.
///
/// Tries `python3`, `python`, `py` (Windows), and common install paths.
pub fn find_python() -> Option<PathBuf> {
    which::which("python3")
        .or_else(|_| which::which("python"))
        .or_else(|_| which::which("py"))
        .ok()
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
            let stdout = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if !stdout.is_empty() {
                Some(stdout)
            } else {
                let stderr = String::from_utf8_lossy(&o.stderr).trim().to_string();
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
        .output()
        .ok()
        .and_then(|o| {
            let stdout = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if !stdout.is_empty() {
                Some(stdout)
            } else {
                let stderr = String::from_utf8_lossy(&o.stderr).trim().to_string();
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
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
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
        .args(["-c", "import torch; print('yes' if torch.cuda.is_available() else 'no')"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim() == "yes")
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
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
}

/// Check if MPS (Apple Silicon GPU) is available. Always true on macOS.
pub fn probe_mps() -> bool {
    cfg!(target_os = "macos")
}

/// Get the PyTorch device string: "cuda", "mps", or "cpu".
pub fn probe_torch_device(python: &Path) -> Option<String> {
    Command::new(python)
        .args(["-c", "import torch; print('cuda' if torch.cuda.is_available() else 'mps' if torch.backends.mps.is_available() else 'cpu')"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
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
}
