import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEyeTracking } from '../context/EyeTrackingContext';
import { ImageSessionData, StudyImage } from '../types';
import { detectFixations, detectSaccades, calculateBCEA, detectPursuits } from '../utils/math';
import { RefreshCw, Eye, Play, Square } from 'lucide-react';
import { Modal } from '../components/Modal';
import { Button } from '../components/Button';

// Default Images (Fallback)
const DEFAULT_IMAGES: StudyImage[] = [
  { id: 'img1', url: 'https://picsum.photos/id/10/1920/1080', name: 'Forest', duration: 10000 },
  { id: 'img2', url: 'https://picsum.photos/id/20/1920/1080', name: 'Objects', duration: 10000 },
  { id: 'img3', url: 'https://picsum.photos/id/64/1920/1080', name: 'Portrait', duration: 10000 },
  { id: 'img4', url: 'https://picsum.photos/id/175/1920/1080', name: 'Clock', duration: 10000 },
  { id: 'img5', url: 'https://picsum.photos/id/237/1920/1080', name: 'Dog', duration: 10000 },
];

const Study: React.FC = () => {
  const navigate = useNavigate();
  const { startRecording, stopRecording, resetSmoothing, adjustOffset, showVideo, currentGaze, needsRecalibration } = useEyeTracking();
  
  const [images, setImages] = useState<StudyImage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBreak, setIsBreak] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const resultsRef = useRef<ImageSessionData[]>([]);
  const startTimeRef = useRef<number>(0);

  // Modal State
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'info' | 'success' | 'error' | 'confirm';
    onConfirm?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info'
  });

  const showAlert = (title: string, message: string, type: 'info' | 'success' | 'error' | 'confirm' = 'info', onConfirm?: () => void) => {
    setModalConfig({ isOpen: true, title, message, type, onConfirm });
  };

  // 1. Load configuration on mount
  useEffect(() => {
    const enterFullScreen = async () => {
        try {
            if (!document.fullscreenElement) {
                await document.documentElement.requestFullscreen();
            }
        } catch (e) {
            console.warn("Fullscreen denied", e);
        }
    };
    enterFullScreen();

    const loadConfig = () => {
        let userDuration = 10000;
        try {
            const participantStored = localStorage.getItem('participantInfo');
            if (participantStored) {
                const info = JSON.parse(participantStored);
                if (info.displayDuration) {
                    userDuration = parseInt(info.displayDuration) * 1000;
                }
            }
        } catch (e) {
            console.error("Failed to parse participant display duration", e);
        }

        try {
            const storedConfig = sessionStorage.getItem('studyConfig');
            if (storedConfig) {
                const parsed = JSON.parse(storedConfig);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    // Update durations with user preference if it was set
                    const updated = parsed.map((img: StudyImage) => ({
                        ...img,
                        duration: userDuration
                    }));
                    setImages(updated);
                    setIsLoading(false);
                    return;
                }
            }
        } catch (e) {
            console.error("Failed to load custom images", e);
        }
        
        // Fallback with user duration
        setImages(DEFAULT_IMAGES.map(img => ({ ...img, duration: userDuration })));
        setIsLoading(false);
    };

    loadConfig();
  }, []);

  // 2. Image Setup Tracking (Runs when we start playing, or when the index changes)
  useEffect(() => {
    if (isPlaying && !isBreak && !isLoading && images.length > 0 && currentIndex < images.length) {
        // Just handle tracking and start time recording here
        startTimeRef.current = Date.now();
        
        // Ensure tracking is active and smoothed state is reset for the new stimulus
        resetSmoothing();
        startRecording();
        showVideo(false);
    }
  }, [isPlaying, isBreak, isLoading, currentIndex, images]); // Dependencies ensure this runs exactly when needed

  // 3. Timer Decrement Effect
  useEffect(() => {
    if (!isPlaying || isBreak || isLoading) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 0) return 0;
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isPlaying, isBreak, isLoading]);

  // 4. Completion Monitor Effect
  useEffect(() => {
    // When time hits 0, trigger finish
    if (timeLeft === 0 && isPlaying && !isBreak && !isLoading) {
       finishImage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, isPlaying, isBreak, isLoading]); 

  const finishImage = () => {
    // Stop recording immediately
    const logs = stopRecording();
    const endTime = Date.now();
    const img = images[currentIndex];
    
    if (!img) return; // Safety check

    // Detailed analysis with improved thresholds for precision
    // 40px dispersion threshold and 120ms duration threshold
    const fixations = detectFixations(logs, 40, 120);
    const saccades = detectSaccades(fixations);
    
    const avgFixationDuration = fixations.length > 0 
      ? fixations.reduce((acc, f) => acc + f.duration, 0) / fixations.length 
      : 0;
    
    const totalPathLength = saccades.reduce((acc, s) => acc + s.amplitude, 0);
    const totalTimeMs = endTime - startTimeRef.current;

    // TTFF: Time to First Fixation
    const ttff = fixations.length > 0 && fixations[0].startTime > startTimeRef.current
      ? fixations[0].startTime - startTimeRef.current
      : 0;

    // Dwell Time: Total duration of all fixations
    const dwellTime = fixations.reduce((acc, f) => acc + f.duration, 0);

    // Calculate Avg Saccade Velocity (px/ms)
    const avgSaccadeVelocity = saccades.length > 0
        ? saccades.reduce((acc, s) => acc + s.velocity, 0) / saccades.length
        : 0;

    // Estimated Quality (Mock based on jitter for now, or actual calibration if we have it)
    // Precision: Standard deviation of gaze points during the longest fixation
    let precision = 10;
    if (fixations.length > 0) {
        const longestFix = [...fixations].sort((a,b) => b.duration - a.duration)[0];
        const fixPoints = logs.filter(l => l.timestamp >= longestFix.startTime && l.timestamp <= longestFix.endTime);
        if (fixPoints.length > 1) {
            const meanX = fixPoints.reduce((acc, p) => acc + p.x, 0) / fixPoints.length;
            const meanY = fixPoints.reduce((acc, p) => acc + p.y, 0) / fixPoints.length;
            const rms = Math.sqrt(fixPoints.reduce((acc, p) => acc + Math.pow(p.x - meanX, 2) + Math.pow(p.y - meanY, 2), 0) / fixPoints.length);
            precision = rms;
        }
    }

    // Estimate accuracy in pixels based on calibration score (0-100)
    const calibrationScoreStr = localStorage.getItem('calibrationScore');
    const calibrationScore = calibrationScoreStr ? parseInt(calibrationScoreStr) : 75;
    const estimatedAccuracyPx = Math.max(15, (100 - calibrationScore) * 1.2);

    const imageData: ImageSessionData = {
      imageId: img.id,
      imageUrl: img.url,
      startTime: startTimeRef.current,
      endTime: endTime,
      screenDimensions: { width: window.innerWidth, height: window.innerHeight },
      gazeLogs: logs,
      fixations,
      saccades,
      aois: (() => {
        if (fixations.length === 0) return [{ 
          name: "Main Area of Interest", 
          center: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
          radius: Math.min(window.innerWidth, window.innerHeight) * 0.2,
          fixationCount: 0,
          dwellTime: 0
        }];

        // Calculate weighted mean of fixations (weighted by duration)
        const totalDuration = fixations.reduce((sum, f) => sum + f.duration, 0);
        const meanX = fixations.reduce((sum, f) => sum + (f.x * f.duration), 0) / totalDuration;
        const meanY = fixations.reduce((sum, f) => sum + (f.y * f.duration), 0) / totalDuration;
        
        // Define dynamic radius based on spatial spread (BCEA approx)
        const radius = Math.min(window.innerWidth, window.innerHeight) * 0.2;

        return [{ 
          name: "Primary Focus Region", 
          center: { x: meanX, y: meanY },
          radius: radius,
          fixationCount: fixations.filter(f => {
            const dx = f.x - meanX;
            const dy = f.y - meanY;
            return Math.sqrt(dx*dx + dy*dy) < radius;
          }).length, 
          dwellTime: fixations.filter(f => {
            const dx = f.x - meanX;
            const dy = f.y - meanY;
            return Math.sqrt(dx*dx + dy*dy) < radius;
          }).reduce((a, b) => a + b.duration, 0) 
        }];
      })(),
      quality: {
        accuracy: parseFloat(estimatedAccuracyPx.toFixed(1)), 
        precision: parseFloat(precision.toFixed(1)),
        dataLoss: parseFloat(((1 - (logs.length / (totalTimeMs / 33))) * 100).toFixed(1)) 
      },
      metrics: {
        avgFixationDuration,
        saccadeCount: saccades.length,
        pursuitCount: detectPursuits(logs, fixations),
        bcea: calculateBCEA(logs),
        scanPathLength: totalPathLength,
        timeOnTargetPercent: (dwellTime / totalTimeMs) * 100,
        ttff,
        dwellTime,
        totalViewingTime: totalTimeMs,
        avgSaccadeVelocity
      }
    };

    resultsRef.current.push(imageData);

    if (currentIndex < images.length - 1) {
      // Transition to break
      setIsBreak(true);
    } else {
      // End of study
      concludeStudy();
    }
  };

  const concludeStudy = () => {
      try {
          // Try to save to session storage
          sessionStorage.setItem('studyResults', JSON.stringify(resultsRef.current));
      } catch (e) {
          console.warn("Storage quota exceeded, passing data via state only.");
      }
      // Navigate with state as fallback for large data
      navigate('/results', { state: { data: resultsRef.current } });
  };

  // 5. Break Timer Effect
  useEffect(() => {
      let timer: any;
      let adjustmentInterval: any;

      if (isBreak) {
          // Continuous refinement: adjust offset during the break while user looks at center dot
          const settlementTimeout = setTimeout(() => {
              adjustmentInterval = setInterval(() => {
                  adjustOffset(window.innerWidth / 2, window.innerHeight / 2);
              }, 400);
          }, 800);

          timer = setTimeout(() => {
              const nextIndex = currentIndex + 1;
              if (nextIndex < images.length) {
                  setTimeLeft(images[nextIndex].duration / 1000);
              }
              setCurrentIndex(nextIndex);
              setIsBreak(false);
          }, 2500);

          return () => {
              clearTimeout(settlementTimeout);
              clearInterval(adjustmentInterval);
          };
      }
      return () => {
          if (timer) clearTimeout(timer);
      };
  }, [isBreak, currentIndex, images, adjustOffset]);

  const handleStart = () => {
    if (images.length > 0) {
        setTimeLeft(images[0].duration / 1000);
    }
    setIsPlaying(true);
  };
  
  const handleRecalibrate = () => {
    showAlert(
        "Recalibrate", 
        "Recalibrating will restart the study session. Are you sure you want to continue?", 
        "confirm",
        () => navigate('/calibration')
    );
  };

  if (isLoading) {
      return <div className="min-h-screen bg-black flex items-center justify-center text-white">Loading Session...</div>;
  }

  if (!isPlaying) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white">
        <div className="text-center max-w-lg px-6">
          <h1 className="text-4xl font-bold mb-6">Study Phase</h1>
          <p className="text-lg text-gray-300 mb-8">
            You will be shown {images.length} images. 
            <br />
            Please observe each image naturally. 
            <br />
            Images will display for {images[0]?.duration / 1000 || 10} seconds each.
          </p>
          <button 
            onClick={handleStart}
            className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-full text-xl font-medium transition-all flex items-center justify-center gap-2 mx-auto"
          >
            <Play size={24} fill="currentColor" /> Start Slideshow
          </button>
        </div>
      </div>
    );
  }

  if (isBreak) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center space-y-6">
        <div className="w-8 h-8 flex items-center justify-center">
            <div className="w-4 h-4 bg-red-600 rounded-full animate-pulse shadow-[0_0_10px_rgba(220,38,38,0.8)]"></div>
        </div>
        <div className="text-center">
            <p className="text-gray-300 text-lg">Please look at the centre red dot</p>
            <p className="text-gray-500 text-sm mt-2">Until the next image loads...</p>
        </div>
        
        {/* Emergency Recalibration Option */}
        <button 
            onClick={handleRecalibrate}
            className="text-gray-600 hover:text-white text-xs flex items-center gap-2 transition-colors mt-12"
        >
            <RefreshCw size={12} /> Tracking drifting? Recalibrate
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden cursor-none select-none flex items-center justify-center">
      {images[currentIndex] && (
          <img 
            src={images[currentIndex].url} 
            alt="Study Stimulus" 
            className="w-full h-full object-contain pointer-events-none" 
            id="stimulus-image"
          />
      )}
      
      {/* Real-time Gaze Indicator (Observer View) */}
      {currentGaze && (
        <div 
            className="fixed z-50 pointer-events-none"
            style={{
                left: currentGaze.x,
                top: currentGaze.y,
                transform: 'translate(-50%, -50%)',
                // Explicitly disable CSS transition to avoid artificial lag
                transition: 'none'
            }}
        >
            <div className="relative flex items-center justify-center">
                <div className="w-4 h-4 bg-red-500 rounded-full shadow-[0_0_8px_rgba(255,0,0,0.8)] z-10"></div>
                <div className="absolute w-10 h-10 border-2 border-red-500/50 rounded-full animate-pulse"></div>
                <div className="absolute w-16 h-[1px] bg-red-500/30"></div>
                <div className="absolute h-16 w-[1px] bg-red-500/30"></div>
            </div>
        </div>
      )}
      
      {/* Task: Add Stop Button to interrupt study */}
      <div className="absolute top-4 right-4 z-50">
        <Button 
          variant="outline" 
          onClick={() => {
            showAlert(
              "Stop Assessment?", 
              "Are you sure you want to end the assessment now? Data from the images seen so far will be saved.", 
              "confirm",
              () => concludeStudy()
            );
          }}
          className="bg-white/80 backdrop-blur border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 font-bold px-4 py-2 flex items-center gap-2 pointer-events-auto cursor-pointer"
        >
          <Square className="w-4 h-4 fill-current" />
          Stop Assessment
        </Button>
      </div>

      {/* Progress Overlay */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gray-800 z-10">
        <div 
          className="h-full bg-blue-500 transition-all duration-1000 ease-linear"
          style={{ width: `${((currentIndex + 1) / images.length) * 100}%` }}
        />
      </div>

      {/* Recalibration Warning */}
      {needsRecalibration && (
        <div className="absolute top-10 left-1/2 -translate-x-1/2 z-50 bg-red-600/90 text-white px-6 py-3 rounded-xl border border-red-400 shadow-2xl animate-bounce flex items-center gap-3">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <div className="text-left">
             <div className="font-bold text-sm">Low Tracking Accuracy</div>
             <p className="text-[10px] opacity-80">Face lost or tracking drift detected. Please keep head still.</p>
          </div>
        </div>
      )}
      
      {/* Image Timer */}
      <div className="absolute bottom-4 right-4 text-gray-500/50 text-xs font-mono z-10">
         Img {currentIndex + 1}/{images.length} | {timeLeft}s
      </div>
      
      {/* Manual Finish (Hidden fallback for debugging/stuck state) */}
      <div className="absolute top-4 left-4 z-50 opacity-0 hover:opacity-100 transition-opacity">
          <button onClick={finishImage} className="text-xs text-gray-600 bg-white/10 p-2 rounded">Skip</button>
      </div>

      <Modal
          isOpen={modalConfig.isOpen}
          onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
          title={modalConfig.title}
          message={modalConfig.message}
          type={modalConfig.type}
          onConfirm={modalConfig.onConfirm}
        />
    </div>
  );
};

export default Study;