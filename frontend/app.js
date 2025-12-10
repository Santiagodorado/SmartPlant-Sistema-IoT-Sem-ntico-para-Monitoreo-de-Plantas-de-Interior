const API_BASE = "http://localhost:5000/api";
const REFRESH_MS = 15000;

const charts = {
  temp: null,
  hum: null,
  lux: null,
};

let plantCatalog = [];
let pendingPlantType = "";
let currentProfile = null;
let configConfirmed = false;
let pollInterval = null;
let savedConfigs = [];
let activeConfig = null;

const dom = {
  systemStatus: document.getElementById("systemStatus"),
  statusSummary: document.getElementById("statusSummary"),
  statusDetails: document.getElementById("statusDetails"),
  activePlantLabel: document.getElementById("activePlantLabel"),
  lastUpdate: document.getElementById("lastUpdate"),
  deviceStatus: document.getElementById("deviceStatus"),
  tempValue: document.getElementById("temperatureValue"),
  humidityValue: document.getElementById("humidityValue"),
  lightValue: document.getElementById("lightValue"),
  tempCard: document.getElementById("tempCard"),
  humidityCard: document.getElementById("humidityCard"),
  lightCard: document.getElementById("lightCard"),
  temperatureBadge: document.getElementById("temperatureBadge"),
  humidityBadge: document.getElementById("humidityBadge"),
  lightBadge: document.getElementById("lightBadge"),
  lightProgress: document.getElementById("lightProgress"),
  recommendations: document.getElementById("recommendations"),
  configForm: document.getElementById("configForm"),
  configStatus: document.getElementById("configStatus"),
  tempChart: document.getElementById("tempChart"),
  humChart: document.getElementById("humChart"),
  luxChart: document.getElementById("luxChart"),
  plantTypeSelect: document.getElementById("plantTypeSelect"),
  plantProfileName: document.getElementById("plantProfileName"),
  plantProfileDescription: document.getElementById("plantProfileDescription"),
  plantProfileRanges: document.getElementById("plantProfileRanges"),
  plantProfileTips: document.getElementById("plantProfileTips"),
  plantProfileImage: document.getElementById("plantProfileImage"),
  plantPreviewImage: document.getElementById("plantPreviewImage"),
  plantPreviewText: document.getElementById("plantPreviewText"),
  configOverlay: document.getElementById("configOverlay"),
  plantLink: document.getElementById("plantLink"),
  configLink: document.getElementById("configLink"),
  sensorsLink: document.getElementById("sensorsLink"),
  homeLink: document.getElementById("homeLink"),
  homeView: document.getElementById("homeView"),
  plantView: document.getElementById("plantView"),
  configView: document.getElementById("configView"),
  backHome: document.getElementById("backHome"),
  openSavedConfigs: document.getElementById("openSavedConfigs"),
  savedConfigsModal: document.getElementById("savedConfigsModal"),
  savedConfigSelect: document.getElementById("savedConfigSelect"),
  savedConfigStatus: document.getElementById("savedConfigStatus"),
  useSavedConfig: document.getElementById("useSavedConfig"),
  closeSavedConfigs: document.getElementById("closeSavedConfigs"),
  configSamplingSeconds: document.getElementById("configSamplingSeconds"),
  configSaveStatus: document.getElementById("configSaveStatus"),
  configSavedSelect: document.getElementById("configSavedSelect"),
  configSavedStatus: document.getElementById("configSavedStatus"),
  configActiveInfo: document.getElementById("configActiveInfo"),
  activateSavedBtn: document.getElementById("activateSavedBtn"),
  saveConfigBtn: document.getElementById("saveConfigBtn"),
};

function setActivePlantLabel(name) {
  if (dom.activePlantLabel) {
    dom.activePlantLabel.textContent = `Planta actual: ${name || "--"}`;
  }
}

async function fetchJson(path, options) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    ...options,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
  return response.json();
}

function formatRelative(iso) {
  if (!iso) return "--";
  const date = new Date(iso);
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  return `${days} d`;
}

