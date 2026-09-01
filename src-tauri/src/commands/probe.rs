//! Shared probe functions for dependency checking.
//!
//! Extracted from the individual check commands to eliminate duplication.
//! All probe functions are non-destructive — they never modify system state.

use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Maximum time to wait for a probe process before treating it as "not installed".
const PROBE_TIMEOUT_SECS: u64 = 10;

/// Platform-aware helper — suppresses the console window that Win32 creates
/// when spawning child processes from a GUI application (WS_VISIBLE is set by
/// default). On non-Windows targets this is a compile-time no-op.
///
/// Usage: `Command::new("ffmpeg").no_window().arg("-version").output()`
pub trait NoWindow {
    fn no_window(&mut self) -> &mut Self;
}

impl NoWindow for std::process::Command {
    fn no_window(&mut self) -> &mut Self {
        #[cfg(target_os = "windows")]
        {
            #[allow(unused_imports)]
            use std::os::windows::process::CommandExt;
            // CREATE_NO_WINDOW = 0x08000000
            self.creation_flags(0x08000000);
        }
        self
    }
}

impl NoWindow for tokio::process::Command {
    fn no_window(&mut self) -> &mut Self {
        #[cfg(target_os = "windows")]
        {
            #[allow(unused_imports)]
            use std::os::windows::process::CommandExt;
            self.creation_flags(0x08000000);
        }
        self
    }
}

/// Prepare a `Command`'s environment for running a Python interpreter.
///
/// GUI-launched processes can inherit a polluted Python environment: the
/// AppImage runtime extracts to `~/.cache/.../usr/` and exports `PYTHONHOME`
/// and `PYTHONPATH` pointing into its own payload. A child interpreter then
/// resolves its stdlib from that dir instead of its own prefix and dies during
/// startup with `Fatal Python error: Failed to import encodings module`
/// (`sys.prefix` == AppImage `usr/` while `sys.executable` is the real one).
///
/// The runtime also prepends the payload's `usr/lib` to `LD_LIBRARY_PATH`.
/// That dir ships an old OpenSSL (`libssl.so.3`/`libcrypto.so.3` built against
/// OpenSSL 3.0). When a Python child inherits it ahead of its own prefix, the
/// interpreter's `_ssl` module (built against OpenSSL >= 3.3) fails to import
/// with `version 'OPENSSL_3.3.0' not found`, so `urllib` loses its HTTPS
/// handler and model downloads fail with `unknown url type: https`.
///
/// This helper strips those environment entries from the child environment so
/// the interpreter bootstraps from its own `pyvenv.cfg`/prefix with its own
/// OpenSSL, and forces UTF-8 mode (the legacy `PYTHONUTF8=1` behavior) in one
/// step.
///
/// Usage: `Command::new(python).python_env().arg("--version")`
///
/// It is safe to call on any `Command`: non-Python programs ignore most of
/// these variables, and `python_env()` is only used on Python children anyway.
pub trait PythonEnv {
    fn python_env(&mut self) -> &mut Self;
}

/// Whether `path` is the AppImage payload's shared-library directory
/// (`<cache>/appimage-run/<sha>/usr/lib`), which ships an old OpenSSL that
/// shadows the real Python interpreter's `_ssl`.
fn is_appimage_payload_lib_dir(path: &Path) -> bool {
    let text = path.to_string_lossy();
    text.contains("appimage-run") && text.ends_with("usr/lib")
}

/// Return the parent's `LD_LIBRARY_PATH` with any AppImage payload `usr/lib`
/// entry removed, so Python children load their own OpenSSL instead of the
/// bundled one. Returns `None` if nothing meaningful survives.
fn sanitize_ld_library_path() -> Option<String> {
    let raw = std::env::var_os("LD_LIBRARY_PATH")?;
    let cleaned: Vec<String> = std::env::split_paths(&raw)
        .filter(|p| !is_appimage_payload_lib_dir(p))
        .map(|p| p.to_string_lossy().into_owned())
        .collect();
    if cleaned.is_empty() {
        None
    } else {
        std::env::join_paths(&cleaned)
            .ok()
            .map(|v| v.to_string_lossy().into_owned())
    }
}

