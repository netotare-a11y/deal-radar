import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// 빌드할 때 -PsiteUrl=https://아이디.github.io/deal-radar/ 로 지정한다.
val siteUrl = (findProperty("siteUrl") as String?) ?: "https://localhost.invalid/"

// 서명 키는 저장소에 넣지 않는다. 같은 키로 서명해야 앱을 덮어써서 업데이트할 수 있다.
val signingFile = rootProject.file("release-signing.properties")
val signing = Properties().apply {
    if (signingFile.exists()) signingFile.inputStream().use { load(it) }
}

android {
    namespace = "kr.dealradar.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "kr.dealradar.app"
        minSdk = 26
        targetSdk = 35
        versionCode = (findProperty("versionCode") as String?)?.toInt() ?: 1
        versionName = "0.1.0"
        buildConfigField("String", "SITE_URL", "\"$siteUrl\"")
    }

    buildFeatures {
        buildConfig = true
    }

    signingConfigs {
        if (signingFile.exists()) {
            create("release") {
                storeFile = rootProject.file(signing.getProperty("storeFile"))
                storePassword = signing.getProperty("storePassword")
                keyAlias = signing.getProperty("keyAlias")
                keyPassword = signing.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (signingFile.exists()) signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.work:work-runtime-ktx:2.9.1")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