function formatLabel(iso) {
  if (!iso) return "--";
  const date = new Date(iso);
  return date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function getThresholds() {
  const ranges = currentProfile?.ranges || {};
  return {
    temp: ranges.temperature || { min: 18, max: 28 },
    hum: ranges.humidity || { min: 40, max: 70 },
    // La luz ahora se maneja como porcentaje 0–100 (%), no como lux reales.
    // Usamos un umbral fijo razonable para todas las plantas.
    lux: { min: 20, max: 80 },
  };
}

function getPlantById(id) {
  if (!id) return null;
  return plantCatalog.find((plant) => plant.id === id) || null;
}

function renderPlantProfile(profile) {
  const active = profile || getPlantById(pendingPlantType) || null;
  currentProfile = active;

  if (!dom.plantProfileName) {
    return;
  }

  if (!active) {
    dom.plantProfileName.textContent = "Sin selección";
    dom.plantProfileDescription.textContent = "Elige una planta para aplicar umbrales personalizados.";
    dom.plantProfileRanges.innerHTML = "<span>Temp: --</span><span>Humedad: --</span><span>Luz: --</span>";
    dom.plantProfileTips.innerHTML = "<li>Sin recomendaciones adicionales.</li>";
    if (dom.plantProfileImage) {
      dom.plantProfileImage.style.display = "none";
      dom.plantProfileImage.removeAttribute("src");
    }
    if (dom.plantPreviewImage) {
      dom.plantPreviewImage.style.display = "none";
      dom.plantPreviewImage.removeAttribute("src");
    }
    if (dom.plantPreviewText) {
      dom.plantPreviewText.textContent = "Selecciona una planta para ver su imagen.";
    }
    return;
  }

  pendingPlantType = active.id;
  if (dom.plantTypeSelect && dom.plantTypeSelect.value !== active.id) {
    dom.plantTypeSelect.value = active.id;
  }

  dom.plantProfileName.textContent = active.name;
  dom.plantProfileDescription.textContent = active.description;
  const { temperature, humidity } = active.ranges;
  dom.plantProfileRanges.innerHTML = `
    <span>Temp: ${temperature.min}-${temperature.max} °C</span>
    <span>Humedad: ${humidity.min}-${humidity.max} %</span>
    <span>Luz: nivel relativo (%) según sensor</span>
  `;
  const tips = active.tips || [];
  dom.plantProfileTips.innerHTML = tips.length ? tips.map((tip) => `<li>${tip}</li>`).join("") : "<li>Sin recomendaciones adicionales.</li>";
  if (dom.plantProfileImage) {
    if (active.image) {
      dom.plantProfileImage.onerror = () => {
        dom.plantProfileImage.src =
          "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='250'%3E%3Crect width='100%25' height='100%25' fill='%23e2e8f0'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-size='18'%3EImagen no disponible%3C/text%3E%3C/svg%3E";
      };
      dom.plantProfileImage.src = active.image;
      dom.plantProfileImage.style.display = "block";
    } else {
      dom.plantProfileImage.style.display = "none";
      dom.plantProfileImage.removeAttribute("src");
    }
  }
  if (dom.plantPreviewImage) {
    if (active.image) {
      dom.plantPreviewImage.onerror = () => {
        dom.plantPreviewImage.src =
          "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='250'%3E%3Crect width='100%25' height='100%25' fill='%23e2e8f0'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-size='18'%3EImagen no disponible%3C/text%3E%3C/svg%3E";
      };
      dom.plantPreviewImage.src = active.image;
      dom.plantPreviewImage.style.display = "block";
      if (dom.plantPreviewText) {
        dom.plantPreviewText.textContent = active.name;
      }
    } else {
      dom.plantPreviewImage.style.display = "none";
      dom.plantPreviewImage.removeAttribute("src");
      if (dom.plantPreviewText) {
        dom.plantPreviewText.textContent = "Selecciona una planta para ver su imagen.";
      }
    }
  }
}

function populatePlantSelect(selectedId) {
  if (!dom.plantTypeSelect || !plantCatalog.length) {
    return;
  }
  const options = plantCatalog.map((plant) => `<option value="${plant.id}">${plant.name}</option>`).join("");
  dom.plantTypeSelect.innerHTML = `<option value="" disabled selected>Selecciona tipo de planta</option>${options}`;
  if (selectedId) {
    dom.plantTypeSelect.value = selectedId;
    pendingPlantType = selectedId;
  } else {
    dom.plantTypeSelect.selectedIndex = 0;
    dom.plantTypeSelect.value = "";
    pendingPlantType = "";
  }
}

async function loadPlants() {
  try {
    plantCatalog = await fetchJson("/plants");
    populatePlantSelect(pendingPlantType);
    renderPlantProfile(currentProfile);
  } catch (error) {
    console.error("No se pudo cargar la lista de plantas", error);
  }
}

function getActivePlantConfigId() {
  return activeConfig?.plantConfigId || null;
}

function getActivePlantType() {
  return activeConfig?.plantType || pendingPlantType || null;
}

async function loadSavedConfigs() {
  try {
    savedConfigs = await fetchJson("/plants/configs");
    const options = savedConfigs.map(
      (cfg) => `<option value="${cfg.id}">${cfg.plantName} (${cfg.location})</option>`
    );
    if (dom.savedConfigSelect) {
      dom.savedConfigSelect.innerHTML = options.join("");
      if (!savedConfigs.length) {
        dom.savedConfigSelect.innerHTML = '<option value="" disabled selected>No hay plantas guardadas</option>';
      }
    }
    if (dom.configSavedSelect) {
      dom.configSavedSelect.innerHTML = options.length
        ? ['<option value="" disabled selected>Selecciona una planta</option>', ...options].join("")
        : '<option value="" disabled selected>No hay plantas guardadas</option>';
    }
    if (!savedConfigs.length && dom.savedConfigStatus) {
      dom.savedConfigStatus.textContent = "No hay plantas guardadas.";
    } else if (dom.savedConfigStatus) {
      dom.savedConfigStatus.textContent = "";
    }
  } catch (error) {
    console.error("No se pudo cargar plantas guardadas", error);
    if (dom.savedConfigStatus) dom.savedConfigStatus.textContent = "No se pudo cargar.";
    if (dom.configSavedStatus) dom.configSavedStatus.textContent = "No se pudo cargar.";
  }
}

function updateCards(latest) {
  const temperature = latest?.temperature ?? null;
  const humidity = latest?.humidity ?? null;
  const illuminance = latest?.illuminance ?? null;

  const ranges = getThresholds();

  dom.tempValue.textContent = temperature !== null ? `${temperature.toFixed(1)} °C` : "--";
  dom.humidityValue.textContent = humidity !== null ? `${humidity.toFixed(1)} %` : "--";
  // La "luz" se interpreta como porcentaje 0–100 (%)
  dom.lightValue.textContent = illuminance !== null ? `${illuminance.toFixed(0)} %` : "--";

  const tempState = evaluateRange(temperature, ranges.temp);
  const humState = evaluateRange(humidity, ranges.hum);
  const luxState = evaluateRange(illuminance, ranges.lux);

  applyMetricState(dom.tempCard, dom.temperatureBadge, tempState);
  applyMetricState(dom.humidityCard, dom.humidityBadge, humState);
  applyMetricState(dom.lightCard, dom.lightBadge, luxState);

  if (typeof illuminance === "number") {
    // illuminance ya viene como 0–100 (%)
    const percent = Math.min(Math.max(illuminance, 0), 100);
    dom.lightProgress.style.width = `${percent}%`;
  } else {
    dom.lightProgress.style.width = "0%";
  }
}

function evaluateRange(value, range) {
  if (value === null || Number.isNaN(value)) {
    return { state: "idle", label: "--" };
  }
  if (value < range.min) {
    return { state: "low", label: "Bajo" };
  }
  if (value > range.max) {
    return { state: "high", label: "Alto" };
  }
  return { state: "ideal", label: "Ideal" };
}

function applyMetricState(card, badge, result) {
  card.className = `metric-card ${result.state}`;
  badge.className = `metric-badge ${result.state !== "idle" ? result.state : ""}`.trim();
  badge.textContent = result.label;
}

function renderRecommendations(recs) {
  if (!recs) {
    dom.recommendations.innerHTML = '<p class="muted">Sin datos aún.</p>';
    dom.systemStatus.className = "status-pill";
    dom.systemStatus.textContent = "Sin datos";
    dom.statusSummary.textContent = "Esperando lecturas del nodo ESP32";
    dom.statusDetails.textContent = "Conecta el dispositivo y verifica la red Wi-Fi.";
    return;
  }

  const { status, alerts = [], tips = [] } = recs.recommendations || recs;
  dom.systemStatus.className = `status-pill ${status}`;
  dom.systemStatus.textContent = status === "alert" ? "Atención" : "Saludable";
  dom.statusSummary.textContent =
    status === "alert" ? "Atención: tu planta necesita cuidados" : "Condiciones óptimas: tu planta está saludable";

  if (status === "alert" && alerts.length) {
    dom.statusDetails.textContent = `${label(alerts[0].feature)}: ${alerts[0].message}`;
  } else if (tips.length) {
    dom.statusDetails.textContent = `${label(tips[0].feature)}: ${tips[0].message}`;
  } else {
    dom.statusDetails.textContent = "Análisis semántico basado en SSN/SOSA.";
  }

  const blocks = [];
  if (alerts.length) {
    blocks.push(
      `<h3>Alertas</h3><ul>${alerts
        .map((item) => `<li class="alert"><strong>${label(item.feature)}:</strong> ${item.message}</li>`)
        .join("")}</ul>`
    );
  }
  if (tips.length) {
    blocks.push(
      `<h3>Tips</h3><ul>${tips
        .map((item) => `<li class="tip"><strong>${label(item.feature)}:</strong> ${item.message}</li>`)
        .join("")}</ul>`
    );
  }
  if (!blocks.length) {
    blocks.push('<p class="muted">No hay recomendaciones.</p>');
  }
  dom.recommendations.innerHTML = blocks.join("");
}

function label(feature) {
  const map = {
    temperature: "Temperatura",
    humidity: "Humedad",
    light: "Luz (%)",
  };
  return map[feature] || feature;
}

function updateCharts(items = []) {
  const labels = items.map((item) => formatLabel(item.timestamp));
  updateChart("temp", dom.tempChart, labels, items.map((i) => i.temperature), {
    label: "Temperatura (°C)",
    color: "#2563eb",
  });
  updateChart("hum", dom.humChart, labels, items.map((i) => i.humidity), {
    label: "Humedad (%)",
    color: "#0ea5e9",
  });
  updateChart("lux", dom.luxChart, labels, items.map((i) => i.illuminance), {
    label: "Luz (%)",
    color: "#f59e0b",
  });
}

function updateChart(key, canvas, labels, data, config) {
  if (!canvas) return;
  if (!charts[key]) {
    charts[key] = new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: config.label,
            data,
            borderColor: config.color,
            backgroundColor: `${config.color}33`,
            tension: 0.4,
            fill: true,
            borderWidth: 3,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
        },
        scales: {
          y: {
            ticks: { color: "#475569" },
            grid: { color: "rgba(226,232,240,0.6)" },
          },
          x: {
            ticks: { color: "#94a3b8" },
            grid: { display: false },
          },
        },
      },
    });
    return;
  }

  charts[key].data.labels = labels;
  charts[key].data.datasets[0].data = data;
  charts[key].update();
}

