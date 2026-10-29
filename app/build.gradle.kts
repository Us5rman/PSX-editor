import java.net.URL

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.psx.charmaker"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.psx.charmaker"
        minSdk = 29
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    androidResources {
        noCompress += listOf("js", "glb")
    }
}

dependencies {
    implementation("androidx.activity:activity:1.9.0")
    implementation("androidx.webkit:webkit:1.11.0")
}

val threeLibs = mapOf(
    "three.min.js" to "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js",
    "OrbitControls.js" to "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js",
    "GLTFLoader.js" to "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js",
    "GLTFExporter.js" to "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/exporters/GLTFExporter.js",
    "OBJLoader.js" to "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/OBJLoader.js"
)

val fetchThree by tasks.registering {
    val libsDir = file("src/main/assets/web/libs")
    outputs.dir(libsDir)
    doLast {
        libsDir.mkdirs()
        threeLibs.forEach { (name, url) ->
            val target = File(libsDir, name)
            if (!target.exists() || target.length() == 0L) {
                val tmp = File(libsDir, "$name.part")
                URL(url).openStream().use { input ->
                    tmp.outputStream().use { input.copyTo(it) }
                }
                tmp.renameTo(target)
            }
        }
    }
}

tasks.named("preBuild") {
    dependsOn(fetchThree)
}
