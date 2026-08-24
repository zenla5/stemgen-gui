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
        url = "https://github.com/zenla5/stemgen-gui/releases/download/v${version}/Stemgen-GUI_${version}_amd64.AppImage";
        sha256 = amd64Hash;
      };
in
pkgs.runCommand "stemgen-gui-${version}" { } ''
  mkdir -p $out/bin $out/libexec
  install -Dm755 ${appImage} $out/libexec/Stemgen-GUI.AppImage
  cat > $out/bin/stemgen-gui <<EOF
  #!/usr/bin/env bash
  exec ${pkgs.appimage-run}/bin/appimage-run $out/libexec/Stemgen-GUI.AppImage "\$@"
  EOF
  chmod +x $out/bin/stemgen-gui
''
