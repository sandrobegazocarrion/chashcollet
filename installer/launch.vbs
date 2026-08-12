' Lanzador silencioso de NUVA: corre el Node oficial embebido en runtime\node.exe
' sobre server\server.js, sin ventana de consola visible, y guarda cualquier
' error en %APPDATA%\NUVA\logs.txt para poder diagnosticar fallos a distancia.
Set fso = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")

appDir = fso.GetParentFolderName(WScript.ScriptFullName)
appData = WshShell.ExpandEnvironmentStrings("%APPDATA%") & "\NUVA"
If Not fso.FolderExists(appData) Then fso.CreateFolder(appData)

nodeExe = appDir & "\runtime\node.exe"
serverJs = appDir & "\server\server.js"
logFile = appData & "\logs.txt"

q = Chr(34)
innerCmd = q & nodeExe & q & " " & q & serverJs & q & " >> " & q & logFile & q & " 2>&1"
fullCmd = "cmd /c " & q & innerCmd & q

WshShell.CurrentDirectory = appDir
WshShell.Run fullCmd, 0, False
