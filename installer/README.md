# Cómo generar el instalador de NUVA

## Cómo funciona (importante si vuelves a tocar esto)

La primera versión compilaba un único `.exe` con `pkg`. Se descartó: `pkg` analiza
estáticamente los `require()` para decidir qué empaquetar, y `node-telegram-bot-api`
carga algunas dependencias de forma dinámica — quedaban fuera del `.exe`, así que todo
funcionaba hasta que el cliente intentaba usar Telegram, y ahí fallaba por un módulo
faltante. Además, los `.exe` generados por `pkg` disparan falsos positivos de antivirus
con frecuencia.

Ahora se usa el **Node.js oficial sin modificar** (`runtime\node.exe`, descargado tal
cual de nodejs.org) corriendo los archivos reales del proyecto (`server\`, `public\`,
`node_modules\` con las dependencias reales instaladas por npm) — nada de bundling.
Un script oculto (`launch.vbs`) es el que el cliente ejecuta al abrir la app.

## Requisitos (solo en tu PC, la que compila)

- Node.js (ya lo tienes, es lo que usas para desarrollar).
- [Inno Setup 6](https://jrsoftware.org/isdl.php) — gratis. Se puede instalar con:
  `winget install JRSoftware.InnoSetup`
- `runtime\node.exe` — el Node.js oficial de Windows x64, sin modificar. Si no existe
  (por ejemplo, es la primera vez o quieres actualizar la versión de Node embebida):
  1. Descarga el `.zip` de la versión que quieras desde https://nodejs.org/dist/ (ej.
     `node-v24.19.0-win-x64.zip`) y verifica su SHA256 contra `SHASUMS256.txt` de esa
     misma carpeta.
  2. Extrae `node.exe` (está en la raíz del zip) a `runtime\node.exe` en este proyecto.

El cliente final **no necesita instalar nada de esto**: recibe un único instalador que
ya trae Node embebido.

## Generar un instalador nuevo (cada vez que quieras entregar una versión)

Desde la raíz del proyecto:

```
npm install
npm run build:installer
```

- `npm install` deja `node_modules\` con exactamente las dependencias de producción
  (asegúrate de no tener paquetes de desarrollo colgando — este proyecto no debería
  tener `devDependencies`).
- `build:installer` compila `installer\NUVA.iss` con Inno Setup, empaquetando
  `runtime\node.exe` + `server\` + `public\` + `node_modules\` + el lanzador
  `launch.vbs` en `dist\NUVA-Setup-1.0.0.exe`, que es el archivo que se entrega al
  cliente (por USB o enlace de descarga).

Si cambias la versión, edita `#define MyAppVersion` en `installer/NUVA.iss` antes de
compilar. El `AppId` (GUID) **no se debe tocar**: es lo que permite que un instalador
nuevo actualice la instalación anterior en vez de duplicarla.

## Qué incluye el instalador y qué no

Incluye: `runtime\node.exe`, `server\*.js`, `public\` (sin los `.bak` de desarrollo),
`node_modules\` (dependencias reales), `launch.vbs` y un archivo vacío `INSTALLED`
(marca que la app corre instalada, no en modo desarrollo — así sabe usar
`%APPDATA%\NUVA` para los datos).

No incluye (ni debe incluir nunca): `data.json` (sería tus datos reales), `.env` (tu
token de Telegram), ni las carpetas de herramientas de desarrollo (`.claude/`,
`.codex/`, `.agents/`, `.impeccable/`).

## Cómo se instala en la PC del cliente

1. El cliente ejecuta `NUVA-Setup-1.0.0.exe` (doble clic).
2. Se instala en su carpeta de usuario (`%LocalAppData%\Programs\NUVA`) — **no pide
   permisos de administrador**.
3. Al terminar, se abre NUVA automáticamente en el navegador y aparece el asistente de
   primera configuración.

## Dónde quedan los datos del cliente

En `%APPDATA%\NUVA\` (fuera de la carpeta de instalación): `data.json`, `.env` (si
configuró Telegram), `backups\` (respaldos diarios automáticos) y `logs.txt` (lo que
imprime el servidor — útil para diagnosticar un fallo en la PC de un cliente: pídele
ese archivo si algo no funciona). Esa carpeta **nunca se toca** al instalar una versión
nueva encima ni al desinstalar.

## Cómo actualizar la app de un cliente más adelante

Le entregas el nuevo `NUVA-Setup-X.Y.Z.exe` y lo ejecuta igual que la primera vez: como
el `AppId` es el mismo, Windows lo reconoce como una actualización (reemplaza los
archivos del programa) y sus datos en `%APPDATA%\NUVA` quedan intactos. No hace falta
desinstalar antes.
