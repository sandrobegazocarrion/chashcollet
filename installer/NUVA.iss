; Script de Inno Setup para el instalador de NUVA.
; A diferencia de la primera versión, esto YA NO usa "pkg" para compilar un único .exe:
; se descubrió que pkg no empaqueta bien los requires dinámicos de node-telegram-bot-api
; (todo funcionaba hasta usar Telegram, ahí fallaba por un módulo faltante). En su lugar
; se embebe el Node.js oficial sin modificar (runtime\node.exe) + los archivos reales del
; proyecto (server\, public\, node_modules\), lanzados por un script oculto (launch.vbs).
; Esto también evita los falsos positivos de antivirus típicos de los binarios de pkg.
;
; Antes de compilar: node_modules debe existir en la raíz del proyecto con SOLO las
; dependencias de producción (ejecutar "npm install" tras cualquier cambio en package.json),
; y runtime\node.exe debe existir (Node.js oficial de nodejs.org, sin modificar).
; Ver installer\README.md para el paso a paso completo.

#define MyAppName "NUVA"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "NUVA"
; GUID fijo: NO cambiar entre versiones. Es lo que permite que un instalador nuevo
; actualice la instalación existente en vez de crear una entrada duplicada.
#define MyAppId "{{a88df13a-6429-4695-bf23-3b977cecbb1e}"

[Setup]
AppId={#MyAppId}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\Programs\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
; Instala en el perfil del usuario: no requiere derechos de administrador, útil para
; instalar en la PC del cliente sin depender de que tenga (o sepa) la contraseña de admin.
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=NUVA-Setup-{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\runtime\node.exe

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon"; Description: "Crear un acceso directo en el Escritorio"; GroupDescription: "Accesos directos:"

[Files]
Source: "..\runtime\node.exe"; DestDir: "{app}\runtime"; Flags: ignoreversion
Source: "..\server\*"; DestDir: "{app}\server"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\public\*"; DestDir: "{app}\public"; Excludes: "*.bak,*.bak-*"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\node_modules\*"; DestDir: "{app}\node_modules"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "launch.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: "INSTALLED"; DestDir: "{app}"; Flags: ignoreversion
; No se incluyen: data.json (datos reales del desarrollador), .env (su token de Telegram),
; ni las carpetas de herramientas de desarrollo (.claude, .codex, .agents, .impeccable).

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\launch.vbs"; IconFilename: "{app}\runtime\node.exe"
Name: "{group}\Desinstalar {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\launch.vbs"; IconFilename: "{app}\runtime\node.exe"; Tasks: desktopicon

[Run]
Filename: "wscript.exe"; Parameters: """{app}\launch.vbs"""; Description: "Abrir {#MyAppName} ahora"; Flags: nowait postinstall skipifsilent

; Los datos del usuario viven en %APPDATA%\NUVA (fuera de {app}), así que desinstalar
; o instalar una versión nueva encima NUNCA los toca — Inno Setup solo borra lo que puso en {app}.
