Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\Sandro\Desktop\MisFinanzasApp"
WshShell.Run "cmd /c node server\server.js >> logs.txt 2>&1", 0, False
