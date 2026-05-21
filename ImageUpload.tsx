import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Upload, X, Image as ImageIcon, ArrowRight, PlayCircle, GripVertical } from 'lucide-react';
import { StudyImage } from '../types';
import { Reorder } from 'framer-motion';

const DEFAULT_DURATION = 10000; // 10 seconds per image

const ImageUpload: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<StudyImage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [fetchFolder, setFetchFolder] = useState('');
  const [availableFolders, setAvailableFolders] = useState<string[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);

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

  const [cloudStatus, setCloudStatus] = useState<'checking' | 'connected' | 'error' | 'unconfigured'>('checking');

  // Check connection on mount
  React.useEffect(() => {
    const checkConn = async () => {
      try {
        const cloudResp = await fetch('/api/test-cloudinary');
        const cloudData = await cloudResp.json();
        if (cloudData.status === 'connected') {
          setCloudStatus('connected');
        } else if (cloudData.message?.includes('Missing Cloudinary configuration')) {
          setCloudStatus('unconfigured');
        } else {
          setCloudStatus('error');
        }
      } catch (e) {
        setCloudStatus('error');
      }
    };
    checkConn();
  }, []);

  // Fetch available folders on mount
  React.useEffect(() => {
    const fetchFolders = async () => {
      if (cloudStatus !== 'connected') return;
      setIsLoadingFolders(true);
      try {
        const response = await fetch('/api/cloudinary-folders');
        const data = await response.json();
        if (data.folders) {
          setAvailableFolders(data.folders.map((f: any) => f.name));
          // Set default if available
          if (data.folders.length > 0 && !fetchFolder) {
            setFetchFolder(data.folders[0].name);
          }
        }
      } catch (err) {
        console.error('Error fetching folders:', err);
      } finally {
        setIsLoadingFolders(false);
      }
    };
    fetchFolders();
  }, [cloudStatus]);

  const showAlert = (title: string, message: string, type: 'info' | 'success' | 'error' | 'confirm' = 'info', onConfirm?: () => void) => {
    setModalConfig({ isOpen: true, title, message, type, onConfirm });
  };

  const handleTestConnection = async () => {
    setIsFetching(true);
    setCloudStatus('checking');
    try {
      // 1. Test Server API
      const response = await fetch('/api/health');
      const data = await response.json();
      
      // 2. Test Cloudinary via Server
      const cloudResp = await fetch('/api/test-cloudinary');
      const cloudData = await cloudResp.json();
      
      const configInfo = data.config ? 
        `Cloud Name: ${data.config.cloudName}\nAPI Key: ${data.config.apiKey}\nAPI Secret: ${data.config.apiSecret}` :
        'No config info available';

      if (cloudData.status === 'connected') setCloudStatus('connected');
      else if (cloudData.message?.includes('Missing')) setCloudStatus('unconfigured');
      else setCloudStatus('error');

      showAlert(
        "Connection Diagnostics", 
        `API Status: ${data.status}\nEnvironment: ${data.environment}\n\n[Server Config]\n${configInfo}\n\n[Cloudinary Test]\nResult: ${cloudData.status}\nDetails: ${cloudData.message || cloudData.details || 'N/A'}`,
        cloudData.status === 'connected' ? 'success' : 'error'
      );
    } catch (err: any) {
      setCloudStatus('error');
      showAlert("Connection Failed", `Connection failed entirely: ${err.message}`, 'error');
    } finally {
      setIsFetching(false);
    }
  };

  const handleFetchFromCloudinary = async () => {
    if (!fetchFolder) return;
    setIsFetching(true);
    try {
      const response = await fetch(`/api/cloudinary-images?folder=${encodeURIComponent(fetchFolder)}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.details || data.error || 'Failed to fetch from Cloudinary');
      }
      
      if (data.images && data.images.length > 0) {
        const cloudImages: StudyImage[] = data.images.map((img: any, i: number) => ({
          id: img.public_id || `cloud-${Date.now()}-${i}`,
          url: img.secure_url,
          name: img.filename || `Image ${i+1}`,
          duration: DEFAULT_DURATION
        }));
        setImages(prev => [...prev, ...cloudImages]);
        showAlert("Success", `Loaded ${cloudImages.length} images from folder "${fetchFolder}".`, 'success');
      } else {
        showAlert("No Images", `No images were found in folder "${fetchFolder}".`, 'info');
      }
    } catch (err: any) {
      console.error(err);
      showAlert("Fetch Error", `Error fetching images from Cloudinary: ${err.message}`, 'error');
    } finally {
      setIsFetching(false);
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    
    setProcessing(true);
    
    const validFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    const newImages: StudyImage[] = [];

    // Upload sequentially
    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      try {
        const formData = new FormData();
        formData.append('image', file);
        if (folderName) {
           formData.append('folder', folderName);
        }

        const response = await fetch('/api/upload-image', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
            throw new Error('Upload failed');
        }

        const data = await response.json();

        newImages.push({
          id: data.public_id || `custom-${Date.now()}-${i}`,
          url: data.url,
          name: file.name,
          duration: DEFAULT_DURATION
        });
      } catch (err) {
        console.error("Error processing file", file.name, err);
        showAlert("Upload Failed", `Failed to upload ${file.name}. Please try again.`, 'error');
      }
    }

    setImages(prev => [...prev, ...newImages]);
    setProcessing(false);
  };



  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const removeImage = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
  };

  const handleContinue = async () => {
    if (images.length === 0) return;
    
    // Request full screen
    try {
        if (!document.fullscreenElement) {
            await document.documentElement.requestFullscreen();
        }
    } catch (e) {
        console.warn("Fullscreen denied", e);
    }

    // Store images in session storage
    try {
      sessionStorage.setItem('studyConfig', JSON.stringify(images));
      navigate('/calibration');
    } catch (e) {
      showAlert("Storage Error", "Storage quota exceeded or session error. Please try fewer or smaller images.", 'error');
    }
  };

  const useDemoImages = async () => {
    // Request full screen
    try {
        if (!document.fullscreenElement) {
            await document.documentElement.requestFullscreen();
        }
    } catch (e) {
        console.warn("Fullscreen denied", e);
    }

    sessionStorage.removeItem('studyConfig'); // Clear custom config
    navigate('/calibration');
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8 flex flex-col items-center">
      <div className="max-w-4xl w-full space-y-8">
        <div className="text-center relative">
          <div className={`absolute top-0 right-0 flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-mono uppercase tracking-wider backdrop-blur-sm transition-all border shadow-sm sm:relative sm:top-auto sm:right-auto sm:inline-flex sm:mb-4 sm:mx-auto ${
            cloudStatus === 'connected' ? 'bg-green-50/80 text-green-700 border-green-200' :
            cloudStatus === 'checking' ? 'bg-slate-50/80 text-slate-500 border-slate-200' :
            cloudStatus === 'unconfigured' ? 'bg-amber-50/80 text-amber-700 border-amber-200' :
            'bg-red-50/80 text-red-700 border-red-200'
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${
              cloudStatus === 'connected' ? 'bg-green-500 animate-pulse' :
              cloudStatus === 'checking' ? 'bg-slate-400 animate-pulse' :
              cloudStatus === 'unconfigured' ? 'bg-amber-500' :
              'bg-red-500'
            }`} />
            {cloudStatus === 'connected' ? 'Cloudinary Linked' :
             cloudStatus === 'checking' ? 'Checking Link...' :
             cloudStatus === 'unconfigured' ? 'Config Required' :
             'Connection Error'}
          </div>

          <h1 className="text-3xl font-bold text-slate-900 mt-2">Setup Assessment</h1>
          <p className="text-slate-600 mt-2">Upload images for the participant to view, or fetch them from a Cloudinary folder.</p>
          <button 
            onClick={handleTestConnection}
            className="text-[10px] text-slate-400 mt-1 hover:text-blue-500 underline"
          >
            Debug: Test Server Connection
          </button>
        </div>

        {/* Cloudinary Options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="font-semibold text-slate-800 mb-2">Upload to Folder</h3>
                <p className="text-sm text-slate-500 mb-4">Set a specific Cloudinary folder for newly uploaded images (optional).</p>
                <input 
                    type="text"
                    placeholder="e.g. participant_123"
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                    value={folderName}
                    onChange={(e) => setFolderName(e.target.value)}
                />
            </div>
            
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="font-semibold text-slate-800 mb-2">Fetch from Cloudinary</h3>
                <p className="text-sm text-slate-500 mb-4">Load existing images directly from a Cloudinary folder.</p>
                <div className="flex gap-2">
                    {availableFolders.length > 0 ? (
                        <select 
                            className="flex-1 border border-slate-300 rounded px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500 bg-white"
                            value={fetchFolder}
                            onChange={(e) => setFetchFolder(e.target.value)}
                        >
                            <option value="" disabled>Select a folder</option>
                            {availableFolders.map(folder => (
                                <option key={folder} value={folder}>{folder}</option>
                            ))}
                        </select>
                    ) : (
                        <input 
                            type="text"
                            placeholder={isLoadingFolders ? "Loading folders..." : "Folder name"}
                            className="flex-1 border border-slate-300 rounded px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                            value={fetchFolder}
                            onChange={(e) => setFetchFolder(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleFetchFromCloudinary()}
                            disabled={isLoadingFolders}
                        />
                    )}
                    <Button onClick={handleFetchFromCloudinary} disabled={!fetchFolder || isFetching} className="whitespace-nowrap px-4 py-2 text-sm">
                        {isFetching ? "Loading..." : "Fetch"}
                    </Button>
                </div>
                {cloudStatus === 'connected' && availableFolders.length === 0 && !isLoadingFolders && (
                    <p className="text-[10px] text-slate-400 mt-2">No folders found. Try uploading some images first.</p>
                )}
            </div>
        </div>

        {/* Upload Zone */}
        <div 
          className={`
            border-4 border-dashed rounded-2xl p-12 text-center transition-all
            ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-white'}
            ${processing ? 'opacity-50 cursor-wait' : 'cursor-pointer hover:border-blue-400'}
          `}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            multiple 
            accept="image/*"
            onChange={(e) => handleFiles(e.target.files)}
          />
          
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="bg-blue-100 p-4 rounded-full">
              <Upload className="w-8 h-8 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-800">
                {processing ? "Processing Images..." : "Click or Drag Images Here"}
              </h3>
              <p className="text-sm text-slate-500 mt-1">Supports JPG, PNG, WEBP</p>
            </div>
          </div>
        </div>

        {/* Image Grid */}
        {images.length > 0 && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h3 className="font-semibold text-slate-800 mb-4 flex items-center justify-between">
              <div className="flex flex-col">
                <span>Selected Images ({images.length})</span>
                <span className="text-[10px] text-slate-400 font-normal">Drag handles to rearrange study order</span>
              </div>
              <button 
                onClick={() => setImages([])}
                className="text-xs text-red-500 hover:text-red-700 underline"
              >
                Clear All
              </button>
            </h3>
            <Reorder.Group 
              axis="y" 
              values={images} 
              onReorder={setImages}
              className="space-y-3"
            >
              {images.map((img, idx) => (
                <Reorder.Item 
                  key={img.id} 
                  value={img}
                  className="group relative bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow flex items-center p-2 gap-4"
                >
                  <div className="cursor-grab active:cursor-grabbing p-1 text-slate-400 hover:text-slate-600">
                    <GripVertical size={20} />
                  </div>

                  <div className="w-24 aspect-video bg-slate-100 rounded overflow-hidden flex-shrink-0">
                    <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                       <span className="text-xs font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                         {idx + 1}
                       </span>
                       <p className="text-sm font-medium text-slate-700 truncate">{img.name}</p>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">{img.duration / 1000}s exposure</p>
                  </div>

                  <button 
                    onClick={(e) => { e.stopPropagation(); removeImage(img.id); }}
                    className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </Reorder.Item>
              ))}
            </Reorder.Group>
          </div>
        )}

        {/* Action Bar */}
        <div className="flex flex-col md:flex-row gap-4 justify-between pt-6 border-t border-slate-200">
           <button 
             onClick={useDemoImages}
             className="flex items-center justify-center gap-2 text-slate-600 font-medium px-6 py-3 rounded-lg hover:bg-slate-200 transition-colors"
           >
             <PlayCircle size={20} />
             Use Standard Demo Set
           </button>

           <Button 
             onClick={handleContinue} 
             disabled={images.length === 0}
             className="flex items-center justify-center gap-2 text-lg px-8"
           >
             Start Calibration <ArrowRight size={20} />
           </Button>
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
    </div>
  );
};

export default ImageUpload;