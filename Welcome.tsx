import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { Eye, Brain, Activity, ShieldCheck, AlertTriangle, RefreshCw } from 'lucide-react';
import { useEyeTracking } from '../context/EyeTrackingContext';

const Welcome: React.FC = () => {
  const navigate = useNavigate();
  const { isInitialized, initError: contextError } = useEyeTracking();
  const [initError, setInitError] = React.useState<string | null>(null);
  const [participantInfo, setParticipantInfo] = React.useState({
    id: `P-${Math.floor(1000 + Math.random() * 9000)}`,
    age: '',
    condition: 'Neurological Screening',
    displayDuration: '10'
  });

  React.useEffect(() => {
    if (contextError) setInitError(contextError);
  }, [contextError]);

  const handleStart = () => {
    localStorage.setItem('participantInfo', JSON.stringify(participantInfo));
    navigate('/upload');
  };

  const handleReload = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
      <div className="max-w-3xl w-full bg-white rounded-2xl shadow-xl p-10 space-y-8">
        <div className="text-center space-y-4">
          <div className="bg-blue-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Eye className="w-10 h-10 text-blue-600" />
          </div>
          <h1 className="text-4xl font-bold text-slate-900">NeuroGaze Assessment</h1>
          <p className="text-lg text-slate-600 max-w-xl mx-auto">
            A browser-based eye-tracking system for early detection of neurodegenerative markers and attention patterns.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 border border-slate-100 rounded-xl bg-slate-50">
            <Brain className="w-8 h-8 text-indigo-500 mb-4" />
            <h3 className="font-semibold text-slate-900 mb-2">Cognitive Load</h3>
            <p className="text-sm text-slate-600">Analyzes fixation duration and dispersion to estimate cognitive effort.</p>
          </div>
          <div className="p-6 border border-slate-100 rounded-xl bg-slate-50">
            <Activity className="w-8 h-8 text-emerald-500 mb-4" />
            <h3 className="font-semibold text-slate-900 mb-2">Saccade Dynamics</h3>
            <p className="text-sm text-slate-600">Measures velocity and latency of eye movements between targets.</p>
          </div>
          <div className="p-6 border border-slate-100 rounded-xl bg-slate-50">
            <ShieldCheck className="w-8 h-8 text-rose-500 mb-4" />
            <h3 className="font-semibold text-slate-900 mb-2">Non-Invasive</h3>
            <p className="text-sm text-slate-600">Uses your standard webcam. No images are stored on a server.</p>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-8">
           {initError ? (
             <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-md mx-auto text-center">
               <div className="flex items-center justify-center text-red-600 mb-2">
                 <AlertTriangle className="w-6 h-6 mr-2" />
                 <span className="font-bold">Camera Error</span>
               </div>
               <p className="text-sm text-red-700 mb-4">{initError}</p>
               <Button onClick={handleReload} variant="outline" className="text-red-600 border-red-200 hover:bg-red-50">
                 <RefreshCw className="w-4 h-4 mr-2" /> Retry
               </Button>
             </div>
           ) : isInitialized ? (
            <div className="grid grid-cols-1 md:grid-cols-[1fr_1.2fr] gap-8 items-start">
               <div className="space-y-4">
                  <h4 className="font-bold text-slate-900 border-b border-slate-100 pb-2">Instructions</h4>
                  <ol className="text-sm text-slate-600 space-y-3 list-decimal pl-5">
                      <li>Ensure you are in a well-lit room.</li>
                      <li>Position your head in the center of the camera view.</li>
                      <li>Select your assessment images (or use defaults).</li>
                      <li>Complete the 9-point calibration carefully.</li>
                  </ol>
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                    <p className="text-[11px] text-blue-700 leading-relaxed font-medium">
                      <strong>Tip:</strong> Keep your head still during the assessment for the most accurate results.
                    </p>
                  </div>
               </div>

               <div className="flex flex-col items-center space-y-6">
                 <div className="w-full bg-slate-50 p-6 rounded-xl border border-slate-100 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1 text-left">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Participant ID</label>
                        <input 
                          type="text" 
                          value={participantInfo.id}
                          onChange={(e) => setParticipantInfo(prev => ({ ...prev, id: e.target.value }))}
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 font-medium"
                        />
                      </div>
                      <div className="space-y-1 text-left">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Age</label>
                        <input 
                          type="number" 
                          placeholder="e.g. 28"
                          value={participantInfo.age}
                          onChange={(e) => setParticipantInfo(prev => ({ ...prev, age: e.target.value }))}
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 font-medium"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-[1fr_2fr] gap-4">
                      <div className="space-y-1 text-left">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Show Time (sec)</label>
                        <input 
                          type="number" 
                          value={participantInfo.displayDuration}
                          onChange={(e) => setParticipantInfo(prev => ({ ...prev, displayDuration: e.target.value }))}
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 font-medium"
                        />
                      </div>
                      <div className="space-y-1 text-left">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Clinical Condition</label>
                        <select 
                          value={participantInfo.condition}
                          onChange={(e) => setParticipantInfo(prev => ({ ...prev, condition: e.target.value }))}
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 font-medium"
                        >
                          <option>Neurological Screening</option>
                          <option>Post-Concussion Baseline</option>
                          <option>Early Mild Cognitive Impairment</option>
                          <option>Attention Deficit Profile</option>
                          <option>Stroke Recovery Monitoring</option>
                          <option>Healthy Participant</option>
                        </select>
                      </div>
                    </div>
                 </div>
  
                 <Button onClick={handleStart} className="w-full px-12 py-3 text-lg font-bold shadow-lg shadow-blue-200">
                   Begin Assessment
                 </Button>
                
                 <div className="flex flex-nowrap items-center justify-center gap-2 w-full">
                   <Button onClick={() => navigate('/upload')} variant="outline" className="flex-1 px-2 py-1.5 text-[11px] whitespace-nowrap">
                     Manage Images
                   </Button>
                   <Button onClick={() => navigate('/calibration')} variant="outline" className="flex-1 px-2 py-1.5 text-[11px] whitespace-nowrap">
                     Calibration
                   </Button>
                   <Button onClick={() => navigate('/results')} variant="outline" className="flex-1 px-2 py-1.5 text-[11px] text-slate-400 whitespace-nowrap">
                     Results
                   </Button>
                 </div>
               </div>
            </div>
           ) : (
             <div className="flex flex-col items-center justify-center space-y-4 py-12">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                <p className="text-slate-500 font-medium tracking-wide">Initializing tracking engine...</p>
             </div>
           )}
           
           <p className="mt-10 text-center text-[10px] text-slate-400 uppercase tracking-widest">
             By continuing, you grant camera access for real-time gaze processing.
           </p>
        </div>
      </div>
    </div>
  );
};

export default Welcome;