fn apply_ld_library_path_sanitization(cmd: &mut std::process::Command) {
    match sanitize_ld_library_path() {
        Some(cleaned) => {
            cmd.env("LD_LIBRARY_PATH", cleaned);
        }
        None => {
            cmd.env_remove("LD_LIBRARY_PATH");
        }
    }
}

fn apply_ld_library_path_sanitization_tokio(cmd: &mut tokio::process::Command) {
    match sanitize_ld_library_path() {
        Some(cleaned) => {
            cmd.env("LD_LIBRARY_PATH", cleaned);
        }
        None => {
            cmd.env_remove("LD_LIBRARY_PATH");
        }
    }
}

impl PythonEnv for std::process::Command {
    fn python_env(&mut self) -> &mut Self {
        apply_ld_library_path_sanitization(self);
        self.env("PYTHONUTF8", "1")
            .env_remove("PYTHONHOME")
            .env_remove("PYTHONPATH")
    }
}

impl PythonEnv for tokio::process::Command {
    fn python_env(&mut self) -> &mut Self {
        apply_ld_library_path_sanitization_tokio(self);
        self.env("PYTHONUTF8", "1")
            .env_remove("PYTHONHOME")
            .env_remove("PYTHONPATH")
    }
}

/// Decode process output bytes, trying strict UTF-8 first, falling back to lossy.
fn decode_output(bytes: &[u8]) -> String {
    String::from_utf8(bytes.to_vec())
        .unwrap_or_else(|e| String::from_utf8_lossy(e.as_bytes()).into_owned())
}

/// Run a `std::process::Command` with a timeout, collecting stdout and stderr.
///
/// Returns `(stdout, stderr, exit_success)` on success within the timeout.
/// Returns `None` if the process does not finish in time — the child is killed
/// before returning (best-effort).
fn run_command_with_timeout(
    cmd: &mut Command,
    timeout_secs: u64,
) -> Option<(String, String, bool)> {
    let mut child = cmd
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .ok()?;

    let mut stdout_pipe = child.stdout.take()?;
    let mut stderr_pipe = child.stderr.take()?;

    let stdout_handle = std::thread::spawn(move || {
        let mut buf = Vec::new();
        stdout_pipe.read_to_end(&mut buf).ok();
        decode_output(&buf)
    });

    let stderr_handle = std::thread::spawn(move || {
        let mut buf = Vec::new();
        stderr_pipe.read_to_end(&mut buf).ok();
        decode_output(&buf)
    });

    // Use a channel so we can recv_timeout on the child's exit status.
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(child.wait());
    });

    match rx.recv_timeout(std::time::Duration::from_secs(timeout_secs)) {
        Ok(Ok(status)) => {
            let stdout = stdout_handle.join().unwrap_or_default();
            let stderr = stderr_handle.join().unwrap_or_default();
            Some((stdout, stderr, status.success()))
        }
        _ => {
            // Timed out — return immediately without joining the I/O threads.
            // Joining would block if the child process is still alive and holding
            // its pipe handles open (e.g. a hung nvidia-smi on Windows CI).
            // The spawned threads will exit naturally once the process eventually
            // terminates (the wait thread above will kill fd references).
            // Drop the join handles so the threads run detached.
            drop(stdout_handle);
            drop(stderr_handle);
            None
        }
    }
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
    find_python_in_path(std::env::var_os("PATH").as_deref())
}

