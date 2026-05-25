const DATA_URL = "data/sls-bekasi.geojson";
const COLORS = ["#f36c13", "#d9480f", "#fb923c", "#ea580c", "#c2410c", "#f97316", "#b45309", "#ff7a1a"];

const state = {
  raw: null,
  filtered: [],
  displayed: [],
  map: null,
  polygonLayer: null,
  boundaryLayer: null,
  userMarker: null,
  accuracyCircle: null,
  watchId: null,
  selectedId: null,
  viewMode: "sls",
};

const els = {
  viewModeSelect: document.querySelector("#viewModeSelect"),
  kecamatanSelect: document.querySelector("#kecamatanSelect"),
  desaSelect: document.querySelector("#desaSelect"),
  rwSelect: document.querySelector("#rwSelect"),
  searchInput: document.querySelector("#searchInput"),
  fitButton: document.querySelector("#fitButton"),
  clearButton: document.querySelector("#clearButton"),
  locateButton: document.querySelector("#locateButton"),
  locationStatus: document.querySelector("#locationStatus"),
  statShown: document.querySelector("#statShown"),
  statTotal: document.querySelector("#statTotal"),
  statArea: document.querySelector("#statArea"),
  listTitle: document.querySelector("#listTitle"),
  listCount: document.querySelector("#listCount"),
  featureList: document.querySelector("#featureList"),
  mapMessage: document.querySelector("#mapMessage"),
};

init();

async function init() {
  wireEvents();

  try {
    state.raw = window.SLS_GEOJSON || await fetchGeoJson();
    prepareProperties(state.raw.features);
    fillKecamatanOptions();
    createMap();
    applyFilters();
  } catch (error) {
    els.mapMessage.innerHTML = `<strong>Data gagal dimuat</strong><span>${error.message}</span>`;
  }
}

async function fetchGeoJson() {
  return fetch(DATA_URL).then((response) => {
    if (!response.ok) throw new Error("GeoJSON tidak bisa dimuat");
    return response.json();
  });
}

function wireEvents() {
  els.viewModeSelect.addEventListener("change", () => {
    state.viewMode = els.viewModeSelect.value;
    state.selectedId = null;
    syncModeDefaults();
    updateControlState();
    applyFilters();
  });
  els.kecamatanSelect.addEventListener("change", () => {
    fillDesaOptions();
    state.selectedId = null;
    applyFilters();
  });
  els.desaSelect.addEventListener("change", () => {
    fillRwOptions();
    state.selectedId = null;
    applyFilters();
  });
  els.rwSelect.addEventListener("change", () => {
    state.selectedId = null;
    applyFilters();
  });
  els.searchInput.addEventListener("input", debounce(applyFilters, 180));
  els.fitButton.addEventListener("click", fitFilteredBounds);
  els.locateButton.addEventListener("click", startLocationTracking);
  els.clearButton.addEventListener("click", () => {
    els.searchInput.value = "";
    els.rwSelect.value = "ALL";
    applyFilters();
  });
}

function createMap() {
  if (!window.L) {
    throw new Error("Library peta belum termuat. Periksa koneksi internet untuk CDN Leaflet.");
  }

  const baseLayers = {
    "OpenStreetMap": L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }),
    "OSM Humanitarian": L.tileLayer("https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors, HOT",
    }),
    "Topografi": L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
      maxZoom: 17,
      attribution: "&copy; OpenStreetMap contributors, SRTM, OpenTopoMap",
    }),
    "Grayscale": L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 20,
      attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
    }),
    "Gelap": L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 20,
      attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
    }),
    "Satelit": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19,
      attribution: "Tiles &copy; Esri",
    }),
  };
  state.map = L.map("map", {
    center: [-6.34, 107.05],
    zoom: 12,
    zoomControl: false,
    layers: [baseLayers.OpenStreetMap],
  });

  L.control.zoom({ position: "topright" }).addTo(state.map);
  createLocateControl().addTo(state.map);
  L.control.layers(baseLayers, null, { collapsed: true, position: "topright" }).addTo(state.map);
  state.polygonLayer = L.geoJSON(null, {
    style: polygonStyle,
    onEachFeature,
  }).addTo(state.map);
  state.boundaryLayer = L.geoJSON(null, {
    style: boundaryStyle,
    interactive: false,
  }).addTo(state.map);

  els.mapMessage.classList.add("hidden");
}