async function loadConfigForm() {
  try {
    await fetchJson("/config"); // ignoramos valores remotos, forzamos placeholders
  } catch (error) {
    console.error("No se pudo leer la configuración inicial", error);
  }
  dom.configForm.plantName.value = "";
  dom.configForm.location.value = "";
  dom.configForm.samplingSeconds.value = 60;
  pendingPlantType = "";
  populatePlantSelect("");
  renderPlantProfile(null);
  dom.configStatus.textContent = "Completa la configuración para continuar.";
  setActivePlantLabel(null);
}

async function loadActiveConfig() {
  try {
    activeConfig = await fetchJson("/config");
    if (dom.configSamplingSeconds) {
      dom.configSamplingSeconds.value = activeConfig.samplingSeconds || 60;
    }
    if (dom.configForm?.samplingSeconds) {
      dom.configForm.samplingSeconds.value = activeConfig.samplingSeconds || 60;
    }
    if (dom.configActiveInfo) {
      const name = activeConfig.plantName || "SmartPlant";
      const loc = activeConfig.location || "Living Room";
      dom.configActiveInfo.textContent = `Planta activa: ${name} (${loc})`;
    }
    setActivePlantLabel(activeConfig.plantName || "SmartPlant");
  } catch (error) {
    console.error("No se pudo cargar configuración activa", error);
    if (dom.configActiveInfo) dom.configActiveInfo.textContent = "No se pudo cargar config activa.";
  }
}

