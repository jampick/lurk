# Omarchy package

`lurk-reddit-bin/` is the recipe that ships Lurk in Omarchy's `[omarchy]` repo.
The copy that actually builds lives at
`pkgbuilds/lurk-reddit-bin/` in [omacom/omarchy-pkgs](https://github.com/omacom/omarchy-pkgs);
this one is here so packaging changes get reviewed next to the code they
package. Keep the two in sync by hand: Omarchy owns its copy, and their
`sync-upstream` job bumps `pkgver` and the checksums there on every tag push
(24 hours after the release, from GitHub's asset digests). A packaging change,
as opposed to a version bump, means a PR to both repos and a `pkgrel` bump.

Why the `.deb` and not the `.pacman`: both carry the same Electron tree under
`/opt`, but the `.pacman` comes out of fpm with a hand-listed `depends` and
postinst scriptlets, and a PKGBUILD that unpacks another pacman package is
one layer too many. The `.deb` is just `data.tar.xz`.

Why `lurk-reddit`: `extra/lurk` is an unrelated strace frontend (#35). The
package installs to `/opt/lurk-reddit` and `/usr/bin/lurk-reddit`; the desktop
entry stays `lurk.desktop` because that is the window's Wayland app_id.

To test a change on an Arch or Omarchy box:

```bash
cd packaging/omarchy/lurk-reddit-bin
makepkg -f            # downloads the release .deb, builds the package
namcap PKGBUILD *.pkg.tar.zst
sudo pacman -U lurk-reddit-bin-*.pkg.tar.zst
lurk-reddit           # or from the Omarchy launcher
```
