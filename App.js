import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert, ScrollView, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Camera } from 'expo-camera';  // Use this for permissions
import { CameraView } from 'expo-camera';  // Use this for the component
import * as Location from 'expo-location';

// MVP Configuration for Omni-Splat Spatial Capture
const CAPTURE_CONFIG = {
  MAX_PHOTOS: 1000,
  MAX_VIDEO_DURATION: 600, // 10 minutes
  MIN_PHOTOS_FOR_PROCESSING: 8,
  BURST_COUNT: 20,
  GPS_UPDATE_INTERVAL: 1000, // 1 second
  GPS_DISTANCE_INTERVAL: 0.1, // 10cm
  RTK_ACCURACY_THRESHOLD: 1.0 // meters
};

export default function App() {
  // Permission states
  const [hasPermission, setHasPermission] = useState(null);
  const [hasLocationPermission, setHasLocationPermission] = useState(null);
  
  // Camera states
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraType, setCameraType] = useState('back');
  
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
  
  // Refs
  const cameraRef = useRef(null);
  const recordingTimer = useRef(null);
  const locationWatcher = useRef(null);

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
      // Request camera permission
      const cameraStatus = await Camera.requestCameraPermissionsAsync();
      setHasPermission(cameraStatus.status === 'granted');
      
      if (cameraStatus.status !== 'granted') {
        Alert.alert('Camera Permission Required', 'Please enable camera access for spatial capture');
        return;
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
      'Capture Session Started', 
      `Session: ${sessionId}\n` +
      `Location: ${baseLocation.latitude.toFixed(6)}, ${baseLocation.longitude.toFixed(6)}\n` +
      `Accuracy: ${baseLocation.accuracy.toFixed(1)}m ${isRTKEnabled ? '(RTK)' : ''}\n` +
      `Ready for spatial capture!`
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
        skipProcessing: false
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

    Alert.alert('Burst Mode', `Capturing ${burstCount} georeferenced photos rapidly...`);
    
    for (let i = 0; i < burstCount; i++) {
      await capturePhoto();
      // Small delay between captures for GPS accuracy
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    Alert.alert('Burst Complete', `Captured ${burstCount} georeferenced photos`);
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
    
    // Start recording timer
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
      const video = await cameraRef.current.recordAsync({
        quality: Camera.Constants.VideoQuality['720p'],
        maxDuration: CAPTURE_CONFIG.MAX_VIDEO_DURATION,
        mute: false
      });
      
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
        },
        surveyMetadata: {
          recordingType: 'continuous_georeferenced',
          coordinateSystem: 'WGS84',
          isRTKEnabled: isRTKEnabled
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

  // Toggle camera type
  const toggleCameraType = () => {
  setCameraType(current => 
    current === 'back' 
      ? 'front' 
      : 'back'
  );
};


  // Format coordinates for display
  const formatCoordinate = (coord) => {
    return coord ? coord.toFixed(6) : 'N/A';
  };

  // Format duration for display
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Show session summary
  const showSessionSummary = () => {
    if (!captureSession.id) {
      Alert.alert('No Session', 'Please start a capture session first');
      return;
    }

    const summary = `Session: ${captureSession.id}\n` +
      `Photos: ${capturedPhotos.length}\n` +
      `Videos: ${capturedVideos.length}\n` +
      `GPS Accuracy: ${locationAccuracy?.toFixed(1)}m ${isRTKEnabled ? '(RTK)' : ''}\n` +
      `Base Location: ${formatCoordinate(captureSession.baseLocation?.latitude)}, ${formatCoordinate(captureSession.baseLocation?.longitude)}`;
    
    Alert.alert('Session Summary', summary);
  };

  // Reset session
  const resetSession = () => {
    Alert.alert(
      'Reset Session',
      'This will clear all captured photos and videos. Continue?',
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

  // Permission checks
  if (hasPermission === null || hasLocationPermission === null) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Requesting permissions...</Text>
      </View>
    );
  }
  
  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Camera access required for spatial capture</Text>
      </View>
    );
  }

  if (hasLocationPermission === false) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Location access required for georeferencing</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🌐 Omni-Splat MVP • Solana Seeker</Text>
      
      {/* GPS Status Display */}
      <View style={styles.gpsContainer}>
        <Text style={styles.gpsText}>
          📍 {currentLocation ? 
            `${formatCoordinate(currentLocation.coords.latitude)}, ${formatCoordinate(currentLocation.coords.longitude)}` : 
            'Acquiring GPS...'
          }
        </Text>
        <Text style={styles.gpsAccuracy}>
          🎯 {locationAccuracy ? `${locationAccuracy.toFixed(1)}m` : 'N/A'} 
          {isRTKEnabled && ' • RTK ENABLED'}
        </Text>
      </View>
      
      {/* Camera View */}
      <CameraView
  ref={cameraRef}
  style={styles.camera}
  facing={cameraType}
  onCameraReady={() => setCameraReady(true)}
