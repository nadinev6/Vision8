import React, { useState, useRef, useEffect } from 'react';
import { cn } from '../lib/utils';
import { importMuxAsset, uploadVideoToMuxComplete } from '../lib/mux';
import { Dialog, DialogContent } from './ui/dialog';
import { AlertCircle, Upload, Loader2, Cloud, HardDrive } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface MuxAssetImportDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onImportSuccess?: () => void;
    onAnalyzeSuccess?: (videoId: string) => void;
    onSelectExisting?: (asset: any) => void;
    mode?: 'content' | 'chat'; // 'content' for ContentLibrary (direct import), 'chat' for AIChatInput (dialog with options)
}

interface ImportResult {
    status: string;
    video_id?: string;
    mux_asset_id: string;
    mux_playback_id?: string;
    title?: string;
}

const MuxAssetImportDialog: React.FC<MuxAssetImportDialogProps> = ({
    open,
    onOpenChange,
    onImportSuccess,
    onAnalyzeSuccess,
    onSelectExisting,
    mode = 'content' // Default to content mode
}) => {
    const [assetId, setAssetId] = useState('');
    const [title, setTitle] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [importResult, setImportResult] = useState<ImportResult | null>(null);
    const [uploadMethod, setUploadMethod] = useState<'upload' | 'drive' | 'content'>('upload');
    const [muxAssets, setMuxAssets] = useState<any[]>([]);
    const [libraryAssets, setLibraryAssets] = useState<any[]>([]);
    const [isLoadingMuxAssets, setIsLoadingMuxAssets] = useState(false);
    const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Get authentication context
    const { userProfile, isAuthenticated } = useAuth();

    // Fetch recent Mux assets on open (for Drive tab)
    useEffect(() => {
        if (open && uploadMethod === 'drive') {
            const fetchMuxAssets = async () => {
                setIsLoadingMuxAssets(true);
                try {
                    const { listRecentMuxAssets } = await import('../lib/mux');
                    const assets = await listRecentMuxAssets();
                    setMuxAssets(assets);
                } catch (err) {
                    console.error("Failed to fetch Mux assets:", err);
                } finally {
                    setIsLoadingMuxAssets(false);
                }
            };
            fetchMuxAssets();
        }
    }, [open, uploadMethod]);

    // Fetch library assets on open (for Content tab)
    useEffect(() => {
        if (open && uploadMethod === 'content') {
            const fetchLibrary = async () => {
                setIsLoadingLibrary(true);
                try {
                    const response = await fetch('/mux/user-assets');
                    if (response.ok) {
                        const data = await response.json();
                        if (data && data.status === 'success' && Array.isArray(data.assets)) {
                            setLibraryAssets(data.assets);
                        }
                    }
                } catch (err) {
                    console.error("Failed to fetch library assets:", err);
                } finally {
                    setIsLoadingLibrary(false);
                }
            };
            fetchLibrary();
        }
    }, [open, uploadMethod]);

    const handleSelectAsset = (asset: any) => {
        setAssetId(asset.id);
    };

    const handleImport = async () => {
        if (!assetId.trim()) {
            setError('Asset ID is required');
            return;
        }

        // Basic validation for Mux asset ID format (alphanumeric with hyphens)
        const muxAssetIdRegex = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
        if (!muxAssetIdRegex.test(assetId.trim())) {
            setError('Asset ID appears to be in an invalid format. Mux asset IDs should contain only letters, numbers, hyphens, and underscores.');
            return;
        }

        setIsImporting(true);
        setError(null);
        setImportResult(null);

        try {
            // Check if user is authenticated
            if (!isAuthenticated || !userProfile?.id) {
                throw new Error('User not authenticated. Please log in to import assets.');
            }

            // Use the actual authenticated user ID
            const userId = userProfile.id;

            const result = await importMuxAsset(assetId.trim(), userId);

            setImportResult(result);

            if (result.status === 'imported' || result.status === 'already_exists') {
                // If in chat mode, also trigger selection to open in player
                if (mode === 'chat' && onSelectExisting) {
                    onSelectExisting({
                        ...result,
                        playback_id: result.mux_playback_id,
                        asset_id: result.mux_asset_id
                    });
                }

                // Success - close dialog after a short delay
                setTimeout(() => {
                    onImportSuccess?.();
                    handleClose();
                }, (mode === 'chat' && onSelectExisting) ? 500 : 2000); // Shorter delay if selecting
            }
        } catch (err) {
            console.error('Import failed:', err);
            let errorMessage = 'Import failed';
            if (err instanceof Error) {
                errorMessage = err.message;
                // Check for specific Mux errors
                if (err.message.includes('Asset not found')) {
                    errorMessage = 'Mux Asset not found. Please check the Asset ID and try again.';
                } else if (err.message.includes('404')) {
                    errorMessage = 'Asset not found in Mux. The Asset ID may be incorrect.';
                } else if (err.message.includes('already exists')) {
                    errorMessage = 'This asset is already imported in your library.';
                } else if (err.message.includes('User not authenticated')) {
                    errorMessage = 'Please log in to import assets from Mux.';
                }
            } else if (typeof err === 'string') {
                errorMessage = err;
            }
            setError(errorMessage);
        } finally {
            setIsImporting(false);
        }
    };

    const handleAnalyze = async () => {
        if (!assetId.trim()) {
            setError('Asset ID is required');
            return;
        }

        setIsAnalyzing(true);
        setError(null);
        setImportResult(null);

        try {
            const backendUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';
            const response = await fetch(`${backendUrl}/analysis/analyze/mux-asset`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    mux_asset_id: assetId.trim(),
                    include_transcription: false
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || `Analysis failed: ${response.statusText}`);
            }

            const result = await response.json();

            setImportResult({
                status: 'analyzed',
                mux_asset_id: assetId.trim(),
                video_id: result.video_id,
                title: result.thread_name
            });

            // Success - close dialog after a short delay
            setTimeout(() => {
                onAnalyzeSuccess?.(result.video_id);
                handleClose();
            }, 2000);

        } catch (err) {
            console.error('Analysis failed:', err);
            setError(err instanceof Error ? err.message : 'Analysis failed');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleClose = () => {
        setAssetId('');
        setTitle('');
        setError(null);
        setImportResult(null);
        setIsImporting(false);
        setUploadMethod('upload');
        onOpenChange(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !isImporting) {
            handleImport();
        }
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            console.log('File selected for upload:', {
                name: file.name,
                type: file.type,
                size: file.size,
                lastModified: file.lastModified
            });

            if (file.type.startsWith('video/')) {
                try {
                    setIsImporting(true);
                    setError(null);

                    // Check if user is authenticated
                    if (!isAuthenticated || !userProfile?.id) {
                        throw new Error('User not authenticated. Please log in to upload videos.');
                    }

                    // Use the real upload function
                    const uploadResult = await uploadVideoToMuxComplete(file, userProfile.id);

                    const resultData = {
                        status: 'imported',
                        mux_asset_id: uploadResult.asset_id,
                        video_id: uploadResult.asset_id,
                        title: uploadResult.title,
                        mux_playback_id: uploadResult.playback_id
                    };

                    setImportResult(resultData);

                    // If in chat mode, also trigger selection to open in player
                    if (mode === 'chat' && onSelectExisting) {
                        onSelectExisting({
                            ...resultData,
                            playback_id: uploadResult.playback_id,
                            asset_id: uploadResult.asset_id
                        });
                    }

                    // Close dialog after a short delay to show success
                    setTimeout(() => {
                        onImportSuccess?.();
                        handleClose();
                    }, 2000);
                } catch (error) {
                    console.error('Error during video upload:', error);
                    setError(error instanceof Error ? error.message : 'Upload failed');
                } finally {
                    setIsImporting(false);
                }
            } else {
                console.warn('Selected file is not a video:', file.type);
                setError('Please select a video file');
            }
        }
    };

    const handleUploadFromDrive = () => {
        setUploadMethod('drive');
    };

    const handleUploadFromContent = () => {
        setUploadMethod('content');
    };

    const handleBackToSelection = () => {
        setUploadMethod('upload');
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {/* Hidden file input for local uploads */}
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="video/*"
                style={{ display: 'none' }}
            />

            <DialogContent
                title="Select Video"
                onClose={handleClose}
                className="sm:max-w-[425px]"
            >
                <div className="space-y-6">
                    {/* Simplified Tab Interface */}
                    <div className="flex p-1 bg-muted rounded-lg">
                        <button
                            onClick={() => setUploadMethod('upload')}
                            className={cn(
                                "flex-1 px-3 py-2 text-xs font-medium rounded-md transition-all",
                                uploadMethod === 'upload' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            Upload
                        </button>
                        <button
                            onClick={() => setUploadMethod('drive')}
                            className={cn(
                                "flex-1 px-3 py-2 text-xs font-medium rounded-md transition-all",
                                uploadMethod === 'drive' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            Drive
                        </button>
                        <button
                            onClick={() => setUploadMethod('content')}
                            className={cn(
                                "flex-1 px-3 py-2 text-xs font-medium rounded-md transition-all",
                                uploadMethod === 'content' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            Content
                        </button>
                    </div>

                    {/* Tab Content */}
                    <div className="min-h-[250px]">
                        {uploadMethod === 'upload' && (
                            <div className="space-y-4 pt-2">
                                <div className="text-center p-8 border-2 border-dashed border-border rounded-xl hover:border-primary/50 transition-colors cursor-pointer group"
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                                        <Upload className="w-6 h-6 text-primary" />
                                    </div>
                                    <h3 className="text-sm font-semibold mb-1">Upload a local file</h3>
                                    <p className="text-xs text-muted-foreground">Select a video file from your computer</p>
                                </div>
                                {isImporting && (
                                    <div className="flex items-center justify-center p-4 gap-2 text-sm text-muted-foreground">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Uploading...
                                    </div>
                                )}
                            </div>
                        )}

                        {uploadMethod === 'drive' && (
                            <div className="space-y-4 pt-2">
                                <div className="text-xs text-muted-foreground">
                                    Mux assets not yet in your Vision8 library.
                                </div>
                                <div className="border border-border rounded-lg bg-muted/30 overflow-hidden">
                                    <div className="max-h-[250px] overflow-y-auto p-2 space-y-2">
                                        {isLoadingMuxAssets ? (
                                            <div className="flex items-center justify-center p-8 text-muted-foreground text-sm gap-2">
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Loading Drive...
                                            </div>
                                        ) : muxAssets.length > 0 ? (
                                            muxAssets.map((asset) => (
                                                <button
                                                    key={asset.id}
                                                    onClick={() => handleSelectAsset(asset)}
                                                    className={cn(
                                                        "w-full text-left p-3 rounded-md transition-all border",
                                                        assetId === asset.id
                                                            ? "bg-primary/10 border-primary"
                                                            : "bg-background border-transparent hover:border-primary/50"
                                                    )}
                                                >
                                                    <div className="font-medium text-sm truncate">
                                                        {asset.name || `Video ${asset.id.substring(0, 8)}...`}
                                                    </div>
                                                    <div className="text-[10px] text-muted-foreground font-mono">
                                                        {asset.id}
                                                    </div>
                                                </button>
                                            ))
                                        ) : (
                                            <div className="p-8 text-center text-muted-foreground text-sm">
                                                No assets found in Drive.
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={handleImport}
                                    disabled={!assetId || isImporting}
                                    className="w-full py-2 bg-primary text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                                >
                                    {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />}
                                    Import Selected
                                </button>
                            </div>
                        )}

                        {uploadMethod === 'content' && (
                            <div className="space-y-4 pt-2">
                                <div className="text-xs text-muted-foreground">
                                    Videos already in your Vision8 library.
                                </div>
                                <div className="border border-border rounded-lg bg-muted/30 overflow-hidden">
                                    <div className="max-h-[250px] overflow-y-auto p-2 space-y-2">
                                        {isLoadingLibrary ? (
                                            <div className="flex items-center justify-center p-8 text-muted-foreground text-sm gap-2">
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Loading Content...
                                            </div>
                                        ) : libraryAssets.length > 0 ? (
                                            libraryAssets.map((asset) => (
                                                <button
                                                    key={asset.asset_id}
                                                    onClick={() => {
                                                        onSelectExisting?.(asset);
                                                        handleClose();
                                                    }}
                                                    className="w-full text-left p-3 rounded-md bg-background border border-transparent hover:border-primary/50 transition-all"
                                                >
                                                    <div className="font-medium text-sm truncate">
                                                        {asset.title || `Video ${asset.asset_id.substring(0, 8)}...`}
                                                    </div>
                                                    <div className="text-[10px] text-muted-foreground">
                                                        {asset.created_at
                                                            ? (typeof asset.created_at === 'number'
                                                                ? new Date(asset.created_at * 1000).toLocaleDateString()
                                                                : new Date(asset.created_at).toLocaleDateString())
                                                            : 'Unknown date'}
                                                    </div>
                                                </button>
                                            ))
                                        ) : (
                                            <div className="p-8 text-center text-muted-foreground text-sm">
                                                Your library is empty.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 dark:bg-red-950/20 p-3 rounded-md">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {importResult && (
                        <div className="flex items-center gap-2 text-green-600 text-sm bg-green-50 dark:bg-green-950/20 p-3 rounded-md">
                            <div className="p-1 bg-green-100 dark:bg-green-900/30 rounded">
                                <Upload className="w-4 h-4" />
                            </div>
                            <div>
                                <div className="font-medium">Success!</div>
                                <div className="text-xs opacity-80">Video loaded successfully.</div>
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>

        </Dialog>
    );
};

export default MuxAssetImportDialog;