function createLocateControl() {
  const LocateControl = L.Control.extend({
    options: { position: "topright" },
    onAdd: () => {
      const container = L.DomUtil.create("div", "leaflet-control locate-control");
      const button = L.DomUtil.create("button", "", container);
      button.type = "button";
      button.title = "Lokasi saya";
      button.setAttribute("aria-label", "Lokasi saya");
      button.textContent = "◎";
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.on(button, "click", startLocationTracking);
      return container;
    },
  });
  return new LocateControl();
}

function startLocationTracking() {
  if (!navigator.geolocation) {
    setLocationStatus("GPS tidak tersedia di browser ini.");
    return;
  }

  setLocationStatus("Mencari posisi GPS...");
  els.locateButton.disabled = true;

  if (state.watchId !== null) {
    navigator.geolocation.clearWatch(state.watchId);
  }

  state.watchId = navigator.geolocation.watchPosition(
    updateUserLocation,
    handleLocationError,
    {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 15000,
    }
  );
}

function updateUserLocation(position) {
  const { latitude, longitude, accuracy } = position.coords;
  const latLng = [latitude, longitude];

  if (!state.userMarker) {
    state.userMarker = L.marker(latLng, {
      icon: L.divIcon({
        className: "",
        html: '<div class="user-location-dot"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
      zIndexOffset: 1000,
    }).addTo(state.map);
  } else {
    state.userMarker.setLatLng(latLng);
  }

  if (!state.accuracyCircle) {
    state.accuracyCircle = L.circle(latLng, {
      radius: accuracy,
      color: "#1d4ed8",
      weight: 1,
      fillColor: "#60a5fa",
      fillOpacity: 0.18,
    }).addTo(state.map);
  } else {
    state.accuracyCircle.setLatLng(latLng);
    state.accuracyCircle.setRadius(accuracy);
  }

  state.map.setView(latLng, Math.max(state.map.getZoom(), 17));
  els.locateButton.disabled = false;
  setLocationStatus(`GPS aktif. Akurasi sekitar ${Math.round(accuracy)} meter.`);
}

function handleLocationError(error) {
  els.locateButton.disabled = false;
  const messages = {
    1: "Izin lokasi ditolak. Aktifkan izin lokasi di browser Android.",
    2: "Posisi belum tersedia. Pastikan GPS perangkat aktif.",
    3: "GPS terlalu lama merespons. Coba lagi di area terbuka.",
  };
  setLocationStatus(messages[error.code] || "Lokasi gagal dibaca.");
}

function setLocationStatus(message) {
  els.locationStatus.textContent = message;
}

function prepareProperties(features) {
  features.forEach((feature, index) => {
    const props = feature.properties || {};
    props.__index = index;
    props.__rt = extractCode(props.nmsls, "RT");
    props.__rw = extractCode(props.nmsls, "RW");
    props.__label = props.nmsls || props.idsls || `SLS ${index + 1}`;
    props.__displayId = props.idsls;
    props.__color = COLORS[Math.abs(hashString(props.nmdesa || props.__label)) % COLORS.length];
  });
}

function fillKecamatanOptions() {
  const kecamatanList = uniqueSorted(state.raw.features.map((feature) => feature.properties.nmkec));
  const preferred = kecamatanList.includes("SETU") ? "SETU" : kecamatanList[0];
  els.kecamatanSelect.innerHTML = `<option value="ALL">Semua Kecamatan</option>` + kecamatanList
    .map((kecamatan) => `<option value="${escapeHtml(kecamatan)}">${escapeHtml(kecamatan)}</option>`)
    .join("");
  els.kecamatanSelect.value = preferred;
  fillDesaOptions();
  updateControlState();
  els.statTotal.textContent = formatNumber(state.raw.features.length);
}

function fillDesaOptions() {
  const kecamatan = els.kecamatanSelect.value;
  const desaList = uniqueSorted(
    state.raw.features
      .filter((feature) => kecamatan === "ALL" || feature.properties.nmkec === kecamatan)
      .map((feature) => feature.properties.nmdesa)
  );
  const preferred = desaList.includes("CIKARAGEMAN") ? "CIKARAGEMAN" : desaList[0];
  els.desaSelect.innerHTML = desaList.map((desa) => `<option value="${escapeHtml(desa)}">${escapeHtml(desa)}</option>`).join("");
  els.desaSelect.value = preferred;
  fillRwOptions();
}

function fillRwOptions() {
  const kecamatan = els.kecamatanSelect.value;
  const desa = els.desaSelect.value;
  const rwList = uniqueSorted(
    state.raw.features
      .filter((feature) => (kecamatan === "ALL" || feature.properties.nmkec === kecamatan) && feature.properties.nmdesa === desa)
      .map((feature) => feature.properties.__rw)
      .filter(Boolean)
  );
  els.rwSelect.innerHTML = `<option value="ALL">Semua RW</option>${rwList
    .map((rw) => `<option value="${escapeHtml(rw)}">RW ${escapeHtml(rw)}</option>`)
    .join("")}`;
}

function applyFilters() {
  if (!state.raw) return;
  state.viewMode = els.viewModeSelect.value;
  const kecamatan = els.kecamatanSelect.value;
  const desa = els.desaSelect.value;
  const rw = els.rwSelect.value;
  const query = els.searchInput.value.trim().toLowerCase();

  state.filtered = state.raw.features.filter((feature) => {
    const props = feature.properties;
    if (state.viewMode !== "kecamatan" && kecamatan !== "ALL" && props.nmkec !== kecamatan) return false;
    if (state.viewMode === "sls" && props.nmdesa !== desa) return false;
    if (state.viewMode === "sls" && rw !== "ALL" && props.__rw !== rw) return false;
    if (!query) return true;
    return [props.nmsls, props.idsls, props.nmdesa, props.nmkec, props.idsubsls]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });

  state.displayed = buildDisplayedFeatures();
  renderList();
  updateStats();
  drawFilteredFeatures();
}

function drawFilteredFeatures() {
  if (!state.polygonLayer) return;
  state.polygonLayer.clearLayers();
  state.boundaryLayer.clearLayers();
  state.polygonLayer.addData({
    type: "FeatureCollection",
    features: state.displayed,
  });
  if (state.viewMode !== "sls") {
    state.boundaryLayer.addData({
      type: "FeatureCollection",
      features: state.displayed.map((feature) => ({
        type: "Feature",
        properties: feature.properties,
        geometry: feature.properties.__boundary,
      })),
    });
  }
  fitFilteredBounds();
}

function onEachFeature(feature, layer) {
  layer.on({
    click: () => selectFeature(feature.properties.__displayId, true),
    mouseover: () => layer.setStyle({ weight: 3, fillOpacity: 0.34 }),
    mouseout: () => state.polygonLayer.resetStyle(layer),
  });
  layer.bindTooltip(feature.properties.__label, {
    sticky: true,
    direction: "top",
    opacity: 0.92,
  });
}

function polygonStyle(feature) {
  const color = feature.properties.__color || COLORS[0];
  const selected = feature.properties.__displayId === state.selectedId;
  return {
    color: selected ? "#7c2d12" : color,
    fillColor: color,
    fillOpacity: selected ? 0.48 : state.viewMode === "sls" ? 0.24 : 0.16,
    opacity: state.viewMode === "sls" ? 0.95 : 0,
    weight: state.viewMode === "sls" ? selected ? 3 : 1.4 : 0,
  };
}

function boundaryStyle(feature) {
  const selected = feature.properties.__displayId === state.selectedId;
  return {
    color: selected ? "#7c2d12" : "#f36c13",
    opacity: 0.98,
    weight: selected ? 4 : state.viewMode === "kecamatan" ? 3 : 2,
  };
}

function renderList() {
  const modeLabel = state.viewMode === "kecamatan" ? "kecamatan" : state.viewMode === "desa" ? "desa" : "area";
  els.listTitle.textContent = state.viewMode === "kecamatan"
    ? "Daftar Kecamatan"
    : state.viewMode === "desa"
      ? "Daftar Desa"
      : "Daftar SLS";
  els.listCount.textContent = `${formatNumber(state.displayed.length)} ${modeLabel}`;
  const fragment = document.createDocumentFragment();

  state.displayed.slice(0, 260).forEach((feature) => {
    const props = feature.properties;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `feature-item ${state.selectedId === props.__displayId ? "active" : ""}`;
    button.dataset.id = props.__displayId;
    button.innerHTML = `
      <span class="feature-title">${escapeHtml(props.__label)}</span>
      <span class="feature-meta">${escapeHtml(listMeta(props))}</span>
    `;
    button.addEventListener("click", () => selectFeature(props.__displayId, true));
    fragment.appendChild(button);
  });

  if (state.displayed.length > 260) {
    const note = document.createElement("div");
    note.className = "feature-item";
    note.innerHTML = `<span class="feature-title">Masih ada ${formatNumber(state.displayed.length - 260)} area</span><span class="feature-meta">Persempit dengan filter atau pencarian.</span>`;
    fragment.appendChild(note);
  }

  els.featureList.replaceChildren(fragment);
}

function updateStats() {
  const area = state.filtered.reduce((sum, feature) => sum + (Number(feature.properties.luas) || 0), 0);
  els.statShown.textContent = formatNumber(state.displayed.length);
  els.statArea.textContent = area.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

function buildDisplayedFeatures() {
  if (state.viewMode === "sls") return state.filtered;

  const key = state.viewMode === "kecamatan" ? "nmkec" : "iddesa";
  const groups = new Map();
  state.filtered.forEach((feature) => {
    const groupKey = feature.properties[key];
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(feature);
  });

  return [...groups.entries()].map(([, features]) => {
    const first = features[0].properties;
    const area = features.reduce((sum, feature) => sum + (Number(feature.properties.luas) || 0), 0);
    const desaCount = new Set(features.map((feature) => feature.properties.nmdesa)).size;
    const displayId = state.viewMode === "kecamatan" ? `kecamatan:${first.nmkec}` : `desa:${first.iddesa}`;
    const label = state.viewMode === "kecamatan" ? `Kecamatan ${first.nmkec}` : `Desa/Kelurahan ${first.nmdesa}`;

    return {
      type: "Feature",
      properties: {
        __displayId: displayId,
        __label: label,
        __levelLabel: state.viewMode === "kecamatan" ? "Kecamatan" : "Desa/Kelurahan",
        __slsCount: features.length,
        __desaCount: desaCount,
        __color: first.__color,
        __boundary: buildBoundaryGeometry(features),
        idsls: "",
        luas: area,
        nmdesa: state.viewMode === "kecamatan" ? `${formatNumber(desaCount)} desa/kelurahan` : first.nmdesa,
        nmkec: first.nmkec,
        nmkab: first.nmkab,
      },
      geometry: {
        type: "MultiPolygon",
        coordinates: collectMultiPolygonCoordinates(features),
      },
    };
  });
}

function collectMultiPolygonCoordinates(features) {
  const coordinates = [];
  features.forEach((feature) => {
    if (feature.geometry.type === "Polygon") {
      coordinates.push(feature.geometry.coordinates);
    }
    if (feature.geometry.type === "MultiPolygon") {
      coordinates.push(...feature.geometry.coordinates);
    }
  });
  return coordinates;
}

function buildBoundaryGeometry(features) {
  const segmentMap = new Map();

  features.forEach((feature) => {
    const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    polygons.forEach((polygon) => {
      polygon.forEach((ring) => {
        for (let index = 0; index < ring.length - 1; index += 1) {
          const start = normalizePoint(ring[index]);
          const end = normalizePoint(ring[index + 1]);
          const key = segmentKey(start, end);
          const current = segmentMap.get(key);
          if (current) {
            current.count += 1;
          } else {
            segmentMap.set(key, { count: 1, coordinates: [start, end] });
          }
        }
      });
    });
  });

  return {
    type: "MultiLineString",
    coordinates: [...segmentMap.values()]
      .filter((segment) => segment.count === 1)
      .map((segment) => segment.coordinates),
  };
}

function normalizePoint(point) {
  return [Number(point[0].toFixed(9)), Number(point[1].toFixed(9))];
}

function segmentKey(start, end) {
  const a = `${start[0]},${start[1]}`;
  const b = `${end[0]},${end[1]}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function listMeta(props) {
  if (props.__levelLabel === "Kecamatan") {
    return `${props.__slsCount} SLS · ${props.__desaCount} desa/kelurahan · ${props.nmkec}`;
  }
  if (props.__levelLabel === "Desa/Kelurahan") {
    return `${props.__slsCount} SLS · ${props.nmdesa} · ${props.nmkec}`;
  }
  return `${props.nmdesa} · ${props.nmkec} · ID ${props.idsls}`;
}

function updateControlState() {
  const isKecamatan = state.viewMode === "kecamatan";
  const isDesa = state.viewMode === "desa";
  els.kecamatanSelect.disabled = isKecamatan;
  els.desaSelect.disabled = isKecamatan || isDesa;
  els.rwSelect.disabled = isKecamatan || isDesa;
  els.searchInput.placeholder = isKecamatan
    ? "Contoh: SETU, BABELAN"
    : isDesa
      ? "Contoh: CIKARAGEMAN, BAHAGIA"
      : "Contoh: RT 003, CIKARAGEMAN, 321601";
}

function syncModeDefaults() {
  if (state.viewMode === "kecamatan") {
    els.kecamatanSelect.value = "ALL";
    fillDesaOptions();
    return;
  }
  if (state.viewMode === "desa") {
    if (!els.kecamatanSelect.value) els.kecamatanSelect.value = "ALL";
    fillDesaOptions();
    return;
  }
  if (state.viewMode === "sls" && els.kecamatanSelect.value === "ALL") {
    els.kecamatanSelect.value = "SETU";
    fillDesaOptions();
  }
}

function selectFeature(idsls, openPopup) {
  state.selectedId = idsls;
  renderList();
  if (!state.polygonLayer) return;

  let selectedLayer = null;
  state.polygonLayer.eachLayer((layer) => {
    state.polygonLayer.resetStyle(layer);
    if (layer.feature.properties.__displayId === idsls) {
      selectedLayer = layer;
      layer.setStyle(polygonStyle(layer.feature));
      layer.bringToFront();
    }
  });

  if (!selectedLayer) return;
  state.map.fitBounds(selectedLayer.getBounds(), { padding: [36, 36], maxZoom: 17 });
  if (openPopup) {
    selectedLayer.bindPopup(popupHtml(selectedLayer.feature.properties)).openPopup();
  }
}

function popupHtml(props) {
  return `
    <div class="popup">
      <h3>${escapeHtml(props.__label || props.nmsls || "Wilayah")}</h3>
      <dl>
        <dt>Level</dt><dd>${escapeHtml(props.__levelLabel || "SLS")}</dd>
        ${props.idsls ? `<dt>ID SLS</dt><dd>${escapeHtml(props.idsls)}</dd>` : ""}
        <dt>Desa</dt><dd>${escapeHtml(props.nmdesa)}</dd>
        <dt>Kecamatan</dt><dd>${escapeHtml(props.nmkec)}</dd>
        <dt>Kabupaten</dt><dd>${escapeHtml(props.nmkab)}</dd>
        ${props.__slsCount ? `<dt>Jumlah SLS</dt><dd>${formatNumber(props.__slsCount)}</dd>` : ""}
        <dt>Luas</dt><dd>${Number(props.luas || 0).toLocaleString("id-ID", { maximumFractionDigits: 4 })}</dd>
      </dl>
    </div>
  `;
}

function fitFilteredBounds() {
  if (!state.map || !state.polygonLayer || !state.filtered.length) return;
  const bounds = state.polygonLayer.getBounds();
  if (bounds.isValid()) state.map.fitBounds(bounds, { padding: [28, 28] });
}

function extractCode(text, label) {
  const match = String(text || "").match(new RegExp(`${label}\\s*(\\d+)`, "i"));
  return match ? match[1].padStart(3, "0") : "";
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "id"));
}

function hashString(value) {
  return String(value).split("").reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0);
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("id-ID");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
  });
}

function debounce(callback, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), wait);
  };
}