/>
      
      {/* Capture Statistics */}
      <View style={styles.statsContainer}>
        <Text style={styles.statsText}>
          📸 {capturedPhotos.length}/{CAPTURE_CONFIG.MAX_PHOTOS}
        </Text>
        <Text style={styles.statsText}>
          🎥 {capturedVideos.length} videos
        </Text>
        <Text style={styles.statsText}>
          📊 Session: {captureSession.id ? '✅' : '❌'}
        </Text>
        {isRecording && (
          <Text style={styles.recordingText}>
            🔴 {formatDuration(recordingDuration)}/{formatDuration(CAPTURE_CONFIG.MAX_VIDEO_DURATION)}
          </Text>
        )}
      </View>
      
      {/* Control Buttons */}
      <ScrollView horizontal style={styles.controls} showsHorizontalScrollIndicator={false}>
        <TouchableOpacity
          style={[styles.button, !captureSession.id && styles.buttonHighlight]}
          onPress={startCaptureSession}
          disabled={!currentLocation}
        >
          <Text style={styles.buttonText}>🎬 Start Session</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.button, isCapturing && styles.buttonDisabled]}
          onPress={capturePhoto}
          disabled={isCapturing || !cameraReady || !captureSession.id || !currentLocation}
        >
          <Text style={styles.buttonText}>📸 Photo</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.button, styles.burstButton]}
          onPress={startBurstCapture}
          disabled={isCapturing || !cameraReady || !captureSession.id || !currentLocation}
        >
          <Text style={styles.buttonText}>⚡ Burst</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.button, isRecording ? styles.stopButton : styles.videoButton]}
          onPress={isRecording ? stopVideoRecording : startVideoRecording}
          disabled={!cameraReady || !captureSession.id || !currentLocation}
        >
          <Text style={styles.buttonText}>
            {isRecording ? '⏹️ Stop' : '🎥 Video'}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.button, styles.utilityButton]}
          onPress={toggleCameraType}
          disabled={!cameraReady}
        >
          <Text style={styles.buttonText}>🔄 Flip</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.button, styles.utilityButton]}
          onPress={showSessionSummary}
        >
          <Text style={styles.buttonText}>📊 Summary</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.button, styles.resetButton]}
          onPress={resetSession}
        >
          <Text style={styles.buttonText}>🔄 Reset</Text>
        </TouchableOpacity>
      </ScrollView>
      
      <Text style={styles.web3Badge}>
        🔗 Web3-Native • Data Sovereignty • Community Owned
      </Text>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  title: {
    color: '#14F195',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingBottom: 10,
  },
  text: {
    color: 'white',
    textAlign: 'center',
    marginTop: 100,
    fontSize: 16,
  },
  gpsContainer: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 8,
    paddingHorizontal: 15,
    marginHorizontal: 15,
    borderRadius: 8,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#14F195',
  },
  gpsText: {
    color: '#14F195',
    fontSize: 11,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  gpsAccuracy: {
    color: '#888',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 2,
  },
  camera: {
    flex: 1,
    margin: 15,
    borderRadius: 15,
    overflow: 'hidden',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    backgroundColor: '#1a1a1a',
    marginHorizontal: 15,
    borderRadius: 10,
    marginBottom: 10,
  },
  statsText: {
    color: '#14F195',
    fontSize: 11,
    fontWeight: 'bold',
  },
  recordingText: {
    color: '#FF6B6B',
    fontSize: 11,
    fontWeight: 'bold',
  },
  controls: {
    paddingBottom: 20,
    paddingHorizontal: 10,
  },
  button: {
    backgroundColor: '#9945FF',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 10,
    marginHorizontal: 5,
    minWidth: 90,
  },
  buttonHighlight: {
    backgroundColor: '#14F195',
  },
  buttonDisabled: {
    backgroundColor: '#444',
  },
  burstButton: {
    backgroundColor: '#FF9500',
  },
  videoButton: {
    backgroundColor: '#FF6B6B',
  },
  stopButton: {
    backgroundColor: '#666',
  },
  utilityButton: {
    backgroundColor: '#666',
  },
  resetButton: {
    backgroundColor: '#FF4444',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: 11,
  },
  web3Badge: {
    color: '#14F195',
    textAlign: 'center',
    paddingBottom: 30,
    fontSize: 10,
    fontStyle: 'italic',
  },
});