async function refreshData() {
  try {
    const cfgId = getActivePlantConfigId();
    const plantType = getActivePlantType();
    const qs = new URLSearchParams({ limit: "24" });
    if (cfgId) qs.set("plantConfigId", cfgId);
    else if (plantType) qs.set("plantType", plantType);

    const [{ items }, recs] = await Promise.all([
      fetchJson(`/observations/latest?${qs.toString()}`),
      fetchJson(`/recommendations/latest?${qs.toString()}`).catch(() => null),
    ]);

    if (items.length) {
      const latest = items[items.length - 1];
      updateCards(latest);
      dom.lastUpdate.textContent = formatRelative(latest.timestamp);
      const ageSec = Math.max(0, (Date.now() - new Date(latest.timestamp).getTime()) / 1000);
      const threshold = (Number(dom.configForm?.samplingSeconds.value) || 60) * 1.2; // tolerancia corta
      if (ageSec > threshold) {
        dom.deviceStatus.innerHTML = '<span class="dot"></span>ESP32 desconectado';
        dom.systemStatus.className = "status-pill alert";
        dom.systemStatus.textContent = "Sin datos recientes";
      } else {
        dom.deviceStatus.innerHTML = '<span class="dot ok"></span>ESP32 conectado';
      }
    } else {
      updateCards(null);
      dom.lastUpdate.textContent = "--";
      dom.deviceStatus.innerHTML = '<span class="dot"></span>ESP32 en espera';
    }

    renderRecommendations(recs);
    renderPlantProfile(recs?.profile || currentProfile);
    updateCharts(items);
  } catch (error) {
    console.error(error);
    dom.systemStatus.className = "status-pill alert";
    dom.systemStatus.textContent = "Backend inaccesible";
    dom.deviceStatus.innerHTML = '<span class="dot"></span>ESP32 sin conexión';
  }
}

