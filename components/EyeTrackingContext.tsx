import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { GazePoint } from '../types';
import { smoothGaze, GazeKalmanFilter } from '../utils/math';

interface EyeTrackingContextType {
  isInitialized: boolean;
  initError: string | null;
  isCalibrating: boolean;
  isRecording: boolean;
  currentGaze: GazePoint | null;
  needsRecalibration: boolean;
  startCalibration: () => void;
  stopCalibration: () => void;
  startRecording: () => void;
  stopRecording: () => Array<GazePoint>;
  resetSmoothing: () => void;
  adjustOffset: (targetX: number, targetY: number) => void;
  showVideo: (show: boolean) => void;
  clearData: () => void;
}

const EyeTrackingContext = createContext<EyeTrackingContextType>({} as EyeTrackingContextType);

export const useEyeTracking = () => useContext(EyeTrackingContext);

export const EyeTrackingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [currentGaze, setCurrentGaze] = useState<GazePoint | null>(null);
  const [needsRecalibration, setNeedsRecalibration] = useState(false);
  
  // We keep a history for smoothing
  const gazeHistory = useRef<GazePoint[]>([]);
  // We keep the full recording log here
  const sessionLog = useRef<GazePoint[]>([]);
  // Prevent double init in Strict Mode
  const initAttempted = useRef(false);
  // Kalman Filter for noise reduction
  const kalmanFilter = useRef(new GazeKalmanFilter(0.05, 0.4)); // More responsive (0.05)
  
  // Calibration metrics ref for fast access in listener
  const calibrationMetrics = useRef<{offsetX: number, offsetY: number} | null>(null);
  
  // Accuracy monitoring variables
  const faceLostStartTime = useRef<number | null>(null);

  // Use refs for listener to avoid effect re-runs
  const isRecordingRef = useRef(false);
  const isCalibratingRef = useRef(false);
  const needsRecalibrationRef = useRef(false);

  useEffect(() => {
    isRecordingRef.current = isRecording;
    isCalibratingRef.current = isCalibrating;
    needsRecalibrationRef.current = needsRecalibration;
  }, [isRecording, isCalibrating, needsRecalibration]);

  useEffect(() => {
    const initWebGazer = async () => {
      if (initAttempted.current) return;
      initAttempted.current = true;

      if (!window.webgazer) {
        // Try to load it dynamically if not present
        try {
            console.log("WebGazer not found, attempting dynamic load...");
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/webgazer@3.3.0/dist/webgazer.js';
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
            // Wait a bit for execution
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (e) {
            console.warn("Primary WebGazer source failed, trying fallback...", e);
        }

        if (!window.webgazer) {
            setInitError("WebGazer library not found. Please check your internet connection and refresh.");
            return;
        }
      }

      // Check for localforage which is a dependency
      if (!window.localforage) {
          console.warn("localforage not found, waiting...");
          await new Promise(resolve => setTimeout(resolve, 1000));
      }

      try {
        const wg = window.webgazer;
        if (!wg) throw new Error("WebGazer not found on window");

        // 1. Initial Config
        // Clear any old data from localforage immediately
        if (typeof wg.clearData === 'function') {
            await wg.clearData();
            console.log("WebGazer data cleared for fresh session");
        }

        if (typeof wg.setGazeListener === 'function') {
            wg.setGazeListener((data: any, clock: number) => {
                if (data && data.x !== null && data.y !== null && !isNaN(data.x) && !isNaN(data.y)) {
                    // Face found, reset lost timer
                    faceLostStartTime.current = null;
                    if (needsRecalibrationRef.current) setNeedsRecalibration(false);

                    let x = data.x;
                    let y = data.y;
                    
                    // 0. Coordinate Correction: Apply Calibration-based offset
                    // SKIP correction if we are currently calibrating or validating
                    if (!isCalibratingRef.current && calibrationMetrics.current) {
                       x -= calibrationMetrics.current.offsetX;
                       y -= calibrationMetrics.current.offsetY;
                    }

                    // 1. Edge Case Handling: Edge Bias Correction
                    const edgeThresh = 80;
                    if (x < edgeThresh) x -= (edgeThresh - x) * 0.1;
                    if (x > window.innerWidth - edgeThresh) x += (x - (window.innerWidth - edgeThresh)) * 0.1;
                    if (y < edgeThresh) y -= (edgeThresh - y) * 0.1;
                    if (y > window.innerHeight - edgeThresh) y += (y - (window.innerHeight - edgeThresh)) * 0.1;

                    // 2. Clamping to valid bounds
                    x = Math.max(0, Math.min(window.innerWidth, x));
                    y = Math.max(0, Math.min(window.innerHeight, y));

                    const rawPoint: GazePoint = { x, y, timestamp: Date.now() };

                    // Basic Outlier Filtering
                    if (data.x < -400 || data.x > window.innerWidth + 400 || 
                        data.y < -400 || data.y > window.innerHeight + 400) {
                        return; 
                    }
                    
                    // 3. Noise Reduction: Apply Kalman Filtering
                    const kalmanSmoothed = kalmanFilter.current.apply(rawPoint);
                    
                    gazeHistory.current.push(kalmanSmoothed);
                    if (gazeHistory.current.length > 10) gazeHistory.current.shift();
                    
                    // 4. Secondary Weighted Smoothing for UI stability
                    const finalSmoothed = smoothGaze(gazeHistory.current) || kalmanSmoothed;

                    setCurrentGaze(finalSmoothed);

                    if (isRecordingRef.current) {
                      const lastLog = sessionLog.current[sessionLog.current.length - 1];
                      if (!lastLog || kalmanSmoothed.timestamp - lastLog.timestamp > 15) {
                         sessionLog.current.push(kalmanSmoothed);
                      }
                    }
                } else {
                    // Face possibly lost
                    if (!faceLostStartTime.current) faceLostStartTime.current = Date.now();
                    if (Date.now() - faceLostStartTime.current > 4000) {
                        setNeedsRecalibration(true);
                    }
                }
            });
        }

        // 2. Start WebGazer
        // WebGazer sometimes has an isReady method, or we check if it's running
        if (typeof wg.begin === 'function') {
            await wg.begin();
            // Remove default listeners immediately to prevent double training/drift
            // We handle calibration clicks manually in Calibration.tsx
            if (wg.removeMouseEventListeners) wg.removeMouseEventListeners();
            // Small delay to ensure internal state is ready
            await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
            throw new Error("wg.begin is not a function");
        }

        // 3. Configure UI and Settings (Defensive)
        try {
            if (typeof wg.showVideo === 'function') wg.showVideo(false);
            if (typeof wg.showFaceOverlay === 'function') wg.showFaceOverlay(false);
            if (typeof wg.showPredictionPoints === 'function') wg.showPredictionPoints(false);
            
            if (typeof wg.setRegression === 'function') wg.setRegression('ridge');
            if (typeof wg.saveDataAcrossSessions === 'function') wg.saveDataAcrossSessions(false);

            // Load initial metrics
            const metricsStr = localStorage.getItem('calibrationMetrics');
            if (metricsStr) {
                const metrics = JSON.parse(metricsStr);
                calibrationMetrics.current = { 
                    offsetX: metrics.offsetX || 0, 
                    offsetY: metrics.offsetY || 0 
                };
            }

            const vid = document.getElementById('webgazerVideoContainer');
            if (vid) vid.style.display = 'none';
        } catch (e) {
            console.warn("Post-begin config failed", e);
        }

        setIsInitialized(true);
      } catch (e: any) {
        console.error("Failed to init webgazer", e);
        initAttempted.current = false; 
        setInitError(`Failed to start eye tracker: ${e.message || "Unknown error"}`);
      }
    };
    
    // Run initialization
    initWebGazer();

    return () => {
       // We don't strictly end webgazer here because navigation preserves the context
       // but if the component unmounts completely, we might want to pause.
       // window.webgazer.pause(); 
    };
  }, []);

  const startCalibration = () => {
    // Crucial: Clear old data and metrics so we don't train on top of bad models or apply old offsets
    if (window.webgazer && window.webgazer.clearData) {
        window.webgazer.clearData();
    }
    localStorage.removeItem('calibrationMetrics');
    localStorage.removeItem('calibrationScore');
    calibrationMetrics.current = null; // Clear old offset ref
    
    kalmanFilter.current.reset(); // Reset filter for new session
    setIsCalibrating(true);
    setNeedsRecalibration(false);
    showVideo(true);
  };

  const stopCalibration = () => {
    setIsCalibrating(false);
    showVideo(false);
    
    // Update metrics ref immediately from localStorage
    try {
        const metricsStr = localStorage.getItem('calibrationMetrics');
        if (metricsStr) {
            const metrics = JSON.parse(metricsStr);
            calibrationMetrics.current = { 
                offsetX: metrics.offsetX || 0, 
                offsetY: metrics.offsetY || 0 
            };
        }

        // Disable automatic training after calibration is complete
        // This prevents accuracy drift from random clicks during the study
        if (window.webgazer && window.webgazer.removeMouseEventListeners) {
            window.webgazer.removeMouseEventListeners();
            console.log("WebGazer mouse listeners removed to prevent drift");
        }
    } catch (e) {
        console.error("Failed to update calibration metrics ref", e);
    }
  };

  const startRecording = () => {
    sessionLog.current = [];
    setIsRecording(true);
  };

  const stopRecording = () => {
    setIsRecording(false);
    return [...sessionLog.current];
  };

  const resetSmoothing = () => {
    kalmanFilter.current.reset();
    gazeHistory.current = [];
  };

  const adjustOffset = (targetX: number, targetY: number) => {
    if (!currentGaze) return;
    
    // We calculate what the NEW offset should be to make currentGaze match targetX/Y
    // currentGaze is ALREADY corrected by the old offset if it exists.
    // So we need to calculate the RAW gaze first or just add the delta.
    
    // Simple approach: calculate delta between target and current (corrected) gaze
    const dx = currentGaze.x - targetX;
    const dy = currentGaze.y - targetY;
    
    // Update ref with partial adjustment (lerp for stability)
    if (calibrationMetrics.current) {
        calibrationMetrics.current.offsetX += dx * 0.5;
        calibrationMetrics.current.offsetY += dy * 0.5;
    } else {
        calibrationMetrics.current = { offsetX: dx, offsetY: dy };
    }
    
    console.log("Gaze offset adjusted:", calibrationMetrics.current);
  };

  const showVideo = (show: boolean) => {
    const vid = document.getElementById('webgazerVideoContainer');
    if (vid) vid.style.display = show ? 'block' : 'none';
    
    if (window.webgazer) {
        window.webgazer.showVideo(show);
        window.webgazer.showFaceOverlay(show);
        window.webgazer.showPredictionPoints(show);
    }
  };

  const clearData = () => {
    sessionLog.current = [];
  };

  return (
    <EyeTrackingContext.Provider value={{
      isInitialized,
      initError,
      isCalibrating,
      isRecording,
      currentGaze,
      needsRecalibration,
      startCalibration,
      stopCalibration,
      startRecording,
      stopRecording,
      resetSmoothing,
      adjustOffset,
      showVideo,
      clearData
    }}>
      {children}
    </EyeTrackingContext.Provider>
  );
};
