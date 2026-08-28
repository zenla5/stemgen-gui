# NixOS/Wayland Blank WebView — Root Cause & Fix Log

> Scope: the Stemgen GUI WebKitGTK webview renders an entirely blank/white window on
> NixOS 26.05 (GNOME on Wayland, Intel iGPU), while the Rust backend runs fine.
> This document records the root cause, the bisection that proved it, and the
> launcher environment that fixes it.

---

## 1. Symptom

- **Interactive GNOME session**: the window opens but is entirely blank/white — no UI
  content ever paints.
- **Headless/automated shell**: the process often aborts immediately with
  `Could not create default EGL display: EGL_BAD_PARAMETER. Aborting...`
- The Rust backend was always healthy: it deployed the Python sidecar, ran DB
  migrations, and wrote logs — only the WebKitGTK webview failed to render.

## 2. Root cause

The AppImage bundles an old **`libwayland-client.so.0`** (and `libwayland-egl.so.1`,
`libepoxy.so.0`) in its `usr/lib`. The AppImage's `AppRun.wrapped` **prepends**
`$APPDIR/usr/lib` to `LD_LIBRARY_PATH`, so the bundled `libwayland-client.so.0`
shadows the host Mesa/wayland stack.

WebKit's EGL layer asks glvnd for a Wayland platform display via
`eglGetPlatformDisplay`. When Mesa's EGL code resolves the *bundled* old
`libwayland-client.so.0`, platform creation fails with `EGL_BAD_PARAMETER`:

1. The WebKit **WebProcess** (the renderer) aborts on the EGL failure.
2. The main window survives (owned by the UI process) but its webview surface is
   never painted → blank/white content.

## 3. Bisection proof

An EGL probe (`eglGetPlatformDisplay` + `eglInitialize`) for `x11` / `wayland` /
`surfaceless` platforms was run against the host GL stack (libglvnd + Mesa), with a
single bundled library added at a time on `LD_LIBRARY_PATH`:

| Bundled lib on `LD_LIBRARY_PATH` | Result |
|---|---|
| *(none — host libs only)* | ✅ handle set, `eglInitialize=1` (EGL 1.5) for all platforms |
| bundled `libepoxy.so.0` | ❌ handle=0, err=`EGL_BAD_PARAMETER` (12300) |
| bundled `libwayland-egl.so.1` | ✅ still works |
| bundled `libwayland-server.so.0` | ✅ still works |
| bundled `libwayland-cursor.so.0` | ✅ still works |
| **bundled `libwayland-client.so.0`** | ❌ handle=0, err=`EGL_BAD_PARAMETER` (12300) |

Preloading the **host** `libwayland-client.so.0` while the bundled copy was still on
the path restored working EGL:

```
platform x11:          handle=0x57…, eglInitialize=1 (EGL 1.5)
platform wayland:      handle=0x57…, eglInitialize=1 (EGL 1.5)
platform surfaceless:  handle=0x57…, eglInitialize=1 (EGL 1.5)
```

So the single offender is the bundled `libwayland-client.so.0`.

## 4. The fix (launcher environment)

Force the host Wayland/glvnd/Mesa stack to win inside the AppImage sandbox:

```bash
GCC_LIB=/nix/store/z0n70pxyzi87why1bcq81zgd7b924nfj-gcc-15.2.0-lib/lib
VENV=/home/zenlab/Projects/stemgen-gui/.venv

# Host GL stack first (glvnd, Mesa, Wayland) — and force host libwayland-client.
export LD_LIBRARY_PATH="\
/nix/store/8yjiif0mmgzy5f95j53r46nf4nryjj3a-libglvnd-1.7.0/lib:\
/nix/store/6q9zxz6km0z4dmlxi6yrdp8rccbh49m1-mesa-26.1.8/lib:\
/nix/store/4qangvdf3rkv93bpi2sjjg695zcs2mqx-wayland-1.25.0/lib:\
/run/opengl-driver/lib:${GCC_LIB}"

# KEY: the bundled libwayland-client.so.0 wins by path because AppRun prepends
# its usr/lib AFTER this. LD_PRELOAD forces the host copy regardless.
export LD_PRELOAD="/nix/store/4qangvdf3rkv93bpi2sjjg695zcs2mqx-wayland-1.25.0/lib/libwayland-client.so.0"

# Let libEGL (glvnd) find Mesa's EGL vendor ICD + DRI drivers.
export EGL_VENDOR_LIBRARY_FILES="/nix/store/6q9zxz6km0z4dmlxi6yrdp8rccbh49m1-mesa-26.1.8/share/glvnd/egl_vendor.d/50_mesa.json"
export LIBGL_DRIVERS_PATH="/nix/store/6q9zxz6km0z4dmlxi6yrdp8rccbh49m1-mesa-26.1.8/lib/dri"

# Native backend; keep DMABUF off (more reliable on this Intel/Wayland box).
unset GDK_BACKEND
unset WEBKIT_DISABLE_COMPOSITING_MODE
export WEBKIT_DISABLE_DMABUF_RENDERER=1

exec /nix/store/6xbqb8plx4h9pay6zy7dclcc18kk0pk6-appimage-run/bin/appimage-run \
  /nix/store/15lrnw6pxz2xmg5jrkarnr7w1xi9p690-stemgen-gui-1.5.0/libexec/Stemgen-GUI.AppImage "$@"
```

> The NixOS *package* (`pkgs/stemgen-gui/default.nix`) now ships this env in its
> generated `stemgen-gui` launcher using `pkgs`-relative paths, so a plain
> `programs.appimage.enable` + `environment.systemPackages` install is fixed out of
> the box. The recipe above is only needed when running the raw AppImage.

## 5. Verification (white-pixel analysis)

App launched via the fixed launcher, window captured with `import -window <id>`
(client surface, not the WM frame):

```
ImageMagick: mean=0.190686 std=0.158948 colors=3028   (capture 1)
ImageMagick: mean=0.190686 std=0.158948 colors=3028   (capture 2, +5s)
Renderer:   stemgen-gui + WebKitNetworkProcess + WebKitWebProcess all alive
```

Blank threshold is `mean > 0.98 AND std < 0.01 AND colors <= 2`. The measured
`mean≈0.19, std≈0.16, colors≈3000` is decisively non-white and stable across
captures. No `EGL_BAD_PARAMETER` abort is printed.

## 6. Why not other candidates

Tried sequentially before landing on the fix (all rejected because EGL still
aborted and/or the client surface stayed `colors=1`):

- `GDK_BACKEND=x11` + software GL (`LIBGL_ALWAYS_SOFTWARE=1`) + `GSK_RENDERER=cairo`
- Adding `WEBKIT_FORCE_SANDBOX=0` / `WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1`
- Prepending host wayland lib dir to `LD_LIBRARY_PATH`
- Host glvnd + `EGL_VENDOR_LIBRARY_FILES` + `LIBGL_DRIVERS_PATH` on the path
- `LD_PRELOAD` of host `libepoxy.so.0`

None addresses the core problem: the bundled `libwayland-client.so.0` still won by
path. Only preloading **host** `libwayland-client.so.0` (candidate L) cleared the
abort and produced live content — confirmed in both the interactive GNOME session
and the automated shell.

## 7. Future / optional

- The AppImage bundler (`tauri.conf.json` → `bundle.linux`) could exclude the old
  `libwayland-client.so.0`/`libwayland-egl.so.1`/`libepoxy.so.0` at build time so
  AppImage users need no env override. This is a whole-distro change and was left
  as a documented follow-up; the launcher env is the verified, low-risk fix.