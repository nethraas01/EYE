import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEyeTracking } from '../context/EyeTrackingContext';
import { CalibrationPoint } from '../types';
import { CheckCircle, Target, RefreshCw, AlertCircle } from 'lucide-react';

  // Improved grid positions: Moved to 10%/90% to cover more screen area
  // This helps with "full screen" accuracy
  const CALIBRATION_POINTS: CalibrationPoint[] = [
    { id: 1, x: '10%', y: '10%', label: 'Top Left' },
    { id: 2, x: '50%', y: '10%', label: 'Top Center' },
    { id: 3, x: '90%', y: '10%', label: 'Top Right' },
    { id: 4, x: '10%', y: '50%', label: 'Middle Left' },
    { id: 5, x: '50%', y: '50%', label: 'Center' },
    { id: 6, x: '90%', y: '50%', label: 'Middle Right' },
    { id: 7, x: '10%', y: '90%', label: 'Bottom Left' },
    { id: 8, x: '50%', y: '90%', label: 'Bottom Center' },
    { id: 9, x: '90%', y: '90%', label: 'Bottom Right' },
  ];

  const CLICKS_TO_ADVANCE = 7;

  const Calibration: React.FC = () => {
    const navigate = useNavigate();
    const { startCalibration, stopCalibration, currentGaze } = useEyeTracking();
    const [currentPointIndex, setCurrentPointIndex] = useState(0);
    const [clicksPerPoint, setClicksPerPoint] = useState(0);
    const [isComplete, setIsComplete] = useState(false);
    const [isValidating, setIsValidating] = useState(false);
    const [accuracy, setAccuracy] = useState<number>(0);
    
    // State to control sample collection
    const [isCollectingSamples, setIsCollectingSamples] = useState(false);
    const validationSamples = useRef<Array<{dist: number, dx: number, dy: number}>>([]);
    
    // Ref to prevent double-triggers during transitions
    const isTransitioning = useRef(false);

    useEffect(() => {
      // Request full screen for better accuracy
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

      // Start fresh
      startCalibration();
      
      // Clean up when leaving
      return () => {
        stopCalibration();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

  // Sample Collection Hook
  // Collects gaze data when the validation phase is active
  useEffect(() => {
    if (isCollectingSamples && currentGaze) {
       const centerX = window.innerWidth / 2;
       const centerY = window.innerHeight / 2;
       const dx = currentGaze.x - centerX;
       const dy = currentGaze.y - centerY;
       const dist = Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));
       
       // Record sample for validation
       validationSamples.current.push({ dist, dx, dy });
    }
  }, [currentGaze, isCollectingSamples]);

  const performValidation = async () => {
    setIsValidating(true);
    setClicksPerPoint(0); // Reset UI

    // Show the prediction points momentarily so user can see their gaze
    // Also ensure webgazer is definitely running and looking for faces
    if (window.webgazer) {
       window.webgazer.showPredictionPoints(true);
       if (window.webgazer.resume) window.webgazer.resume();
    }

    // 1. Wait for eyes to settle on the center (1.2 seconds)
    // This gives the Kalman filter time to settle on the new fixation point
    await new Promise(resolve => setTimeout(resolve, 1200));

    // 2. Start Collecting Data
    validationSamples.current = [];
    setIsCollectingSamples(true);

    // 3. Collect samples for 3 seconds (slightly longer for better averaging)
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 4. Stop Collecting
    setIsCollectingSamples(false);
    if (window.webgazer) window.webgazer.showPredictionPoints(false);

    // 5. Calculate Score
    const samples = validationSamples.current;
    let score = 0;
    let avgDist = 0;
    let meanDx = 0;
    let meanDy = 0;
    
    if (samples.length >= 2) { 
        // Simple Average if few samples, Median if many
        let effectiveDist = 0;
        if (samples.length >= 5) {
            const distances = samples.map(s => s.dist);
            distances.sort((a, b) => a - b);
            effectiveDist = distances[Math.floor(distances.length / 2)];
        } else {
            effectiveDist = samples.reduce((acc, s) => acc + s.dist, 0) / samples.length;
        }
        
        avgDist = effectiveDist;
        meanDx = samples.reduce((acc, s) => acc + s.dx, 0) / samples.length;
        meanDy = samples.reduce((acc, s) => acc + s.dy, 0) / samples.length;

        // More lenient scoring: 8 pixels per 1% drop
        const rawScore = 100 - (effectiveDist / 8); 
        score = Math.max(0, Math.min(100, rawScore));
    } else {
        console.warn("Insufficient validation samples:", samples.length);
        score = 0;
    }

    setAccuracy(Math.round(score));
    
    // Save detailed quality metrics for the Study/Results phase
    const qualityMetrics = {
        score: Math.round(score),
        offset: Math.round(avgDist),
        offsetX: Math.round(meanDx),
        offsetY: Math.round(meanDy),
        timestamp: Date.now(),
        samples: samples.length
    };
    localStorage.setItem('calibrationMetrics', JSON.stringify(qualityMetrics));

    setIsValidating(false);
    setIsComplete(true);
  };

  // Watch for completion of a point (5 clicks)
  useEffect(() => {
    if (clicksPerPoint >= CLICKS_TO_ADVANCE && !isTransitioning.current) {
      isTransitioning.current = true;
      
      const timer = setTimeout(() => {
        if (currentPointIndex < CALIBRATION_POINTS.length - 1) {
          setCurrentPointIndex(prev => prev + 1);
          setClicksPerPoint(0);
          isTransitioning.current = false;
        } else {
          // Start validation phase instead of finishing immediately
          performValidation();
        }
      }, 300);
      
      return () => clearTimeout(timer);
    }
  }, [clicksPerPoint, currentPointIndex]);

  const handlePointClick = (e: React.MouseEvent) => {
    // Explicitly record the calibration point in WebGazer to ensure accuracy
    if (window.webgazer) {
        window.webgazer.recordScreenPosition(e.clientX, e.clientY, 'click');
        
        // Task 1: Weighted Calibration (Center Priority)
        // If this is the center point (Point 5, Index 4), record it twice per click 
        // to give it more weight in the regression model
        if (currentPointIndex === 4) {
            window.webgazer.recordScreenPosition(e.clientX, e.clientY, 'click');
            console.log("Applied center priority weight");
        }
    }
    
    // Use functional update to reliably increment
    setClicksPerPoint(prev => {
        if (prev >= CLICKS_TO_ADVANCE) return prev;
        return prev + 1;
    });
  };

  const handleRetry = () => {
    setIsComplete(false);
    setAccuracy(0);
    setCurrentPointIndex(0);
    setClicksPerPoint(0);
    isTransitioning.current = false;
    validationSamples.current = [];
    // Re-trigger start to clear data
    startCalibration();
  };

  const handleFinish = () => {
    stopCalibration();
    if (window.webgazer) {
      window.webgazer.showPredictionPoints(false); 
      window.webgazer.showVideo(false);
    }
    
    // Save accuracy to localStorage for Results page
    localStorage.setItem('calibrationScore', accuracy.toString());
    
    navigate('/study');
  };

  if (isComplete) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white">
        <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl text-center max-w-md animate-fade-in border border-slate-700">
          {accuracy > 60 ? (
              <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-6" />
          ) : (
              <AlertCircle className="w-20 h-20 text-yellow-500 mx-auto mb-6" />
          )}
          
          <h2 className="text-3xl font-bold mb-4">Calibration Complete</h2>
          
          <div className={`bg-slate-700/50 rounded-xl p-4 mb-6 border ${accuracy > 60 ? 'border-green-500/30' : 'border-yellow-500/30'}`}>
             <p className="text-slate-400 text-sm uppercase tracking-wider font-bold mb-1">Calibration Score</p>
             <div className="flex items-center justify-center gap-2">
                 <span className={`text-5xl font-extrabold ${accuracy > 80 ? 'text-green-400' : accuracy > 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {accuracy}%
                 </span>
             </div>
             <p className="text-xs text-slate-400 mt-3 px-2">
               {accuracy > 80 ? "Excellent. Tracking is precise." : accuracy > 60 ? "Good. Tracking is acceptable." : "Poor accuracy. See tips below."}
             </p>
          </div>

          {accuracy < 70 && (
            <div className="text-left mb-6 bg-slate-900/50 p-4 rounded-xl border border-slate-700">
               <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center">
                 <AlertCircle size={14} className="mr-2 text-yellow-500" /> Improvement Tips
               </h3>
               <ul className="text-[11px] text-slate-300 space-y-2 list-disc pl-4">
                 <li><strong>Don't "Chase" the Dot:</strong> Look at the circle first, then click. Clicking while your eyes are moving reduces accuracy.</li>
                 <li><strong>Click Speed:</strong> Moderate, consistent clicks are best. Very slow clicks can record involuntary eye drift.</li>
                 <li><strong>Lighting:</strong> Ensure your face is evenly lit. Shadows on your eyes can confuse the camera.</li>
                 <li><strong>Head Movement:</strong> Keep your head completely still once calibration starts.</li>
               </ul>
            </div>
          )}

          <div className="space-y-3">
            <button 
                onClick={handleFinish}
                disabled={accuracy < 40}
                className={`w-full font-bold py-3 px-6 rounded-lg transition-all shadow-lg ${accuracy < 40 ? 'bg-slate-600 cursor-not-allowed opacity-50' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/30 text-white'}`}
            >
                {accuracy < 40 ? "Score too low" : "Begin Assessment"}
            </button>
            
            <button 
                onClick={handleRetry}
                className="w-full bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
                <RefreshCw size={18} /> Recalibrate
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen bg-slate-950 overflow-hidden cursor-crosshair">
      {/* Instruction Overlay - Top Center */}
      <div className="absolute top-4 left-0 right-0 flex flex-col items-center pointer-events-none z-20">
        <div className="bg-slate-900/90 backdrop-blur text-white px-8 py-4 rounded-2xl text-center border border-slate-700 shadow-xl mb-4">
           {isValidating ? (
               <span className="flex items-center justify-center text-blue-300 text-lg">
                   <Target className="w-5 h-5 mr-3 animate-spin-slow"/> 
                   Validating... Please look steadily at the Red Center Dot.
               </span>
           ) : (
               <div className="space-y-1">
                   <div className="text-lg font-semibold text-white">
                        Point {currentPointIndex + 1} of 9
                   </div>
                   <div className="text-slate-400 text-sm">
                        Look at the circle and click it {CLICKS_TO_ADVANCE} times.
                   </div>
                   <div className="text-yellow-400 text-xs font-bold uppercase tracking-wide mt-2 pt-2 border-t border-slate-700">
                        ⚠ Important: Keep your head still
                   </div>
               </div>
           )}
        </div>
      </div>

      {/* Validation Point (Center) - Only shown during validation */}
      {isValidating && (
          <div 
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-red-500 rounded-full border-2 border-white shadow-[0_0_20px_rgba(239,68,68,0.6)] z-50"
          />
      )}

      {/* Calibration Points */}
      {!isValidating && CALIBRATION_POINTS.map((point, index) => {
        const isActive = index === currentPointIndex;
        if (!isActive) return null;

        // Calculate opacity/scale based on clicks
        const fillScale = 1 + (clicksPerPoint * 0.3); 

        return (
          <button
            key={point.id}
            onClick={handlePointClick}
            disabled={clicksPerPoint >= CLICKS_TO_ADVANCE}
            style={{
              position: 'absolute',
              left: point.x,
              top: point.y,
              transform: 'translate(-50%, -50%)',
            }}
            // Z-index 50 ensures it sits above the video (z-index 10)
            className="group focus:outline-none z-50"
          >
            <span className="relative flex h-16 w-16">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-30"></span>
              <span className="relative inline-flex rounded-full h-16 w-16 bg-blue-600 items-center justify-center border-4 border-white shadow-[0_0_30px_rgba(37,99,235,0.5)] transition-transform active:scale-95">
                 {/* Target Crosshair */}
                 <div className="absolute w-full h-[1px] bg-blue-400/50"></div>
                 <div className="absolute h-full w-[1px] bg-blue-400/50"></div>
                 
                 {/* Inner dot fills up as you click */}
                 <span 
                    className="bg-white rounded-full transition-all duration-300 relative z-10 shadow-inner"
                    style={{ 
                        width: '10px', 
                        height: '10px',
                        transform: `scale(${fillScale})` 
                    }}
                 ></span>
              </span>
            </span>
            <div className="absolute mt-5 left-1/2 -translate-x-1/2 text-sm text-blue-200 font-mono font-bold pointer-events-none whitespace-nowrap">
              {clicksPerPoint}/{CLICKS_TO_ADVANCE}
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default Calibration;