import React, { useState, useRef, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  Alert, 
  ScrollView, 
  Platform,
  Dimensions,
  Animated
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';

const { width, height } = Dimensions.get('window');

// MVP Configuration for omniSplat Spatial Capture
const CAPTURE_CONFIG = {
  MAX_PHOTOS: 1000,
  MAX_VIDEO_DURATION: 600, // 10 minutes
  MIN_PHOTOS_FOR_PROCESSING: 8,
  BURST_COUNT: 20,
  GPS_UPDATE_INTERVAL: 1000, // 1 second
  GPS_DISTANCE_INTERVAL: 0.1, // 10cm
  RTK_ACCURACY_THRESHOLD: 1.0 // meters
};

// Design System - Holographic Tech Gradient
const COLORS = {
  background: '#1a0b2e',
  backgroundDark: '#0f0619',
  primary: '#14F195', // Electric green
  secondary: '#9945FF', // Solana purple
  tertiary: '#00d4ff', // Cyan
  text: '#f0f0f0',
  textSecondary: '#b0b0b0',
  glass: 'rgba(255, 255, 255, 0.05)',
  glassBorder: 'rgba(255, 255, 255, 0.1)',
  success: '#14F195',
  warning: '#FF9500',
  error: '#FF4444',
  recording: '#FF6B6B'
};

export default function App() {
  // Permission states (using expo-camera v17 hook)
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [hasLocationPermission, setHasLocationPermission] = useState(null);
  
  // Camera states
  const [cameraReady, setCameraReady] = useState(false);
  const [facing, setFacing] = useState('back');
  
  // Location states
  const [currentLocation, setCurrentLocation] = useState(null);
  const [locationAccuracy, setLocationAccuracy] = useState(null);
  const [isRTKEnabled, setIsRTKEnabled] = useState(false);
  
  // Capture states
  const [capturedPhotos, setCapturedPhotos] = useState([]);
  const [capturedVideos, setCapturedVideos] = useState([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  
  // Session states
  const [captureSession, setCaptureSession] = useState({
    id: null,
    startTime: null,
    totalAssets: 0,
    baseLocation: null
  });
  
  // Animation values
  const pulseAnim = useRef(new Animated.Value(1)).current;
  
  // Refs
  const cameraRef = useRef(null);
  const recordingTimer = useRef(null);
  const locationWatcher = useRef(null);

  // Pulse animation for capture button
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  // Initialize permissions and location tracking
  useEffect(() => {
    initializeApp();
    
    return () => {
      if (locationWatcher.current) {
        locationWatcher.current.remove();
      }
      if (recordingTimer.current) {
        clearInterval(recordingTimer.current);
      }
    };
  }, []);

  const initializeApp = async () => {
    try {
      // Request camera permission (v17 style)
      if (!cameraPermission?.granted) {
        const result = await requestCameraPermission();
        if (!result.granted) {
          Alert.alert('Camera Permission Required', 'Please enable camera access for spatial capture');
          return;
        }
      }

      // Request location permission with high accuracy
      const locationStatus = await Location.requestForegroundPermissionsAsync();
      setHasLocationPermission(locationStatus.status === 'granted');
      
      if (locationStatus.status !== 'granted') {
        Alert.alert('Location Permission Required', 'Please enable location access for georeferencing');
        return;
      }

      // Start high-precision location tracking
      await startLocationTracking();
      
    } catch (error) {
      console.error('App initialization failed:', error);
      Alert.alert('Initialization Error', 'Failed to initialize app permissions');
    }
  };

  const startLocationTracking = async () => {
    try {
      locationWatcher.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: CAPTURE_CONFIG.GPS_UPDATE_INTERVAL,
          distanceInterval: CAPTURE_CONFIG.GPS_DISTANCE_INTERVAL,
        },
        (location) => {
          setCurrentLocation(location);
          setLocationAccuracy(location.coords.accuracy);
          setIsRTKEnabled(location.coords.accuracy < CAPTURE_CONFIG.RTK_ACCURACY_THRESHOLD);
        }
      );
    } catch (error) {
      console.error('Location tracking failed:', error);
      Alert.alert('GPS Error', 'Failed to start location tracking');
    }
  };

  // Start new capture session
  const startCaptureSession = async () => {
    if (!currentLocation) {
      Alert.alert('GPS Required', 'Waiting for GPS lock before starting session...');
      return;
    }

    const sessionId = `omni_${Date.now()}`;
    const baseLocation = {
      latitude: currentLocation.coords.latitude,
      longitude: currentLocation.coords.longitude,
      altitude: currentLocation.coords.altitude || 0,
      accuracy: currentLocation.coords.accuracy,
      timestamp: currentLocation.timestamp,
      isRTK: isRTKEnabled
    };

    setCaptureSession({
      id: sessionId,
      startTime: Date.now(),
      totalAssets: 0,
      baseLocation: baseLocation
    });
    
    setCapturedPhotos([]);
    setCapturedVideos([]);
    
    Alert.alert(
      '✓ Session Started', 
      `${sessionId}\n` +
      `${baseLocation.latitude.toFixed(6)}, ${baseLocation.longitude.toFixed(6)}\n` +
      `Accuracy: ${baseLocation.accuracy.toFixed(1)}m ${isRTKEnabled ? '(RTK)' : ''}`
    );
  };

  // Capture georeferenced photo
  const capturePhoto = async () => {
    if (!cameraRef.current || !cameraReady || !currentLocation) {
      if (!currentLocation) {
        Alert.alert('GPS Required', 'Waiting for GPS location...');
      }
      return;
    }

    if (capturedPhotos.length >= CAPTURE_CONFIG.MAX_PHOTOS) {
      Alert.alert('Limit Reached', `Maximum ${CAPTURE_CONFIG.MAX_PHOTOS} photos captured`);
      return;
    }

    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
        exif: true,
      });
      
      // Create comprehensive georeferenced metadata
      const geoReferencedPhoto = {
        ...photo,
        timestamp: Date.now(),
        sessionId: captureSession.id,
        index: capturedPhotos.length + 1,
        gpsData: {
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude,
          altitude: currentLocation.coords.altitude || 0,
          accuracy: currentLocation.coords.accuracy,
          heading: currentLocation.coords.heading || 0,
          speed: currentLocation.coords.speed || 0,
          timestamp: currentLocation.timestamp,
          isRTK: isRTKEnabled
        },
        surveyMetadata: {
          relativeToBase: {
            deltaLat: currentLocation.coords.latitude - captureSession.baseLocation.latitude,
            deltaLon: currentLocation.coords.longitude - captureSession.baseLocation.longitude,
            deltaAlt: (currentLocation.coords.altitude || 0) - captureSession.baseLocation.altitude
          },
          captureQuality: {
            gpsAccuracy: currentLocation.coords.accuracy,
            isRTKEnabled: isRTKEnabled,
            coordinateSystem: 'WGS84'
          }
        }
      };
      
      setCapturedPhotos(prev => [...prev, geoReferencedPhoto]);
      setCaptureSession(prev => ({
        ...prev,
        totalAssets: prev.totalAssets + 1
      }));
      
    } catch (error) {
      console.error('Photo capture failed:', error);
      Alert.alert('Capture Error', 'Failed to capture georeferenced photo');
    }
    setIsCapturing(false);
  };

  // Burst capture mode
  const startBurstCapture = async () => {
    if (!currentLocation) {
      Alert.alert('GPS Required', 'GPS location required for georeferenced burst capture');
      return;
    }

    const remainingCapacity = CAPTURE_CONFIG.MAX_PHOTOS - capturedPhotos.length;
    const burstCount = Math.min(CAPTURE_CONFIG.BURST_COUNT, remainingCapacity);
    
    if (burstCount === 0) {
      Alert.alert('Storage Full', 'Maximum photo capacity reached');
      return;
    }

    Alert.alert('Burst Mode', `Capturing ${burstCount} georeferenced photos...`);
    
    for (let i = 0; i < burstCount; i++) {
      await capturePhoto();
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    Alert.alert('✓ Burst Complete', `Captured ${burstCount} photos`);
  };

  // Start video recording
  const startVideoRecording = async () => {
    if (!cameraRef.current || !cameraReady || isRecording || !currentLocation) {
      if (!currentLocation) {
        Alert.alert('GPS Required', 'GPS location required for georeferenced video');
      }
      return;
    }

    setIsRecording(true);
    setRecordingDuration(0);
    
    recordingTimer.current = setInterval(() => {
      setRecordingDuration(prev => {
        if (prev >= CAPTURE_CONFIG.MAX_VIDEO_DURATION) {
          stopVideoRecording();
          return prev;
        }
        return prev + 1;
      });
    }, 1000);

    try {
      const video = await cameraRef.current.recordAsync();
      
      const geoReferencedVideo = {
        ...video,
        timestamp: Date.now(),
        sessionId: captureSession.id,
        duration: recordingDuration,
        gpsData: {
          startLocation: {
            latitude: currentLocation.coords.latitude,
            longitude: currentLocation.coords.longitude,
            altitude: currentLocation.coords.altitude || 0,
            accuracy: currentLocation.coords.accuracy,
            timestamp: currentLocation.timestamp,
            isRTK: isRTKEnabled
          }
        }
      };
      
      setCapturedVideos(prev => [...prev, geoReferencedVideo]);
      setCaptureSession(prev => ({
        ...prev,
        totalAssets: prev.totalAssets + 1
      }));
      
    } catch (error) {
      console.error('Video recording failed:', error);
      Alert.alert('Recording Error', 'Failed to record georeferenced video');
    }
  };

  // Stop video recording
  const stopVideoRecording = () => {
    if (cameraRef.current && isRecording) {
      cameraRef.current.stopRecording();
      setIsRecording(false);
      if (recordingTimer.current) {
        clearInterval(recordingTimer.current);
      }
    }
  };

  // Reset session
  const resetSession = () => {
    Alert.alert(
      'Reset Session',
      'This will clear all captured data. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            setCapturedPhotos([]);
            setCapturedVideos([]);
            setCaptureSession({
              id: null,
              startTime: null,
              totalAssets: 0,
              baseLocation: null
            });
          }
        }
      ]
    );
  };

  // Format time
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Get GPS status color
  const getGPSStatusColor = () => {
    if (!currentLocation) return COLORS.error;
    if (isRTKEnabled) return COLORS.primary;
    if (locationAccuracy < 5) return COLORS.success;
    if (locationAccuracy < 15) return COLORS.warning;
    return COLORS.error;
  };

  // Permission check
  if (!cameraPermission || hasLocationPermission === null) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Initializing omniSplat...</Text>
      </View>
    );
  }

  if (!cameraPermission.granted || hasLocationPermission === false) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Camera and Location permissions are required</Text>
        <TouchableOpacity style={styles.retryButton} onPress={initializeApp}>
          <Text style={styles.buttonText}>Grant Permissions</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      {/* Header with gradient background */}
      <View style={styles.header}>
        <Text style={styles.logo}>omniSplat</Text>
        <View style={styles.walletIndicator}>
          <View style={[styles.statusDot, { backgroundColor: COLORS.success }]} />
          <Text style={styles.walletText}>Connected</Text>
        </View>
      </View>

      {/* GPS Status Bar */}
      <View style={[styles.statusBar, { borderLeftColor: getGPSStatusColor() }]}>
        <View style={styles.statusSection}>
          <Text style={[styles.statusLabel, { color: getGPSStatusColor() }]}>
            {isRTKEnabled ? '● RTK' : '◐ GPS'}
          </Text>
          <Text style={styles.statusValue}>
            {locationAccuracy ? `${locationAccuracy.toFixed(1)}m` : '--'}
          </Text>
        </View>
        
        <View style={styles.statusDivider} />
        
        <View style={styles.statusSection}>
          <Text style={styles.statusLabel}>SESSION</Text>
          <Text style={styles.statusValue}>
            {captureSession.id ? '●' : '○'} {capturedPhotos.length + capturedVideos.length}
          </Text>
        </View>
        
        <View style={styles.statusDivider} />
        
        <View style={styles.statusSection}>
          <Text style={styles.statusLabel}>STORAGE</Text>
          <Text style={styles.statusValue}>
            {Math.round((capturedPhotos.length / CAPTURE_CONFIG.MAX_PHOTOS) * 100)}%
          </Text>
        </View>
      </View>

      {/* Camera Viewfinder */}
      <View style={styles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing={facing}
          onCameraReady={() => setCameraReady(true)}
        >
          {/* Coverage Overlay */}
          {capturedPhotos.length > 0 && (
            <View style={styles.coverageOverlay}>
              <Text style={styles.coverageText}>
                Coverage: {Math.min(Math.round((capturedPhotos.length / 60) * 100), 100)}%
              </Text>
            </View>
          )}
        </CameraView>
      </View>

      {/* Capture Controls */}
      <View style={styles.controlsContainer}>
        {/* Recording indicator */}
        {isRecording && (
          <Animated.View style={[styles.recordingIndicator, { opacity: pulseAnim }]}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>REC {formatTime(recordingDuration)}</Text>
          </Animated.View>
        )}

        {/* Main capture button */}
        <View style={styles.captureRow}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={startBurstCapture}
            disabled={!cameraReady || !currentLocation || isRecording}
          >
            <Text style={styles.secondaryButtonText}>⚡</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.captureButton,
              isCapturing && styles.captureButtonActive,
              isRecording && styles.captureButtonRecording
            ]}
            onPress={isRecording ? stopVideoRecording : capturePhoto}
            disabled={!cameraReady || !currentLocation}
          >
            <Animated.View style={[
              styles.captureButtonInner,
              { transform: [{ scale: isCapturing ? pulseAnim : 1 }] }
            ]}>
              <Text style={styles.captureButtonText}>
                {isRecording ? '■' : '○'}
              </Text>
            </Animated.View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={isRecording ? stopVideoRecording : startVideoRecording}
            disabled={!cameraReady || !currentLocation}
          >
            <Text style={styles.secondaryButtonText}>
              {isRecording ? '■' : '▶'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Action buttons */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.actionButtons}
          contentContainerStyle={styles.actionButtonsContent}
        >
          <TouchableOpacity
            style={[styles.actionButton, !captureSession.id && styles.actionButtonPrimary]}
            onPress={startCaptureSession}
            disabled={!currentLocation}
          >
            <Text style={styles.actionButtonText}>
              {captureSession.id ? '✓ Session Active' : '+ New Session'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => Alert.alert('Process', 'Processing pipeline coming soon!')}
            disabled={capturedPhotos.length < CAPTURE_CONFIG.MIN_PHOTOS_FOR_PROCESSING}
          >
            <Text style={styles.actionButtonText}>
              ⚙ Process ({capturedPhotos.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => Alert.alert('Export', 'Export functionality coming soon!')}
            disabled={capturedPhotos.length === 0}
          >
            <Text style={styles.actionButtonText}>↗ Export</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonDanger]}
            onPress={resetSession}
            disabled={capturedPhotos.length === 0 && capturedVideos.length === 0}
          >
            <Text style={styles.actionButtonText}>🔄 Reset</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Footer badge */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          🔗 Web3-Native • Data Sovereignty • 95% to Creators
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.backgroundDark,
  },
  loadingText: {
    color: COLORS.text,
    fontSize: 16,
    textAlign: 'center',
    marginTop: height / 2 - 50,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 16,
    textAlign: 'center',
    marginTop: height / 2 - 50,
    paddingHorizontal: 40,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
    marginTop: 20,
    alignSelf: 'center',
  },
  buttonText: {
    color: COLORS.background,
    fontSize: 14,
    fontWeight: 'bold',
  },
  
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingBottom: 15,
    paddingHorizontal: 20,
    backgroundColor: COLORS.background,
  },
  logo: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    letterSpacing: -1,
  },
  walletIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.glass,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  walletText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  
  // Status Bar
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: COLORS.glass,
    marginHorizontal: 15,
    marginBottom: 10,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    borderLeftWidth: 3,
  },
  statusSection: {
    alignItems: 'center',
  },
  statusLabel: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statusValue: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 2,
  },
  statusDivider: {
    width: 1,
    height: 30,
    backgroundColor: COLORS.glassBorder,
  },
  
  // Camera
  cameraContainer: {
    flex: 1,
    marginHorizontal: 15,
    marginBottom: 10,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  coverageOverlay: {
    position: 'absolute',
    top: 20,
    left: 20,
    backgroundColor: 'rgba(20, 241, 149, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  coverageText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: 'bold',
  },
  
  // Controls
  controlsContainer: {
    paddingBottom: 20,
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.recording,
    marginRight: 8,
  },
  recordingText: {
    color: COLORS.recording,
    fontSize: 14,
    fontWeight: 'bold',
  },
  captureRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  secondaryButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.glass,
    borderWidth: 2,
    borderColor: COLORS.glassBorder,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 20,
  },
  secondaryButtonText: {
    fontSize: 24,
    color: COLORS.text,
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.glass,
    borderWidth: 4,
    borderColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonActive: {
    borderColor: COLORS.warning,
  },
  captureButtonRecording: {
    borderColor: COLORS.recording,
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonText: {
    fontSize: 32,
    color: COLORS.background,
    fontWeight: 'bold',
  },
  
  // Action Buttons
  actionButtons: {
    maxHeight: 50,
  },
  actionButtonsContent: {
    paddingHorizontal: 15,
  },
  actionButton: {
    backgroundColor: COLORS.glass,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    marginHorizontal: 5,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  actionButtonPrimary: {
    backgroundColor: COLORS.secondary,
    borderColor: COLORS.secondary,
  },
  actionButtonDanger: {
    borderColor: COLORS.error,
  },
  actionButtonText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '600',
  },
  
  // Footer
  footer: {
    paddingVertical: 15,
    alignItems: 'center',
  },
  footerText: {
    color: COLORS.primary,
    fontSize: 10,
    fontStyle: 'italic',
    opacity: 0.7,
  },
});