function hideOverlay() {
  dom.configOverlay?.classList.remove("active");
}

function showOverlay() {
  dom.configOverlay?.classList.add("active");
}

function startPolling() {
  if (pollInterval) return;
  configConfirmed = true;
  refreshData();
  pollInterval = setInterval(refreshData, REFRESH_MS);
}

dom.configForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  dom.configStatus.textContent = "Guardando...";
  const payload = {
    plantName: dom.configForm.plantName.value,
    location: dom.configForm.location.value,
    samplingSeconds: Number(dom.configForm.samplingSeconds.value),
    plantType: dom.plantTypeSelect?.value || pendingPlantType,
  };

  try {
    const saved = await fetchJson("/plants/configs", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const cfg = await fetchJson("/config", {
      method: "POST",
      body: JSON.stringify({ ...payload, plantConfigId: saved.id }),
    });
    activeConfig = cfg;
    dom.configStatus.textContent = "Configuración guardada y activada.";
    pendingPlantType = payload.plantType;
    renderPlantProfile(getPlantById(payload.plantType));
    setActivePlantLabel(payload.plantName);
    hideOverlay();
    startPolling();
  } catch (error) {
    dom.configStatus.textContent = "Error guardando configuración.";
    console.error(error);
  }
});

dom.plantTypeSelect?.addEventListener("change", (event) => {
  const selected = event.target.value;
  pendingPlantType = selected;
  renderPlantProfile(getPlantById(selected));
});

function showPlantView() {
  dom.homeView?.classList.add("hidden");
  dom.plantView?.classList.remove("hidden");
  dom.configView?.classList.add("hidden");
  dom.plantLink?.classList.add("active");
  dom.homeLink?.classList.remove("active");
  dom.configLink?.classList.remove("active");
  dom.sensorsLink?.classList.remove("active");
}

function showHomeView() {
  dom.plantView?.classList.add("hidden");
  dom.homeView?.classList.remove("hidden");
  dom.homeLink?.classList.add("active");
  dom.plantLink?.classList.remove("active");
  dom.configView?.classList.add("hidden");
  dom.configLink?.classList.remove("active");
  dom.sensorsLink?.classList.remove("active");
}

function showSensorsSection() {
  showHomeView();
  dom.homeLink?.classList.remove("active");
  dom.plantLink?.classList.remove("active");
  dom.sensorsLink?.classList.add("active");
  const target = document.getElementById("sensors-section");
  if (target) {
    target.scrollIntoView({ behavior: "smooth" });
  }
}

function showConfigView() {
  dom.homeView?.classList.add("hidden");
  dom.plantView?.classList.add("hidden");
  dom.configView?.classList.remove("hidden");
  dom.configLink?.classList.add("active");
  dom.homeLink?.classList.remove("active");
  dom.plantLink?.classList.remove("active");
  dom.sensorsLink?.classList.remove("active");
  loadActiveConfig();
  loadSavedConfigs();
}