/// Find a Python executable by searching an explicit PATH list.
///
/// `paths` is a PATH-format string (colon/semicolon separated) searched
/// instead of the process environment when `Some`. Passing an explicit PATH
/// is required: in `which` v8.x `which_in` does NOT fall back to the ambient
/// `PATH` for a `None` path list, it fails with
/// `CannotGetCurrentDirAndPathListEmpty`. Keeping the search path explicit
/// lets tests probe arbitrary directories without mutating the
/// process-global environment (which would race with other parallel tests
/// that spawn children).
fn find_python_in_path(paths: Option<&std::ffi::OsStr>) -> Option<PathBuf> {
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    for name in ["python3", "python", "py"] {
        if let Ok(path) = which::which_in(name, paths, &cwd) {
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
    run_command_with_timeout(
        Command::new(name).arg(version_flag).no_window(),
        PROBE_TIMEOUT_SECS,
    )
    .and_then(|(stdout, stderr, _success)| {
        let stdout = stdout.trim().to_string();
        if !stdout.is_empty() {
            Some(stdout)
        } else {
            let stderr = stderr.trim().to_string();
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
    run_command_with_timeout(
        Command::new(python)
            .arg("--version")
            .python_env()
            .no_window(),
        PROBE_TIMEOUT_SECS,
    )
    .and_then(|(stdout, stderr, _success)| {
        let stdout = stdout.trim().to_string();
        if !stdout.is_empty() {
            Some(stdout)
        } else {
            let stderr = stderr.trim().to_string();
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
    run_command_with_timeout(
        Command::new(python)
            .args(["-c", import_statement])
            .python_env()
            .no_window(),
        PROBE_TIMEOUT_SECS,
    )
    .map(|(_, _, success)| success)
    .unwrap_or(false)
}

/// Get the version of an installed Python package.
/// Runs `import <module>; print(<module>.__version__)`.
pub fn probe_python_package_version(python: &Path, module: &str) -> Option<String> {
    let code = format!("import {module}; print({module}.__version__)");
    run_command_with_timeout(
        Command::new(python)
            .args(["-c", &code])
            .python_env()
            .no_window(),
        PROBE_TIMEOUT_SECS,
    )
    .filter(|(_, _, success)| *success)
    .map(|(stdout, _, _)| stdout.trim().to_string())
}

/// Check if CUDA is available via nvidia-smi.
pub fn probe_cuda() -> bool {
    run_command_with_timeout(
        Command::new("nvidia-smi")
            .args(["--query-gpu=name", "--format=csv,noheader"])
            .no_window(),
        PROBE_TIMEOUT_SECS,
    )
    .map(|(_, _, success)| success)
    .unwrap_or(false)
}

/// Check if CUDA is available through PyTorch.
pub fn probe_torch_cuda(python: &Path) -> bool {
    run_command_with_timeout(
        Command::new(python)
            .args([
                "-c",
                "import torch; print('yes' if torch.cuda.is_available() else 'no')",
            ])
            .python_env()
            .no_window(),
        PROBE_TIMEOUT_SECS,
    )
    .filter(|(_, _, success)| *success)
    .map(|(stdout, _, _)| stdout.trim() == "yes")
    .unwrap_or(false)
}

/// Get the GPU name via nvidia-smi.
pub fn probe_gpu_name() -> Option<String> {
    run_command_with_timeout(
        Command::new("nvidia-smi")
            .args(["--query-gpu=name", "--format=csv,noheader"])
            .no_window(),
        PROBE_TIMEOUT_SECS,
    )
    .filter(|(_, _, success)| *success)
    .map(|(stdout, _, _)| stdout.trim().to_string())
}

/// Check if MPS (Apple Silicon GPU) is available. Always true on macOS.
pub fn probe_mps() -> bool {
    cfg!(target_os = "macos")
}

/// Get the PyTorch device string: "cuda", "mps", or "cpu".
pub fn probe_torch_device(python: &Path) -> Option<String> {
    run_command_with_timeout(
        Command::new(python)
            .args(["-c", "import torch; print('cuda' if torch.cuda.is_available() else 'mps' if torch.backends.mps.is_available() else 'cpu')"])
            .python_env()
            .no_window(),
        PROBE_TIMEOUT_SECS,
    )
    .filter(|(_, _, success)| *success)
    .map(|(stdout, _, _)| stdout.trim().to_string())
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

/// Return the platform-specific models directory.
pub fn get_models_dir() -> PathBuf {
    get_data_dir().join("models")
}

/// Refresh the current process's PATH environment variable from the OS.
///
/// On Windows, re-reads PATH from `cmd /C echo %PATH%` (which picks up
/// system-level changes made by installers like winget).
/// On Unix, re-reads PATH from the default shell profile.
pub fn refresh_path_from_registry() {
    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = Command::new("cmd")
            .args(["/C", "echo", "%PATH%"])
            .no_window()
            .output()
        {
            let path_str = decode_output(&output.stdout).trim().to_string();
            if !path_str.is_empty() && path_str != "%PATH%" {
                std::env::set_var("PATH", &path_str);
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        // Use `sh -c` instead of `bash -l` to avoid hanging on profile
        // file sourcing in CI environments (e.g. xvfb-run on Linux).
        if let Ok(output) = Command::new("sh")
            .args(["-c", "echo $PATH"])
            .no_window()
            .output()
        {
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
        // `probe_binary` resolves names against PATH (via the `which` crate),
        // which varies across CI guest images (e.g. `which` is not guaranteed to
        // be on PATH on every runner). Use an absolute POSIX command so the
        // positive case is deterministic, and still exercise the negative case.
        assert!(!probe_binary("definitely-not-a-real-command-xyz-9876"));

        let absolute = [
            "/usr/bin/true",
            "/bin/true",
            "C:\\Windows\\System32\\where.exe",
        ]
        .iter()
        .any(|p| probe_binary(p));
        let relative = ["which", "where", "ls", "find", "dir"]
            .iter()
            .any(|c| probe_binary(c));

        assert!(
            absolute || relative,
            "probe_binary could not resolve any common command"
        );
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

    #[test]
    fn test_is_windows_store_stub_with_mixed_case() {
        // The function does .to_lowercase() so "WindowsApps" (mixed case) is detected
        let mixed = PathBuf::from(r"C:\Users\test\AppData\Local\Microsoft\WindowsApps\python.exe");
        #[cfg(target_os = "windows")]
        assert!(is_windows_store_stub(&mixed));
        #[cfg(not(target_os = "windows"))]
        assert!(!is_windows_store_stub(&mixed));
    }

    #[test]
    fn test_is_windows_store_stub_with_root_level_windowsapps() {
        let root = PathBuf::from(r"C:\WindowsApps\python3.exe");
        #[cfg(target_os = "windows")]
        assert!(is_windows_store_stub(&root));
        #[cfg(not(target_os = "windows"))]
        assert!(!is_windows_store_stub(&root));
    }

    #[test]
    fn test_is_windows_store_stub_with_python_path_no_windowsapps() {
        // A path containing "python" but not "windowsapps" should NOT be detected as a stub
        let path = PathBuf::from(r"C:\Users\test\python\python.exe");
        assert!(!is_windows_store_stub(&path));
    }

    #[test]
    fn test_no_window_probe_runs_without_hanging() {
        // If CREATE_NO_WINDOW is mis-applied (e.g. wrong flag) the process
        // will still spawn; we just verify it exits normally.
        // Use an absolute path so the command is found even if a concurrently
        // running test temporarily overrides PATH.
        let mut cmd = Command::new(if cfg!(windows) { "cmd" } else { "/bin/echo" });
        if cfg!(windows) {
            cmd.args(["/C", "echo", "hello"]);
        } else {
            cmd.arg("hello");
        }
        let output = cmd.no_window().output().expect("command failed to run");
        assert!(output.status.success());
    }

    #[test]
    fn test_probe_binary_version_completes_quickly() {
        // A simple binary like echo should return in under 5 seconds.
        use std::time::Instant;
        let start = Instant::now();
        let _ = probe_binary_version("echo", "");
        let elapsed = start.elapsed();
        assert!(elapsed.as_secs() < 5, "probe took too long: {elapsed:?}");
    }

    /// Args for a command that prints `PYTHONHOME`, `PYTHONPATH`, `PYTHONUTF8`
    /// as `<NAME>=SET`/`<NAME>=UNSET` (in that order). Uses `if defined` (CMD)
    /// / `${VAR+x}` (sh) so an unset and a set-empty variable are both reported
    /// unambiguously.
    fn python_env_marker_args() -> Vec<String> {
        let script = if cfg!(windows) {
            "if defined PYTHONHOME (echo PYTHONHOME=SET) else (echo PYTHONHOME=UNSET) & \
             if defined PYTHONPATH (echo PYTHONPATH=SET) else (echo PYTHONPATH=UNSET) & \
             if defined PYTHONUTF8 (echo PYTHONUTF8=SET) else (echo PYTHONUTF8=UNSET)"
        } else {
            "if [ -n \"${PYTHONHOME+x}\" ]; then echo PYTHONHOME=SET; else echo PYTHONHOME=UNSET; fi; \
             if [ -n \"${PYTHONPATH+x}\" ]; then echo PYTHONPATH=SET; else echo PYTHONPATH=UNSET; fi; \
             if [ -n \"${PYTHONUTF8+x}\" ]; then echo PYTHONUTF8=SET; else echo PYTHONUTF8=UNSET; fi"
        }
        .to_string();

        if cfg!(windows) {
            vec!["/C".to_string(), script]
        } else {
            vec!["-c".to_string(), script]
        }
    }

    /// Check that `python_env()` strips `PYTHONHOME`/`PYTHONPATH` from the
    /// child environment and forces `PYTHONUTF8=1`, even when the parent
    /// process has all three polluted. Guards the AppImage crash
    /// (`Failed to import encodings module`) regression: the runtime exports
    /// `PYTHONHOME`/`PYTHONPATH` pointing into its own payload, which breaks
    /// every spawned interpreter unless the child strips them.
    #[test]
    fn test_python_env_strips_appimage_pollution() {
        // Simulate the AppImage runtime polluting the parent environment.
        for (name, value) in [
            ("PYTHONHOME", "/tmp/fake-appimage/pythonhome"),
            ("PYTHONPATH", "/tmp/fake-appimage/pyshared:"),
            ("PYTHONUTF8", "0"),
        ] {
            std::env::set_var(name, value);
        }

        let output = Command::new(if cfg!(windows) { "cmd" } else { "sh" })
            .python_env()
            .args(python_env_marker_args())
            .output();

        // Clean up the pollution we injected before unwrapping, so a spawn
        // failure (which panics) cannot leak the vars to other tests.
        for name in ["PYTHONHOME", "PYTHONPATH", "PYTHONUTF8"] {
            std::env::remove_var(name);
        }

        let output = output.expect("env marker command failed to run");

        assert!(output.status.success());
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let markings: Vec<&str> = stdout.lines().map(|l| l.trim()).collect();
        assert_eq!(
            markings,
            ["PYTHONHOME=UNSET", "PYTHONPATH=UNSET", "PYTHONUTF8=SET"],
            "python_env() must strip PYTHONHOME/PYTHONPATH and force PYTHONUTF8=1; got: {stdout:?}"
        );
    }

    /// tokio variant of `test_python_env_strips_appimage_pollution` — guards
    /// the `tokio::process::Command` impl used by model downloads and
    /// dependency installs.
    #[tokio::test]
    async fn test_python_env_tokio_strips_appimage_pollution() {
        for (name, value) in [
            ("PYTHONHOME", "/tmp/fake-appimage/pythonhome"),
            ("PYTHONPATH", "/tmp/fake-appimage/pyshared:"),
            ("PYTHONUTF8", "0"),
        ] {
            std::env::set_var(name, value);
        }

        let program = if cfg!(windows) { "cmd" } else { "sh" };
        let output = tokio::process::Command::new(program)
            .python_env()
            .args(python_env_marker_args())
            .output()
            .await;

        // Clean up the pollution we injected before unwrapping, so a spawn
        // failure (which panics) cannot leak the vars to other tests.
        for name in ["PYTHONHOME", "PYTHONPATH", "PYTHONUTF8"] {
            std::env::remove_var(name);
        }

        let output = output.expect("env marker command failed to run");

        assert!(output.status.success());
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let markings: Vec<&str> = stdout.lines().map(|l| l.trim()).collect();
        assert_eq!(
            markings,
            ["PYTHONHOME=UNSET", "PYTHONPATH=UNSET", "PYTHONUTF8=SET"],
            "python_env() must strip PYTHONHOME/PYTHONPATH and force PYTHONUTF8=1; got: {stdout:?}"
        );
    }

    /// Check that `python_env()` strips the AppImage payload `usr/lib` from
    /// `LD_LIBRARY_PATH` while preserving other (host) entries. Guards the
    /// `unknown url type: https` model-download regression #218: the runtime
    /// prepends its bundled OpenSSL `usr/lib` to the child's loader path, which
    /// breaks the interpreter's `_ssl` and kills `urllib` HTTPS.
    #[cfg(not(target_os = "windows"))]
    #[test]
    fn test_python_env_strips_appimage_payload_from_ld_library_path() {
        let payload_lib = "/tmp/fake-appimage/cache/appimage-run/abc123/usr/lib";
        let host_lib = "/nix/store/some-pkg/lib";
        let original = std::env::var_os("LD_LIBRARY_PATH");
        std::env::set_var("LD_LIBRARY_PATH", format!("{payload_lib}:{host_lib}"));

        let output = Command::new("sh")
            .python_env()
            .args(["-c", "printf '%s' \"$LD_LIBRARY_PATH\""])
            .output();

        // Restore the parent env before unwrapping so a spawn failure cannot
        // leak the injected value to other tests.
        match original {
            Some(v) => std::env::set_var("LD_LIBRARY_PATH", v),
            None => std::env::remove_var("LD_LIBRARY_PATH"),
        }

        let output = output.expect("ld_library_path marker command failed to run");
        assert!(output.status.success(), "{output:?}");
        let child_ld_library_path =
            String::from_utf8_lossy(&output.stdout).trim().to_string();
        assert_eq!(
            child_ld_library_path, host_lib,
            "python_env() must remove the AppImage payload usr/lib from \
             LD_LIBRARY_PATH but keep host entries; got: {child_ld_library_path:?}"
        );
    }

    #[test]
    fn test_find_python_returns_none_when_no_python_in_path() {
        // Build a PATH pointing only at an empty temp dir (no python, no sh)
        // and pass it explicitly. Crucially we do NOT mutate the process-global
        // environment: doing so would race with other tests in this module that
        // spawn children (e.g. `sh`) using `PATH`, causing spurious CI failures.
        let temp_dir = std::env::temp_dir().join("stemgen-test-no-python");
        std::fs::create_dir_all(&temp_dir).ok();
        let isolated_path = Some(temp_dir.as_os_str());

        let result = find_python_in_path(isolated_path);

        // Clean up temp dir
        let _ = std::fs::remove_dir_all(&temp_dir);

        // Assert that no Python was found in the isolated PATH
        assert!(
            result.is_none(),
            "find_python should return None when no Python is in PATH"
        );
    }

    #[test]
    fn test_find_python_resolves_on_real_path() {
        // Regression test for #215: find_python() passed paths=None to
        // which_in(), which in `which` v8.x fails with
        // CannotGetCurrentDirAndPathListEmpty instead of falling back to the
        // ambient PATH. On CI (and this NixOS/Ubuntu runner) a python3 /
        // python must be present on PATH, so find_python() should resolve.
        let result = find_python();
        let path = result.expect("find_python should resolve a Python on the real PATH");
        assert!(
            path.as_os_str().to_string_lossy().contains("python"),
            "resolved python path should mention python, got: {path:?}"
        );
    }
}

#[test]
fn test_get_models_dir_contains_expected_segments() {
    let path = get_models_dir();
    let path_str = path.to_string_lossy();
    assert!(path_str.contains("stemgen-gui"));
    assert!(path_str.contains("models"));
}
