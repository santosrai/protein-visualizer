import React, { useRef, useState, useCallback, useEffect } from 'react';
import MolstarViewer, { ViewerControls, SelectionInfo } from './components/MolstarViewer';
import ChatInterface from './components/ChatInterface';
import ProteinSelector from './components/ProteinSelector';
import FileUploader from './components/FileUploader';
import ControlPanel from './components/ControlPanel';
import HelpDialog from './components/HelpDialog';
import SettingsDialog from './components/SettingsDialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Button } from './components/ui/button';
import { Separator } from './components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { toast } from './components/ui/use-toast';
import { Toaster } from './components/ui/toaster';
import { Dna, Github, ExternalLink, Atom, RefreshCw, AlertTriangle } from 'lucide-react';

function App() {
  const viewerRef = useRef<ViewerControls>(null);
  const [currentRepresentation, setCurrentRepresentation] = useState<string>('cartoon');
  const [isStructureLoaded, setIsStructureLoaded] = useState(false);
  const [selectedProtein, setSelectedProtein] = useState<string>('2PGH');
  const [currentStructureName, setCurrentStructureName] = useState<string>('2PGH');
  const [viewerReady, setViewerReady] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [currentSelection, setCurrentSelection] = useState<SelectionInfo | null>(null);
  const [isLoadingStructure, setIsLoadingStructure] = useState(false);
  const [structureError, setStructureError] = useState<string | null>(null);

  // Check for API key on mount
  useEffect(() => {
    const savedKey = localStorage.getItem('gemini_api_key');
    const envKey = import.meta.env.VITE_GEMINI_API_KEY;
    setHasApiKey(!!(savedKey || envKey));
  }, []);

  // Handle protein selection from samples
  const handleProteinSelect = useCallback(async (proteinId: string, file: string) => {
    if (!viewerRef.current) {
      toast({
        title: "Error",
        description: "3D viewer not ready. Please wait and try again.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoadingStructure(true);
      setStructureError(null);
      setSelectedProtein(proteinId);
      setCurrentStructureName(proteinId);
      
      console.log(`🔄 Loading protein: ${proteinId} from file: ${file}`);
      
      // Validate that the file URL is accessible
      const fileUrl = `/data/${file}`;
      console.log(`📁 Loading from: ${fileUrl}`);
      
      await viewerRef.current.loadStructure(fileUrl);
      
      setIsStructureLoaded(true);
      setCurrentSelection(null); // Clear selection when loading new structure
      
      toast({
        title: "Structure Loaded",
        description: `Successfully loaded ${proteinId}`,
      });
      
      console.log(`✅ Successfully loaded protein: ${proteinId}`);
      
      // Validate plugin state after loading
      setTimeout(() => {
        if (viewerRef.current?.validatePluginState()) {
          console.log('✅ Plugin state validation passed');
        } else {
          console.log('⚠️ Plugin state validation failed');
          setStructureError('Structure loaded but may not be visible. Try refreshing.');
        }
      }, 1000);
      
    } catch (error) {
      console.error('❌ Failed to load protein:', error);
      setIsStructureLoaded(false);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setStructureError(errorMessage);
      
      toast({
        title: "Error",
        description: `Failed to load protein structure: ${errorMessage}`,
        variant: "destructive",
      });
    } finally {
      setIsLoadingStructure(false);
    }
  }, []);

  // Handle custom file upload
  const handleFileLoad = useCallback(async (content: string, filename: string) => {
    if (!viewerRef.current) {
      toast({
        title: "Error",
        description: "3D viewer not ready. Please wait and try again.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoadingStructure(true);
      setStructureError(null);
      
      // Create a blob URL for the content
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      
      setSelectedProtein('');
      setCurrentStructureName(filename);
      
      console.log(`🔄 Loading uploaded file: ${filename}`);
      await viewerRef.current.loadStructure(url);
      
      setIsStructureLoaded(true);
      setCurrentSelection(null); // Clear selection when loading new structure
      
      // Clean up the blob URL
      URL.revokeObjectURL(url);
      
      toast({
        title: "File Loaded",
        description: `Successfully loaded ${filename}`,
      });
      
      console.log(`✅ Successfully loaded uploaded file: ${filename}`);
    } catch (error) {
      console.error('❌ Failed to load file:', error);
      setIsStructureLoaded(false);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setStructureError(errorMessage);
      
      toast({
        title: "Error",
        description: `Failed to load uploaded file: ${errorMessage}`,
        variant: "destructive",
      });
    } finally {
      setIsLoadingStructure(false);
    }
  }, []);

  // Handle representation change
  const handleRepresentationChange = useCallback((type: 'cartoon' | 'surface' | 'ball-and-stick' | 'spacefill') => {
    if (!viewerRef.current) return;
    
    viewerRef.current.setRepresentation(type);
    setCurrentRepresentation(type);
    
    toast({
      title: "Representation Changed",
      description: `Switched to ${type} representation`,
    });
  }, []);

  // Handle camera controls
  const handleCameraReset = useCallback(() => {
    if (!viewerRef.current) return;
    viewerRef.current.resetView();
  }, []);

  const handleZoomIn = useCallback(() => {
    if (!viewerRef.current) return;
    viewerRef.current.zoomIn();
  }, []);

  const handleZoomOut = useCallback(() => {
    if (!viewerRef.current) return;
    viewerRef.current.zoomOut();
  }, []);

  // Handle API key updates
  const handleApiKeyUpdate = useCallback((hasKey: boolean) => {
    setHasApiKey(hasKey);
  }, []);

  // Handle selection changes
  const handleSelectionChange = useCallback((selectionInfo: SelectionInfo | null) => {
    setCurrentSelection(selectionInfo);
    if (selectionInfo) {
      toast({
        title: "Selection Updated",
        description: selectionInfo.description,
      });
    }
  }, []);

  // Enhanced viewer ready handler
  const handleViewerReady = useCallback(() => {
    console.log('🎯 Molstar viewer ready - starting default protein load');
    setViewerReady(true);
  }, []);

  // Handle force refresh
  const handleForceRefresh = useCallback(async () => {
    if (!viewerRef.current) return;
    
    try {
      await viewerRef.current.forceRerender();
      toast({
        title: "Viewer Refreshed",
        description: "3D viewer has been refreshed",
      });
    } catch (error) {
      console.error('Failed to refresh viewer:', error);
    }
  }, []);

  // Load default protein when viewer is ready
  useEffect(() => {
    const loadDefaultProtein = async () => {
      if (viewerReady && viewerRef.current && !isStructureLoaded && !isLoadingStructure) {
        console.log('🔄 Attempting to load default protein (2PGH)...');
        
        // Add a longer delay to ensure Molstar is fully ready
        setTimeout(async () => {
          if (!viewerReady || isStructureLoaded || isLoadingStructure) return;
          
          try {
            setIsLoadingStructure(true);
            setStructureError(null);
            
            console.log('📁 Loading default protein from: /data/2PGH.pdb');
            await viewerRef.current!.loadStructure('/data/2PGH.pdb');
            
            setIsStructureLoaded(true);
            console.log('✅ Default protein (2PGH) loaded successfully');
            
            toast({
              title: "Default Structure Loaded",
              description: "Loaded 2PGH (Porcine Hemoglobin) as default",
            });
            
            // Validate plugin state
            setTimeout(() => {
              if (viewerRef.current?.validatePluginState()) {
                console.log('✅ Default protein validation passed');
              } else {
                console.log('⚠️ Default protein validation failed');
                setStructureError('Default structure may not be visible. Try loading manually.');
              }
            }, 1000);
            
          } catch (error) {
            console.error('❌ Failed to load default protein:', error);
            setIsStructureLoaded(false);
            // Don't show error toast for default loading failure - user can manually load
            console.log('Default protein loading failed - user can load manually');
          } finally {
            setIsLoadingStructure(false);
          }
        }, 1000); // Increased delay
      }
    };

    loadDefaultProtein();
  }, [viewerReady, isStructureLoaded, isLoadingStructure]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Header */}
      <header className="bg-gray-900/80 backdrop-blur-sm border-b border-gray-700 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-600 rounded-lg">
                <Dna className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Protein Visualizer</h1>
                <p className="text-gray-400 text-sm">Advanced 3D Molecular Visualization with AI Assistant</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <SettingsDialog onApiKeyUpdate={handleApiKeyUpdate} />
              <HelpDialog />
              <Button
                variant="outline"
                size="sm"
                className="bg-gray-800/50 border-gray-600 text-white hover:bg-gray-700"
                onClick={() => window.open('https://github.com', '_blank')}
              >
                <Github className="h-4 w-4 mr-2" />
                GitHub
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-140px)]">
          
          {/* Left Panel - Controls (FIXED: Proper scrolling structure) */}
          <div className="lg:col-span-3 space-y-4 overflow-y-auto max-h-full">
            
            {/* Current Structure Info */}
            {(isStructureLoaded || isLoadingStructure) && (
              <Card className="bg-gray-800/50 border-gray-700">
                <CardHeader className="pb-3">
                  <CardTitle className="text-white flex items-center text-sm">
                    <Atom className="h-4 w-4 mr-2 text-green-400" />
                    Current Structure
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center">
                    <div className="text-lg font-semibold text-white">
                      {isLoadingStructure ? 'Loading...' : currentStructureName}
                    </div>
                    <div className="text-sm text-gray-400 capitalize">
                      {isLoadingStructure ? 'Please wait' : `${currentRepresentation} view`}
                    </div>
                    
                    {/* Structure error warning */}
                    {structureError && (
                      <div className="mt-2 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded">
                        <div className="flex items-center space-x-2">
                          <AlertTriangle className="h-4 w-4 text-yellow-400" />
                          <div className="text-xs text-yellow-300">Structure Issue</div>
                        </div>
                        <div className="text-xs text-yellow-200 mt-1">{structureError}</div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleForceRefresh}
                          className="mt-2 h-6 text-xs bg-yellow-500/20 border-yellow-500/30 text-yellow-300 hover:bg-yellow-500/30"
                        >
                          <RefreshCw className="h-3 w-3 mr-1" />
                          Refresh
                        </Button>
                      </div>
                    )}
                    
                    {/* Selection info */}
                    {currentSelection && !isLoadingStructure && (
                      <div className="mt-2 p-2 bg-green-500/10 border border-green-500/30 rounded">
                        <div className="text-xs text-green-300 font-medium">Selected:</div>
                        <div className="text-sm text-green-200">
                          {currentSelection.residueName} {currentSelection.residueNumber} (Chain {currentSelection.chainId})
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Control Panel */}
            <ControlPanel
              onRepresentationChange={handleRepresentationChange}
              onCameraReset={handleCameraReset}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              currentRepresentation={currentRepresentation}
              isStructureLoaded={isStructureLoaded}
            />

            {/* Structure Sources */}
            <Tabs defaultValue="samples" className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-gray-800/50 border border-gray-700">
                <TabsTrigger 
                  value="samples" 
                  className="text-gray-400 data-[state=active]:text-white data-[state=active]:bg-gray-700"
                >
                  Samples
                </TabsTrigger>
                <TabsTrigger 
                  value="upload" 
                  className="text-gray-400 data-[state=active]:text-white data-[state=active]:bg-gray-700"
                >
                  Upload
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="samples" className="mt-4">
                <ProteinSelector
                  onProteinSelect={handleProteinSelect}
                  selectedProtein={selectedProtein}
                />
              </TabsContent>
              
              <TabsContent value="upload" className="mt-4">
                <FileUploader
                  onFileLoad={handleFileLoad}
                />
              </TabsContent>
            </Tabs>
          </div>

          {/* Main Viewer */}
          <div className="lg:col-span-6">
            <Card className="h-full bg-gray-800/30 border-gray-700">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-white flex items-center">
                      <Dna className="h-5 w-5 mr-2 text-blue-400" />
                      3D Molecular Viewer
                    </CardTitle>
                    <CardDescription className="text-gray-400">
                      Interactive protein structure visualization powered by Molstar
                    </CardDescription>
                  </div>
                  {(isStructureLoaded || isLoadingStructure) && (
                    <div className="text-sm text-gray-400">
                      {isLoadingStructure ? (
                        <span className="text-blue-400">Loading...</span>
                      ) : (
                        <>Viewing: <span className="text-white font-medium">{currentStructureName}</span></>
                      )}
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="h-[calc(100%-80px)] p-4 relative">
                <MolstarViewer
                  ref={viewerRef}
                  className="w-full h-full"
                  onReady={handleViewerReady}
                  onError={(error) => {
                    console.error('❌ Molstar error:', error);
                    setIsStructureLoaded(false);
                    setStructureError(error.message);
                    toast({
                      title: "Viewer Error",
                      description: error.message,
                      variant: "destructive",
                    });
                  }}
                  onSelectionChange={handleSelectionChange}
                />
                
                {/* Welcome message when no structure is loaded AND not loading */}
                {!isStructureLoaded && !isLoadingStructure && viewerReady && !structureError && (
                  <div className="absolute inset-4 flex items-center justify-center bg-gray-900/20 rounded-lg border-2 border-dashed border-gray-600">
                    <div className="text-center">
                      <Dna className="h-16 w-16 text-gray-500 mx-auto mb-4" />
                      <h3 className="text-xl font-semibold text-white mb-2">
                        Welcome to Protein Visualizer
                      </h3>
                      <p className="text-gray-400 mb-4 max-w-md">
                        Load a sample protein or upload your own PDB file to start exploring 
                        3D molecular structures with advanced visualization tools and AI assistance.
                      </p>
                      <div className="flex items-center justify-center space-x-2 text-sm text-gray-500 mb-4">
                        <span>Powered by</span>
                        <ExternalLink className="h-4 w-4" />
                        <span>Molstar + Gemini AI</span>
                      </div>
                      <Button
                        onClick={() => handleProteinSelect('2PGH', '2PGH.pdb')}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        Load Sample Protein
                      </Button>
                    </div>
                  </div>
                )}
                
                {/* Loading message */}
                {isLoadingStructure && (
                  <div className="absolute inset-4 flex items-center justify-center bg-gray-900/20 rounded-lg border-2 border-dashed border-gray-600">
                    <div className="text-center">
                      <div className="h-16 w-16 mx-auto mb-4 animate-spin rounded-full border-4 border-blue-400 border-t-transparent"></div>
                      <h3 className="text-xl font-semibold text-white mb-2">
                        Loading Structure...
                      </h3>
                      <p className="text-gray-400">
                        Please wait while we load the protein structure
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Panel - AI Chat */}
          <div className="lg:col-span-3">
            <ChatInterface
              viewerRef={viewerRef}
              currentStructure={currentStructureName}
              currentRepresentation={currentRepresentation}
              isStructureLoaded={isStructureLoaded}
            />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-900/50 border-t border-gray-700 mt-8">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between text-sm text-gray-400">
            <div className="flex items-center space-x-4">
              <span>© 2025 Protein Visualizer</span>
              <Separator orientation="vertical" className="h-4 bg-gray-600" />
              <span>Built with React + Molstar + Gemini AI</span>
            </div>
            <div className="flex items-center space-x-4">
              <a
                href="https://molstar.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors flex items-center"
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Molstar
              </a>
              <a
                href="https://ai.google.dev/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors flex items-center"
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Gemini AI
              </a>
              <a
                href="https://www.rcsb.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors flex items-center"
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                PDB
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* Toast notifications */}
      <Toaster />
    </div>
  );
}

export default App;