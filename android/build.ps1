param(
    [string]$BuildTools = "$PSScriptRoot/../work/android-tools/build-tools/android-15",
    [string]$PlatformJar = "$PSScriptRoot/../work/android-tools/platform/android-35/android.jar"
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$project = Split-Path $PSScriptRoot -Parent
$build = Join-Path ([System.IO.Path]::GetTempPath()) 'repor-android-build'
$signing = Join-Path $PSScriptRoot 'signing'
$output = Join-Path $project 'outputs'
New-Item -ItemType Directory -Force $build,$signing,$output,"$build/classes","$build/dex" | Out-Null
$BuildTools = (Resolve-Path $BuildTools).Path
$PlatformJar = (Resolve-Path $PlatformJar).Path
# Android's Windows resource tools cannot reliably read accented path arguments.
Copy-Item -LiteralPath $PlatformJar -Destination "$build/android.jar" -Force
$PlatformJar = "$build/android.jar"
Copy-Item -LiteralPath "$PSScriptRoot/res" -Destination $build -Recurse -Force
Copy-Item -LiteralPath "$PSScriptRoot/AndroidManifest.xml" -Destination "$build/AndroidManifest.xml" -Force
$java = (Get-Command java.exe).Source
$javaBin = Split-Path $java -Parent
$javac = Join-Path $javaBin 'javac.exe'
$keytool = Join-Path $javaBin 'keytool.exe'
if (!(Test-Path $javac)) { throw 'Instale o JDK completo e inclua a pasta bin no PATH.' }
function Run-Native([string]$exe, [string[]]$arguments) {
    & $exe @arguments
    if ($LASTEXITCODE -ne 0) { throw "Falha ao executar $exe (código $LASTEXITCODE)" }
}
$resources = Join-Path $build 'resources.zip'
$unsigned = Join-Path $build 'unsigned.apk'
$aligned = Join-Path $build 'aligned.apk'
$apk = Join-Path $build 'Repor-1.0.0.apk'
Run-Native "$BuildTools/aapt2.exe" @('compile','--dir',"$build/res",'-o',$resources)
Run-Native "$BuildTools/aapt2.exe" @('link','-o',$unsigned,'-I',$PlatformJar,'--manifest',"$build/AndroidManifest.xml",$resources)
$sources = @(Get-ChildItem "$PSScriptRoot/src" -Recurse -Filter '*.java' | ForEach-Object FullName)
Run-Native $javac (@('-J-Xms16m','-J-Xmx128m','-J-XX:+UseSerialGC','-encoding','UTF-8','-source','8','-target','8','-bootclasspath',$PlatformJar,'-d',"$build/classes") + $sources)
$classes = @(Get-ChildItem "$build/classes" -Recurse -Filter '*.class' | ForEach-Object FullName)
Run-Native $java (@('-Xms16m','-Xmx192m','-XX:+UseSerialGC','-cp',"$BuildTools/lib/d8.jar",'com.android.tools.r8.D8','--release','--min-api','23','--lib',$PlatformJar,'--output',"$build/dex") + $classes)
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($unsigned, [System.IO.Compression.ZipArchiveMode]::Update)
try {
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,"$build/dex/classes.dex",'classes.dex') | Out-Null
} finally { $zip.Dispose() }
Run-Native "$BuildTools/zipalign.exe" @('-f','-p','4',$unsigned,$aligned)
$keystore = Join-Path $signing 'repor-release.p12'
$passwordFile = Join-Path $signing 'password.txt'
if (!(Test-Path $keystore)) {
    if (!(Test-Path $passwordFile)) {
        $bytes = New-Object byte[] 32
        $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
        [System.IO.File]::WriteAllText($passwordFile,[Convert]::ToBase64String($bytes))
    }
    Run-Native $keytool @('-J-Xms16m','-J-Xmx96m','-J-XX:+UseSerialGC','-genkeypair','-keystore',$keystore,'-storetype','PKCS12','-storepass:file',$passwordFile,'-alias','repor','-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=Repor Android, OU=Aplicativo, O=Repor, C=BR')
}
if (!(Test-Path $passwordFile)) { throw 'A senha da chave de assinatura está ausente.' }
Run-Native $java @('-Xms16m','-Xmx96m','-XX:+UseSerialGC','-jar',"$BuildTools/lib/apksigner.jar",'sign','--ks',$keystore,'--ks-key-alias','repor','--ks-pass',"file:$passwordFile",'--out',$apk,$aligned)
Run-Native $java @('-Xms16m','-Xmx96m','-XX:+UseSerialGC','-jar',"$BuildTools/lib/apksigner.jar",'verify','--verbose',$apk)
Run-Native "$BuildTools/zipalign.exe" @('-c','4',$apk)
Run-Native "$BuildTools/aapt2.exe" @('dump','badging',$apk)
Copy-Item -LiteralPath $apk -Destination "$output/Repor-1.0.0.apk" -Force
$apk = Join-Path $output 'Repor-1.0.0.apk'
$hash = (Get-FileHash $apk -Algorithm SHA256).Hash.ToLowerInvariant()
[System.IO.File]::WriteAllText("$apk.sha256", "$hash  Repor-1.0.0.apk`n")
Write-Output "APK pronto: $apk"
