# Auto-arranque en Windows

Microsoft desactivo el autorun.inf de USB en 2011 por razones de seguridad. No
hay forma soportada de que un .exe se ejecute solo al insertar una USB. Las
alternativas son:

## Opcion A: Lanzamiento manual (recomendada)

Doble click en `autorun.bat` al insertar la USB. Listo.

## Opcion B: Task Scheduler (semi-automatica)

1. Abrir `Task Scheduler` (Programador de tareas).
2. **Crear tarea** (no "tarea basica").
3. Pestana **Disparadores** -> **Nuevo** -> En el menu, escoger **Al producirse un evento**.
   - Registro: `Microsoft-Windows-DriverFrameworks-UserMode/Operational`
   - Origen: `DriverFrameworks-UserMode`
   - Id. de evento: `2003` o `2004` (deteccion de USB)
4. Pestana **Acciones** -> **Nuevo**:
   - Accion: `Iniciar un programa`
   - Programa o script: ruta a `autorun.bat` en tu USB
   - Iniciar en: ruta de la carpeta de la USB
5. Aceptar.

> Limitacion: la letra de la unidad de la USB puede cambiar. Una solucion
> robusta es usar la **etiqueta** (`USBMUSIC`) y un pequeno script que la
> busque. Ejemplo de bootstrap:

```bat
@echo off
for /f "delims=" %%D in ('wmic logicaldisk where "VolumeName='USBMUSIC'" get DeviceID /value ^| find "="') do (
  for /f "tokens=2 delims==" %%X in ("%%D") do call "%%X\autorun.bat"
)
```

## Opcion C: Servicio Windows

Para instalaciones permanentes (la app vive en C:\Program Files\USBMUSIC),
usar `node-windows` para registrar el server como servicio:

```powershell
cd C:\Program Files\USBMUSIC\server
npm install -g node-windows
node scripts/install-service.js
```

(El script de servicio no esta incluido por defecto; pidelo si lo necesitas.)
