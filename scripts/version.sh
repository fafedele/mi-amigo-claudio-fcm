#!/bin/sh
# Mantiene alineadas las 4 referencias de version que rompen cache.
# Estan repartidas en 3 archivos y hasta ahora se editaban a mano; ya paso que
# index.html pidiera style.css?v=6 junto a app.js?v=7.
#
#   check      falla si no coinciden las 4
#   bump       las lleva a todas a max+1
#   set N      las fija en N
#   print      imprime la version actual
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"

ARCHIVOS="index.html sw.js app.js"

# Cada referencia: etiqueta, archivo, y patron sed que captura el numero.
v_html_css() { sed -n 's/.*style\.css?v=\([0-9]\{1,\}\).*/\1/p' index.html | head -1; }
v_html_js()  { sed -n 's/.*app\.js?v=\([0-9]\{1,\}\).*/\1/p'    index.html | head -1; }
v_sw_cache() { sed -n 's/.*claudio-fcm-v\([0-9]\{1,\}\).*/\1/p' sw.js      | head -1; }
v_app_sw()   { sed -n 's/.*sw\.js?v=\([0-9]\{1,\}\).*/\1/p'     app.js     | head -1; }

listar() {
  printf '  %-34s %s\n' "index.html  style.css?v="   "$(v_html_css)"
  printf '  %-34s %s\n' "index.html  app.js?v="      "$(v_html_js)"
  printf '  %-34s %s\n' "sw.js       claudio-fcm-v"  "$(v_sw_cache)"
  printf '  %-34s %s\n' "app.js      sw.js?v="       "$(v_app_sw)"
}

# Falta alguna referencia => el patron dejo de matchear (alguien renombro algo).
faltantes() {
  for f in "$(v_html_css)" "$(v_html_js)" "$(v_sw_cache)" "$(v_app_sw)"; do
    [ -n "$f" ] || return 0
  done
  return 1
}

alineadas() {
  a=$(v_html_css); b=$(v_html_js); c=$(v_sw_cache); d=$(v_app_sw)
  [ "$a" = "$b" ] && [ "$b" = "$c" ] && [ "$c" = "$d" ]
}

maxima() { { v_html_css; v_html_js; v_sw_cache; v_app_sw; } | sort -n | tail -1; }

escribir() {
  n=$1
  sed -i.bak "s/style\.css?v=[0-9]\{1,\}/style.css?v=$n/g" index.html
  sed -i.bak "s/app\.js?v=[0-9]\{1,\}/app.js?v=$n/g"       index.html
  sed -i.bak "s/claudio-fcm-v[0-9]\{1,\}/claudio-fcm-v$n/g" sw.js
  sed -i.bak "s/sw\.js?v=[0-9]\{1,\}/sw.js?v=$n/g"          app.js
  rm -f index.html.bak sw.js.bak app.js.bak
}

case "${1:-check}" in
  print) echo "$(v_html_css)" ;;
  check)
    if faltantes; then
      echo "version.sh: falta alguna referencia de version. Se renombro un archivo?" >&2
      listar >&2; exit 1
    fi
    if ! alineadas; then
      echo "version.sh: las versiones no coinciden." >&2
      listar >&2
      echo "  Corregilo con: ./scripts/version.sh bump" >&2
      exit 1
    fi
    echo "version.sh: las 4 referencias en v$(v_html_css)"
    ;;
  bump)
    if faltantes; then echo "version.sh: falta alguna referencia, no bumpeo a ciegas." >&2; listar >&2; exit 1; fi
    n=$(( $(maxima) + 1 )); escribir "$n"; echo "version.sh: v$n"; listar ;;
  set)
    [ $# -ge 2 ] || { echo "uso: version.sh set N" >&2; exit 1; }
    case "$2" in *[!0-9]*|'') echo "version.sh: N debe ser un entero" >&2; exit 1 ;; esac
    escribir "$2"; echo "version.sh: v$2"; listar ;;
  *) echo "uso: version.sh [check|bump|set N|print]" >&2; exit 1 ;;
esac
