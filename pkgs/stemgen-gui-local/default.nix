# Stemgen GUI — local packaging for NixOS.
#
# Packages a prebuilt release binary (compiled from this repo with the
# `protocol-asset` fix) plus the sidecar resource and a launcher. The runtime
# libraries are injected into LD_LIBRARY_PATH so their store paths become Nix
# references of this output, keeping the whole runtime closure GC-alive and
# making the binary find its libs regardless of its RUNPATH.
#
# A fully pure in-derivation build (buildRustPackage / fetchNpmDeps) is not
# used because the Nix daemon on this machine hangs (idle worker, no children)
# for those larger derivations — an environment issue, not a code issue. This
# `runCommand` packaging builds reliably.
#
# Build:  nix-build pkgs/stemgen-gui-local/default.nix
# Root:   nix profile install <result>   (so GC keeps it)
# Run:    <result>/bin/stemgen-gui
#
# Rebuild the binary input when the source changes (in a nix-shell with the
# GTK/WebKit dev deps):
#   cp target/release/stemgen-gui pkgs/stemgen-gui-local/bin-stemgen-gui

{ pkgs ? import <nixpkgs> { } }:

let
  binary = ./bin-stemgen-gui;
  sidecar = ./resources/stemgen_sidecar.py;

  # Runtime libraries the binary links against (must match the versions the
  # binary was built against — same nixpkgs channel as the nix-shell build).
  runtimeLibs = with pkgs; [
    glib
    gtk3
    webkitgtk_4_1
    libsoup_3
    cairo
    gdk-pixbuf
    pango
    dbus
    openssl
    alsa-lib
    libayatana-appindicator
    gsettings-desktop-schemas
    # libstdc++ for the .venv's PyTorch (import torch needs libstdc++.so.6).
    stdenv.cc.cc.lib
  ];

  runtimeLibPath = pkgs.lib.makeLibraryPath runtimeLibs;

  # Host GL stack (WebKitGTK-on-Wayland rendering).
  glLibs =
    "${pkgs.libglvnd}/lib:${pkgs.mesa}/lib:${pkgs.wayland}/lib:/run/opengl-driver/lib";
in
pkgs.runCommand "stemgen-gui-local-1.5.8" { } ''
  mkdir -p $out/bin $out/libexec
  install -Dm755 ${binary} $out/libexec/stemgen-gui
  install -Dm644 ${sidecar} $out/libexec/stemgen_sidecar.py

  cat > $out/bin/stemgen-gui <<EOF
  #!/usr/bin/env bash
  export LD_LIBRARY_PATH="${glLibs}:${runtimeLibPath}\''${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  export EGL_VENDOR_LIBRARY_FILES="${pkgs.mesa}/share/glvnd/egl_vendor.d/50_mesa.json"
  export LIBGL_DRIVERS_PATH="${pkgs.mesa}/lib/dri"
  export GSETTINGS_SCHEMA_DIR="${pkgs.gsettings-desktop-schemas}/share/gsettings-schemas/${pkgs.gsettings-desktop-schemas.name}/glib-2.0/schemas"
  unset WEBKIT_DISABLE_COMPOSITING_MODE
  export WEBKIT_DISABLE_DMABUF_RENDERER=1
  exec $out/libexec/stemgen-gui "\$@"
  EOF
  chmod +x $out/bin/stemgen-gui
''
