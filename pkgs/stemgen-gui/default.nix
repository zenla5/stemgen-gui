# Stemgen GUI for NixOS
#
# This derivation packages the prebuilt, signed AppImage produced by the
# project's "Release Build" GitHub Actions workflow. On NixOS, AppImages run
# as-is, so this simply fetches the release AppImage and installs it together
# with a small launcher.
#
# Usage (e.g. from configuration.nix):
#
#   { pkgs, ... }:
#   {
#     environment.systemPackages = [ (
#       import ./pkgs/stemgen-gui {
#         inherit pkgs;
#         version = "1.4.7";
#         # SHA-256 of the AppImage. Get it from the release's SHA256SUMS.txt.
#         amd64Hash = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
#       }
#     ) ];
#     programs.appimage.enable = true;
#   }
#
# Note: the version and SHA-256 hash must be updated for each release. The
# Release Build workflow regenerates this file automatically with the correct
# values for the tag being released.

{ pkgs
, version ? "1.4.7"
, amd64Hash ? null
# Optional: build from a locally-built AppImage path instead of the GitHub
# release URL. Used by the CI NixOS job to build before a release exists.
, src ? null
}:

let
  appImage =
    if src != null then
      src
    else
      pkgs.fetchurl {
        url = "https://github.com/zenla5/stemgen-gui/releases/download/v${version}/Stemgen.GUI_${version}_amd64.AppImage";
        sha256 = amd64Hash;
      };
  libglvnd = pkgs.libglvnd;
  mesa = pkgs.mesa;
  wayland = pkgs.wayland;
  # Host graphics stack. The AppImage bundles an old libwayland-client.so.0 in
  # usr/lib, which its AppRun prepends to LD_LIBRARY_PATH, shadowing host Mesa.
  # WebKit's EGL Wayland platform then fails with EGL_BAD_PARAMETER, the WebKit
  # WebProcess aborts and the window renders blank. Forcing the host
  # libwayland-client (via LD_PRELOAD) plus host glvnd/Mesa (via path + vendor
  # ICD + DRI drivers) restores rendering.
  eglEnv = ''
    export LD_LIBRARY_PATH="${libglvnd}/lib:${mesa}/lib:${wayland}/lib:/run/opengl-driver/lib''${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
    export LD_PRELOAD="${wayland}/lib/libwayland-client.so.0"
    export EGL_VENDOR_LIBRARY_FILES="${mesa}/share/glvnd/egl_vendor.d/50_mesa.json"
    export LIBGL_DRIVERS_PATH="${mesa}/lib/dri"
    unset WEBKIT_DISABLE_COMPOSITING_MODE
    export WEBKIT_DISABLE_DMABUF_RENDERER=1
  '';
in
pkgs.runCommand "stemgen-gui-${version}" { } ''
  mkdir -p $out/bin $out/libexec
  install -Dm755 ${appImage} $out/libexec/Stemgen-GUI.AppImage
  cat > $out/bin/stemgen-gui <<EOF
  #!/usr/bin/env bash
  ${eglEnv}
  # Cosmetic warning: the AppImage bundles its own atk-bridge which talks over
  # D-Bus to the host AT-SPI2 daemon. If the bundled GLib/atk-bridge protocol
  # version differs from the host's, GLib prints a single benign line at
  # startup:
  #   ** (stemgen-gui:NNNNN): WARNING **: atk-bridge: get_device_events_reply:
  #   unknown signature
  # It has no functional impact (accessibility still works, the window renders
  # fine). The mismatch originates from the bundled atk-bridge inside the
  # shipped AppImage, which is not built here, so it cannot be cleanly pinned
  # or patched from this launcher. Setting NO_AT_BRIDGE=1 would hide it but
  # disables accessibility entirely and is NOT done here. Tracked as wontfix
  # (see issue #169).
  exec ${pkgs.appimage-run}/bin/appimage-run $out/libexec/Stemgen-GUI.AppImage "\$@"
  EOF
  chmod +x $out/bin/stemgen-gui
''
