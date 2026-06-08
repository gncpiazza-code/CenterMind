plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "com.shelfy.shelfy_mobile"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.shelfy.shelfy_mobile"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    flavorDimensions += "tenant"

    productFlavors {
        create("tabaco") {
            dimension = "tenant"
            applicationIdSuffix = ".tabaco"
            versionNameSuffix = "-tabaco"
            buildConfigField("String", "FLAVOR", "\"tabaco\"")
        }
        create("aloma") {
            dimension = "tenant"
            applicationIdSuffix = ".aloma"
            versionNameSuffix = "-aloma"
            buildConfigField("String", "FLAVOR", "\"aloma\"")
        }
        create("liver") {
            dimension = "tenant"
            applicationIdSuffix = ".liver"
            versionNameSuffix = "-liver"
            buildConfigField("String", "FLAVOR", "\"liver\"")
        }
        create("real") {
            dimension = "tenant"
            applicationIdSuffix = ".real"
            versionNameSuffix = "-real"
            buildConfigField("String", "FLAVOR", "\"real\"")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            // TODO: Add your own signing config for the release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
