# Peta Wilkerstat BPS Kabupaten Bekasi

Aplikasi web statis untuk menampilkan polygon SLS/RT di atas peta publik tanpa API key.

## Menjalankan

```powershell
python -m http.server 5173 --bind 127.0.0.1
```

Atau jalankan:

```powershell
.\start-server.ps1
```

Buka:

```text
http://127.0.0.1:5173/
```

Peta memakai Leaflet dan beberapa basemap publik: OpenStreetMap, OSM Humanitarian, Topografi, Grayscale, Gelap, dan Satelit Esri. Filter wilayah berurutan dari mode polygon, kecamatan, desa/kelurahan, lalu RW.

## GPS di Android

Fitur **Lokasi Saya** memakai GPS browser. Untuk Android, aplikasi perlu dibuka dari alamat HTTPS agar Chrome/Android mengizinkan akses lokasi.

Opsi deploy yang cocok:

- GitHub Pages
- Netlify
- Vercel
- server kantor dengan HTTPS

Setelah dibuka di Android, tekan **Lokasi Saya**, pilih **Izinkan**, lalu titik biru dan lingkaran akurasi akan muncul di peta. Posisi hanya dibaca saat tombol ditekan, sehingga peta tetap bebas digeser setelah lokasi muncul.

## File tunggal

Versi siap dibagikan sebagai satu file:

```text
peta-wilkerstat-bps-kabupaten-bekasi.html
```

File ini sudah memuat data GeoJSON, logo BPS Kabupaten Bekasi, logo SE 2026, CSS, dan JavaScript aplikasi. Koneksi internet tetap dibutuhkan untuk memuat library Leaflet dari CDN dan tile peta publik.

Aplikasi juga bisa dibuka langsung dari `index.html` karena data sudah dibundel di `data/sls-bekasi.js`.

## Data

GeoJSON tersimpan di:

```text
data/sls-bekasi.geojson
```

Versi siap pakai tanpa server tersimpan di:

```text
data/sls-bekasi.js
```

Atribut yang dipakai aplikasi:

- `nmsls` untuk nama RT/RW/SLS
- `idsubsls` untuk ID Sub SLS yang ditampilkan di daftar dan popup
- `nmdesa` untuk filter desa/kelurahan
- `nmkec` untuk info kecamatan
- `nmkab` untuk info kabupaten
- `luas` untuk ringkasan luas
