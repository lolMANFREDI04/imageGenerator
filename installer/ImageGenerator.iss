; Inno Setup script for ImageGenerator
; Compile with: "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer\ImageGenerator.iss
; Produces: installer\Output\ImageGenerator-Setup.exe

#define MyAppName "Image Generator"
#define MyAppVersion "0.1.0"
#define MyAppPublisher "ImageGenerator"
#define MyAppExeName "ImageGenerator.exe"

[Setup]
AppId={{6F8C2D8A-4F73-4E6E-9E02-9C7A6F9B4E01}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\ImageGenerator
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=Output
OutputBaseFilename=ImageGenerator-Setup
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
WizardStyle=modern
PrivilegesRequired=admin
UninstallDisplayIcon={app}\{#MyAppExeName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "italian"; MessagesFile: "compiler:Languages\Italian.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts"
Name: "downloadmodel"; Description: "Download the Stable Diffusion 1.5 OpenVINO model now (~2.5 GB) — you can also do this later from the app's Settings page"; GroupDescription: "Optional model"; Flags: unchecked

[Files]
; Bundle the entire PyInstaller onedir output
Source: "..\dist\ImageGenerator\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{commondesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
; Optional: download the model at the end of the install (visible console).
Filename: "{app}\{#MyAppExeName}"; Parameters: "--download-model"; \
  Description: "Downloading SD 1.5 model (this can take a while)..."; \
  StatusMsg: "Downloading Stable Diffusion 1.5 OpenVINO model..."; \
  Tasks: downloadmodel; Flags: waituntilterminated

; Launch the app
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; \
  Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Remove user data on uninstall? Keep it by default — comment-out to delete.
; Type: filesandordirs; Name: "{app}\data"