dom.plantLink?.addEventListener("click", (event) => {
  event.preventDefault();
  showPlantView();
});

dom.configLink?.addEventListener("click", (event) => {
  event.preventDefault();
  showConfigView();
});

dom.sensorsLink?.addEventListener("click", (event) => {
  event.preventDefault();
  showSensorsSection();
});

dom.homeLink?.addEventListener("click", (event) => {
  event.preventDefault();
  showHomeView();
});

dom.backHome?.addEventListener("click", showHomeView);

dom.openSavedConfigs?.addEventListener("click", async () => {
  await loadSavedConfigs();
  dom.savedConfigsModal?.classList.remove("hidden");
});

dom.closeSavedConfigs?.addEventListener("click", () => {
  dom.savedConfigsModal?.classList.add("hidden");
});

dom.useSavedConfig?.addEventListener("click", async () => {
  const id = dom.savedConfigSelect?.value;
  if (!id) {
    if (dom.savedConfigStatus) dom.savedConfigStatus.textContent = "Selecciona una planta.";
    return;
  }
  if (dom.savedConfigStatus) dom.savedConfigStatus.textContent = "Activando...";
  try {
    await fetchJson("/config/activate", {
      method: "POST",
      body: JSON.stringify({ plantConfigId: id }),
    });
    dom.savedConfigStatus.textContent = "Activada.";
    dom.savedConfigsModal?.classList.add("hidden");
    hideOverlay();
    startPolling();
  } catch (error) {
    if (dom.savedConfigStatus) dom.savedConfigStatus.textContent = "No se pudo activar.";
    console.error(error);
  }
});

dom.activateSavedBtn?.addEventListener("click", async () => {
  const id = dom.configSavedSelect?.value;
  if (!id) {
    if (dom.configSavedStatus) dom.configSavedStatus.textContent = "Selecciona una planta.";
    return;
  }
  if (dom.configSavedStatus) dom.configSavedStatus.textContent = "Activando...";
  try {
    const updated = await fetchJson("/config/activate", {
      method: "POST",
      body: JSON.stringify({ plantConfigId: id }),
    });
    activeConfig = updated;
    if (dom.configSamplingSeconds) {
      dom.configSamplingSeconds.value = updated.samplingSeconds || 60;
    }
    if (dom.configForm?.samplingSeconds) {
      dom.configForm.samplingSeconds.value = updated.samplingSeconds || 60;
    }
    renderPlantProfile(getPlantById(updated.plantType));
    if (dom.configActiveInfo) {
      dom.configActiveInfo.textContent = `Planta activa: ${updated.plantName} (${updated.location})`;
    }
    if (dom.configSavedStatus) dom.configSavedStatus.textContent = "Planta activada.";
    setActivePlantLabel(updated.plantName);
    hideOverlay();
    startPolling();
  } catch (error) {
    if (dom.configSavedStatus) dom.configSavedStatus.textContent = "No se pudo activar.";
    console.error(error);
  }
});

dom.saveConfigBtn?.addEventListener("click", async () => {
  const seconds = Number(dom.configSamplingSeconds?.value) || 60;
  if (dom.configSaveStatus) dom.configSaveStatus.textContent = "Guardando...";
  const base = activeConfig || {};
  const payload = {
    plantName: base.plantName || "SmartPlant",
    location: base.location || "Living Room",
    plantType: base.plantType || "monstera-deliciosa",
    plantConfigId: base.plantConfigId,
    samplingSeconds: seconds,
  };
  try {
    const updated = await fetchJson("/config", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    activeConfig = updated;
    dom.configSaveStatus.textContent = "Frecuencia actualizada.";
    if (dom.configForm?.samplingSeconds) {
      dom.configForm.samplingSeconds.value = seconds;
    }
    setActivePlantLabel(updated.plantName || activeConfig?.plantName || "SmartPlant");
    hideOverlay();
  } catch (error) {
    if (dom.configSaveStatus) dom.configSaveStatus.textContent = "No se pudo guardar.";
    console.error(error);
  }
});

async function init() {
  await loadPlants();
  await loadConfigForm();
  await loadActiveConfig().catch(() => {});
  showOverlay();
}

document.addEventListener("DOMContentLoaded", init);


