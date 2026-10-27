module.exports = {
  expo: {
    name: 'TrackIt',
    slug: 'trackit',
    owner: 'blue_sky_development',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    ios: {
      supportsTablet: true,
    },
    android: {
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      '@react-native-community/datetimepicker',
      'expo-status-bar',
      'expo-font',
    ],
    extra: {
      eas: {
        projectId: '7e58c847-230c-4e14-b28c-e7d3838534ea',
      },
    },
    runtimeVersion: {
      policy: 'appVersion',
    },
    updates: {
      url: 'https://u.expo.dev/7e58c847-230c-4e14-b28c-e7d3838534ea',
    },
  },
};
