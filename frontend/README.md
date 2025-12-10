# SmartPlant Dashboard (Frontend)

Aplicación web ligera (HTML + CSS + JS) que consume el backend Flask para mostrar:

- Lecturas actuales de temperatura, humedad y luz.
- Historial (24h) separado por métrica con Chart.js.
- Estado semántico + recomendaciones según el perfil de planta seleccionado.
- Formulario para actualizar nombre/ubicación/frecuencia y tipo de planta.
- Panel lateral con estado del ESP32 y enlaces para descargar los datos RDF/JSON-LD.

## Requisitos

- Servir los archivos estáticos (por ejemplo con `npx serve`, `python -m http.server` o extensión Live Server).
- Backend Flask ejecutándose en `http://localhost:5000`.

## Uso

```bash
cd frontend
npx serve .    # o python -m http.server 4173
```

Abre `http://localhost:3000` (dependiendo del servidor seleccionado) y el tablero empezará a consultar el backend cada 15 segundos.

## Configuración

- Modifica `API_BASE` en `app.js` si el backend corre en otra dirección.
- Los umbrales provienen del backend (`/api/plants`). Para crear nuevas plantas, edita `backend/data/plants.json`.
- Personaliza estilos en `styles.css` (sidebar, tarjetas, etc.).
- Para empaquetar con cualquier bundler añade los archivos dentro de tu pipeline preferido (Vite, Parcel, etc.).

