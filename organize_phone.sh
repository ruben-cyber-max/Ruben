#!/data/data/com.termux/files/usr/bin/bash
# Runs organize_gallery.py on all the usual Samsung gallery folders.
# Usage in Termux:  bash /sdcard/Download/organize_phone.sh          (preview)
#                   bash /sdcard/Download/organize_phone.sh --apply  (do it)
DIR="$(cd "$(dirname "$0")" && pwd)"
DEST=/sdcard/Pictures/Gallery
command -v python >/dev/null || pkg install -y python
[ -d /sdcard/DCIM ] || termux-setup-storage
for SRC in /sdcard/DCIM /sdcard/Pictures/Screenshots /sdcard/Movies \
           /sdcard/Android/media/com.whatsapp/WhatsApp/Media; do
  [ -d "$SRC" ] || continue
  echo "=== $SRC ==="
  python "$DIR/organize_gallery.py" "$SRC" "$DEST" "$@" | tail -12
done
