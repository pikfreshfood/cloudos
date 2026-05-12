$ErrorActionPreference = "Stop"

$colDir = "C:\Users\USER\AndroidStudioProjects\Col"
$appDir = "$colDir\app"
$srcDir = "$appDir\src\main\java\com\example\col"
$sourceCodeDir = "C:\xampp\htdocs\cloud project\CloudMobileNative_SourceCode"

Write-Host "1. Ensuring source directory exists..."
if (-not (Test-Path $srcDir)) {
    New-Item -ItemType Directory -Force -Path $srcDir | Out-Null
}

Write-Host "2. Modifying build.gradle.kts to enable Jetpack Compose and Retrofit..."
$gradlePath = "$appDir\build.gradle.kts"
if (Test-Path $gradlePath) {
    $gradleContent = Get-Content $gradlePath -Raw
    
    # Enable compose
    if ($gradleContent -notmatch "compose = true") {
        $gradleContent = $gradleContent -replace 'compileOptions\s*\{', "buildFeatures {`n        compose = true`n    }`n    composeOptions {`n        kotlinCompilerExtensionVersion = `"1.5.1`"`n    }`n    compileOptions {"
    }

    # Add dependencies
    if ($gradleContent -notmatch "androidx.compose:compose-bom") {
        $deps = @"
dependencies {
    // Jetpack Compose
    implementation(platform("androidx.compose:compose-bom:2024.04.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.activity:activity-compose:1.9.0")
    
    // Retrofit
    implementation("com.squareup.retrofit2:retrofit:2.9.0")
    implementation("com.squareup.retrofit2:converter-gson:2.9.0")
"@
        $gradleContent = $gradleContent -replace 'dependencies\s*\{', $deps
    }
    
    Set-Content -Path $gradlePath -Value $gradleContent
}

Write-Host "3. Modifying AndroidManifest.xml to add INTERNET permissions..."
$manifestPath = "$appDir\src\main\AndroidManifest.xml"
if (Test-Path $manifestPath) {
    $manifestContent = Get-Content $manifestPath -Raw
    if ($manifestContent -notmatch "android.permission.INTERNET") {
        $manifestContent = $manifestContent -replace '<application', "<uses-permission android:name=`"android.permission.INTERNET`" />`n    <uses-permission android:name=`"android.permission.ACCESS_NETWORK_STATE`" />`n`n    <application"
        Set-Content -Path $manifestPath -Value $manifestContent
    }
}

Write-Host "4. Copying Translated Kotlin Files..."
Copy-Item -Path "$sourceCodeDir\*.kt" -Destination $srcDir -Force

Write-Host "5. Updating Package Names in copied files..."
Get-ChildItem -Path $srcDir -Filter "*.kt" | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    $content = $content -replace 'package com\.cloudmobile\.app[^\n\r]*', 'package com.example.col'
    Set-Content -Path $_.FullName -Value $content
}

Write-Host "6. Removing default MainActivity.java if it exists..."
if (Test-Path "$srcDir\MainActivity.java") {
    Remove-Item "$srcDir\MainActivity.java" -Force
}

Write-Host "7. Creating new Compose MainActivity.kt..."
$mainActivityContent = @"
package com.example.col

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                LoginScreen(
                    onNavigateToDashboard = { /* TODO */ },
                    onNavigateToRegister = { /* TODO */ }
                )
            }
        }
    }
}
"@
Set-Content -Path "$srcDir\MainActivity.kt" -Value $mainActivityContent

Write-Host "Done! The project 'Col' is fully set up with the Login Screen and API Service."