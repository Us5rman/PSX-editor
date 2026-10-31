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

val jsd = "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js"
val threeLibs = linkedMapOf(
    "three.min.js" to "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js",
    "OrbitControls.js" to "$jsd/controls/OrbitControls.js",
    "GLTFLoader.js" to "$jsd/loaders/GLTFLoader.js",
    "OBJLoader.js" to "$jsd/loaders/OBJLoader.js",
    "CopyShader.js" to "$jsd/shaders/CopyShader.js",
    "LuminosityHighPassShader.js" to "$jsd/shaders/LuminosityHighPassShader.js",
    "GammaCorrectionShader.js" to "$jsd/shaders/GammaCorrectionShader.js",
    "FXAAShader.js" to "$jsd/shaders/FXAAShader.js",
    "EffectComposer.js" to "$jsd/postprocessing/EffectComposer.js",
    "RenderPass.js" to "$jsd/postprocessing/RenderPass.js",
    "ShaderPass.js" to "$jsd/postprocessing/ShaderPass.js",
    "MaskPass.js" to "$jsd/postprocessing/MaskPass.js",
    "UnrealBloomPass.js" to "$jsd/postprocessing/UnrealBloomPass.js"
)
val requiredLibs = setOf("three.min.js", "OrbitControls.js", "GLTFLoader.js", "OBJLoader.js")

val fetchThree by tasks.registering {
    val libsDir = file("src/main/assets/web/libs")
    outputs.dir(libsDir)
    doLast {
        libsDir.mkdirs()
        threeLibs.forEach { (name, url) ->
            val target = File(libsDir, name)
            if (!target.exists() || target.length() == 0L) {
                val tmp = File(libsDir, "$name.part")
                try {
                    URL(url).openStream().use { input ->
                        tmp.outputStream().use { input.copyTo(it) }
                    }
                    tmp.renameTo(target)
                } catch (e: Exception) {
                    if (name in requiredLibs) throw e
                    tmp.delete()
                    target.writeText("// optional library could not be downloaded\n")
                }
            }
        }
    }
}

tasks.named("preBuild") {
    dependsOn(fetchThree)
}
