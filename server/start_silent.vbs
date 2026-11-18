Dim WshShell, fso, scriptDir, batPath
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
batPath = scriptDir & "\run.bat"

WshShell.CurrentDirectory = scriptDir
WshShell.Run "cmd /c """ & batPath & """", 0, False
