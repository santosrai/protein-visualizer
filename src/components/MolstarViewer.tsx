import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPluginUI } from 'molstar/lib/mol-plugin-ui';
import { renderReact18 } from 'molstar/lib/mol-plugin-ui/react18';
import { PluginCommands } from 'molstar/lib/mol-plugin/commands';
import { PluginConfig } from 'molstar/lib/mol-plugin/config';
import { DefaultPluginUISpec } from 'molstar/lib/mol-plugin-ui/spec';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { StateSelection } from 'molstar/lib/mol-state';
import { PluginStateObject } from 'molstar/lib/mol-plugin-state/objects';
import { Asset } from 'molstar/lib/mol-util/assets';
import { Vec3 } from 'molstar/lib/mol-math/linear-algebra';
import { StructureElement, StructureProperties } from 'molstar/lib/mol-model/structure';
import { Script } from 'molstar/lib/mol-script/script';
import { StructureSelection } from 'molstar/lib/mol-model/structure/query';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Loader2, RotateCcw, Home, ZoomIn, ZoomOut, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

// Import required molstar styles
import 'molstar/build/viewer/molstar.css';

export interface MolstarViewerProps {
  className?: string;
  onReady?: (plugin: PluginContext) => void;
  onError?: (error: Error) => void;
  onSelectionChange?: (selectionInfo: SelectionInfo | null) => void;
}

export interface SelectionInfo {
  residueName?: string;
  residueNumber?: number;
  chainId?: string;
  atomName?: string;
  atomCount?: number;
  elementType?: string;
  description: string;
  coordinates?: { x: number; y: number; z: number };
  rangeStart?: number;
  rangeEnd?: number;
}

export interface ResidueRangeQuery {
  chainId: string;
  startResidue: number;
  endResidue: number;
}

export interface ViewerControls {
  loadStructure: (url: string, format?: string) => Promise<void>;
  resetView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setRepresentation: (type: 'cartoon' | 'surface' | 'ball-and-stick' | 'spacefill') => void;
  getPlugin: () => PluginContext | null;
  showWaterMolecules: () => Promise<void>;
  hideWaterMolecules: () => Promise<void>;
  hideLigands: () => Promise<void>;
  focusOnChain: (chainId: string) => Promise<void>;
  getSelectionInfo: () => Promise<string>;
  showOnlySelected: () => Promise<void>;
  hideOnlySelected: () => Promise<void>;
  highlightChain: (chainId: string) => Promise<void>;
  clearHighlights: () => Promise<void>;
  getStructureInfo: () => Promise<string>;
  getCurrentSelection: () => SelectionInfo | null;
  selectResidueRange: (query: ResidueRangeQuery) => Promise<string>;
  clearSelection: () => Promise<void>;
  selectResidue: (residueId: number, chainId?: string) => Promise<string>;
  forceRerender: () => Promise<void>;
  validatePluginState: () => boolean;
}

// Add a global registry to track active Molstar instances
const MOLSTAR_INSTANCES = new Set<string>();

const MolstarViewer = React.forwardRef<ViewerControls, MolstarViewerProps>(
  ({ className, onReady, onError, onSelectionChange }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const pluginRef = useRef<PluginContext | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);
    const [hasStructure, setHasStructure] = useState(false);
    const [structureLoadError, setStructureLoadError] = useState<string | null>(null);
    const [debugInfo, setDebugInfo] = useState<string>('');
    const [currentSelection, setCurrentSelection] = useState<SelectionInfo | null>(null);
    const waterRepresentationRef = useRef<string | null>(null);
    const selectionSubscriptionRef = useRef<any>(null);
    const originalRepresentationsRef = useRef<string[]>([]);
    const selectionOnlyModeRef = useRef<boolean>(false);
    
    // Enhanced state management
    const mountedRef = useRef<boolean>(true);
    const initializingRef = useRef<boolean>(false);
    const instanceIdRef = useRef<string>(`molstar-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    const disposalTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const renderTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Debug logging function
    const debugLog = useCallback((message: string, type: 'info' | 'warning' | 'error' = 'info') => {
      const timestamp = new Date().toISOString().substr(11, 12);
      const logMessage = `[${timestamp}] ${message}`;
      console.log(`🔬 ${logMessage}`);
      
      if (type === 'error') {
        setDebugInfo(prev => `${prev}\n❌ ${logMessage}`);
      } else if (type === 'warning') {
        setDebugInfo(prev => `${prev}\n⚠️ ${logMessage}`);
      } else {
        setDebugInfo(prev => `${prev}\n✅ ${logMessage}`);
      }
    }, []);

    // Validate plugin and canvas state
    const validatePluginState = useCallback((): boolean => {
      if (!pluginRef.current) {
        debugLog('Plugin not initialized', 'warning');
        return false;
      }

      if (!containerRef.current) {
        debugLog('Container not available', 'warning');
        return false;
      }

      // Check if canvas exists and is visible
      const canvas = containerRef.current.querySelector('canvas');
      if (!canvas) {
        debugLog('Canvas element not found in container', 'warning');
        return false;
      }

      const canvasStyle = window.getComputedStyle(canvas);
      if (canvasStyle.display === 'none' || canvasStyle.visibility === 'hidden') {
        debugLog('Canvas is hidden by CSS', 'warning');
        return false;
      }

      if (canvas.width === 0 || canvas.height === 0) {
        debugLog(`Canvas has zero dimensions: ${canvas.width}x${canvas.height}`, 'warning');
        return false;
      }

      debugLog(`Plugin state valid - Canvas: ${canvas.width}x${canvas.height}`, 'info');
      return true;
    }, [debugLog]);

    // Force rerender of the plugin
    const forceRerender = useCallback(async (): Promise<void> => {
      if (!pluginRef.current) return;

      try {
        debugLog('Forcing plugin rerender');
        
        // Trigger a resize event to force canvas redraw
        await PluginCommands.Camera.Reset(pluginRef.current);
        
        // Force canvas resize
        if (containerRef.current) {
          const resizeEvent = new Event('resize');
          window.dispatchEvent(resizeEvent);
        }

        debugLog('Plugin rerender completed');
      } catch (error) {
        debugLog(`Rerender failed: ${error}`, 'error');
      }
    }, [debugLog]);

    // Create the plugin specification with minimal UI
    const createSpec = useCallback(() => {
      const spec = DefaultPluginUISpec();
      spec.layout = {
        initial: {
          isExpanded: false,
          showControls: false,
          regionState: {
            bottom: 'hidden',
            left: 'hidden',
            right: 'hidden',
            top: 'hidden',
          }
        }
      };
      spec.config = [
        [PluginConfig.Viewport.ShowExpand, false],
        [PluginConfig.Viewport.ShowControls, false],
        [PluginConfig.Viewport.ShowSettings, false],
        [PluginConfig.Viewport.ShowSelectionMode, false],
        [PluginConfig.Viewport.ShowAnimation, false]
      ];
      return spec;
    }, []);

    // Extract selection information with comprehensive error handling
    const extractSelectionInfo = useCallback((location: StructureElement.Location): SelectionInfo | null => {
      try {
        debugLog('Extracting selection info from location');
        
        if (!location || !location.unit || !location.structure) {
          debugLog('Invalid location structure', 'warning');
          return null;
        }
        
        const residueName = StructureProperties.residue.label_comp_id(location);
        const residueNumber = StructureProperties.residue.label_seq_id(location);
        const chainId = StructureProperties.chain.label_asym_id(location);
        const atomName = StructureProperties.atom.label_atom_id(location);
        const elementType = StructureProperties.atom.type_symbol(location);

        debugLog(`Extracted properties: ${residueName} ${residueNumber} (Chain ${chainId})`);

        let coordinates;
        try {
          const unit = location.unit;
          const elementIndex = location.element;
          if (unit && unit.conformation && typeof elementIndex !== 'undefined') {
            const pos = unit.conformation.position(elementIndex, Vec3());
            coordinates = { x: pos[0], y: pos[1], z: pos[2] };
            debugLog(`Coordinates: (${coordinates.x.toFixed(2)}, ${coordinates.y.toFixed(2)}, ${coordinates.z.toFixed(2)})`);
          }
        } catch (e) {
          debugLog('Coordinates not available for selection', 'warning');
        }

        const description = `${residueName} ${residueNumber} (Chain ${chainId}) - ${atomName} atom`;

        const selectionInfo: SelectionInfo = {
          residueName,
          residueNumber,
          chainId,
          atomName,
          elementType,
          coordinates,
          atomCount: 1, // Will be updated later for multi-atom selections
          description
        };

        debugLog(`Successfully extracted selection info: ${description}`);
        return selectionInfo;

      } catch (error) {
        debugLog(`Error extracting selection info: ${error}`, 'error');
        return null;
      }
    }, [debugLog]);

    // Helper function to update selection state with mount checking
    const updateSelectionState = useCallback((selectionInfo: SelectionInfo | null) => {
      if (!mountedRef.current) {
        debugLog('Component unmounted - skipping selection update', 'warning');
        return;
      }
      
      debugLog('Updating selection state');
      setCurrentSelection(selectionInfo);
      onSelectionChange?.(selectionInfo);
      
      if (selectionInfo) {
        debugLog(`Selection state updated: ${selectionInfo.description}`);
      } else {
        debugLog('Selection state cleared');
      }
    }, [onSelectionChange, debugLog]);

    // Safe interaction event processing
    const processInteractionEvent = useCallback((eventData: any) => {
      if (!mountedRef.current) return;
      
      try {
        debugLog('Processing interaction event');
        
        // Safely check for loci in the event data
        let loci = null;
        
        if (eventData && eventData.current && eventData.current.loci) {
          loci = eventData.current.loci;
        } else if (eventData && eventData.loci) {
          loci = eventData.loci;
        } else {
          debugLog('No loci found in interaction event', 'warning');
          return;
        }
        
        if (!loci || !StructureElement.Loci.is(loci)) {
          debugLog('Invalid loci structure', 'warning');
          return;
        }
        
        if (loci.elements && loci.elements.length > 0) {
          const element = loci.elements[0];
          const structure = loci.structure;
          
          if (!structure || !structure.units || !structure.units[element.unit]) {
            debugLog('Invalid structure or unit', 'warning');
            return;
          }
          
          const unit = structure.units[element.unit];
          
          if (!element.indices || element.indices.length === 0) {
            debugLog('No indices in element', 'warning');
            return;
          }
          
          const atomIndex = element.indices[0];
          const elementIndex = unit.elements[atomIndex];
          
          if (typeof elementIndex === 'undefined') {
            debugLog('Invalid element index', 'warning');
            return;
          }
          
          const location = StructureElement.Location.create(structure, unit, elementIndex);
          
          const selectionInfo = extractSelectionInfo(location);
          if (selectionInfo) {
            const totalAtoms = loci.elements.reduce((acc: number, el: any) => acc + (el.indices?.length || 0), 0);
            selectionInfo.atomCount = totalAtoms;
            
            debugLog(`Selection processed from interaction: ${selectionInfo.description}`);
            updateSelectionState(selectionInfo);
          }
        }
      } catch (error) {
        debugLog(`Error processing interaction event: ${error}`, 'error');
      }
    }, [extractSelectionInfo, updateSelectionState, debugLog]);

    // Robust selection monitoring setup
    const setupSelectionMonitoring = useCallback((plugin: PluginContext) => {
      debugLog('Setting up enhanced selection monitoring');
      
      // Clean up previous subscriptions
      if (selectionSubscriptionRef.current) {
        try {
          selectionSubscriptionRef.current.unsubscribe();
          selectionSubscriptionRef.current = null;
        } catch (error) {
          debugLog(`Error cleaning up previous subscriptions: ${error}`, 'warning');
        }
      }

      try {
        // Method 1: Listen to structure selection manager changes
        const selectionSubscription = plugin.managers.structure.selection.events.changed.subscribe(() => {
          if (!mountedRef.current) return;
          
          debugLog('Structure selection manager event fired');
          
          try {
            const manager = plugin.managers.structure.selection;
            
            if (manager.entries && manager.entries.length > 0) {
              const entry = manager.entries[0];
              if (entry && entry.selection && StructureElement.Loci.is(entry.selection)) {
                processInteractionEvent({ loci: entry.selection });
              }
            } else {
              debugLog('Selection cleared via selection manager');
              updateSelectionState(null);
            }
          } catch (error) {
            debugLog(`Error processing selection manager event: ${error}`, 'error');
          }
        });

        // Method 2: Listen to click interactions as backup
        const clickSubscription = plugin.behaviors.interaction.click.subscribe((event) => {
          if (!mountedRef.current) return;
          
          debugLog('Click interaction event fired');
          
          // Delay processing to allow selection to be processed
          setTimeout(() => {
            if (!mountedRef.current) return;
            
            try {
              const currentHighlights = plugin.managers.interactivity.lociHighlights.current;
              if (currentHighlights && currentHighlights.loci) {
                processInteractionEvent({ loci: currentHighlights.loci });
              }
            } catch (error) {
              debugLog(`Error processing click interaction: ${error}`, 'error');
            }
          }, 100);
        });

        // Store subscriptions for cleanup
        selectionSubscriptionRef.current = {
          unsubscribe: () => {
            try {
              selectionSubscription.unsubscribe();
              clickSubscription.unsubscribe();
            } catch (error) {
              debugLog(`Error unsubscribing from events: ${error}`, 'error');
            }
          }
        };

        debugLog('Enhanced selection monitoring setup complete');
        
      } catch (error) {
        debugLog(`Error setting up selection monitoring: ${error}`, 'error');
      }
    }, [processInteractionEvent, updateSelectionState, debugLog]);

    // Enhanced structure loading with detailed debugging
    const loadStructure = useCallback(async (url: string, format: string = 'pdb') => {
      debugLog(`🔄 Starting structure load: ${url} (format: ${format})`);
      
      if (!pluginRef.current || !mountedRef.current) {
        const error = 'Plugin not available or component unmounted';
        debugLog(error, 'error');
        setStructureLoadError(error);
        return;
      }

      try {
        setIsLoading(true);
        setStructureLoadError(null);
        setHasStructure(false);
        
        debugLog('Clearing existing structures');
        
        // Clear existing structures and reset selection
        try {
          await PluginCommands.State.RemoveObject(pluginRef.current, { 
            state: pluginRef.current.state.data, 
            ref: pluginRef.current.state.data.tree.root.ref
          });
          debugLog('Existing structures cleared');
        } catch (error) {
          debugLog(`Warning during structure clear: ${error}`, 'warning');
        }
        
        waterRepresentationRef.current = null;
        updateSelectionState(null);
        selectionOnlyModeRef.current = false;
        originalRepresentationsRef.current = [];

        debugLog('Downloading structure data');
        
        // Download and load the structure with enhanced error handling
        const data = await pluginRef.current.builders.data.download(
          { url: Asset.Url(url) }, 
          { state: { isGhost: false } }
        );
        
        if (!data || !data.obj) {
          throw new Error('Failed to download structure data');
        }
        
        debugLog('Structure data downloaded successfully');
        
        debugLog('Parsing trajectory');
        const trajectory = await pluginRef.current.builders.structure.parseTrajectory(data, format as any);
        
        if (!trajectory || !trajectory.obj) {
          throw new Error('Failed to parse trajectory');
        }
        
        debugLog('Trajectory parsed successfully');
        
        debugLog('Creating model');
        const model = await pluginRef.current.builders.structure.createModel(trajectory);
        
        if (!model || !model.obj) {
          throw new Error('Failed to create model');
        }
        
        debugLog('Model created successfully');
        
        debugLog('Creating structure');
        const structure = await pluginRef.current.builders.structure.createStructure(model);
        
        if (!structure || !structure.obj) {
          throw new Error('Failed to create structure');
        }
        
        debugLog('Structure created successfully');
        
        debugLog('Adding cartoon representation');
        
        // Create default representation with enhanced validation
        const representation = await pluginRef.current.builders.structure.representation.addRepresentation(structure, {
          type: 'cartoon',
          color: 'chain-id'
        });
        
        if (!representation) {
          throw new Error('Failed to create representation');
        }
        
        debugLog('Cartoon representation added successfully');

        // Focus the camera on the structure
        debugLog('Resetting camera');
        await PluginCommands.Camera.Reset(pluginRef.current);
        
        // Force a rerender to ensure visibility
        debugLog('Forcing rerender');
        setTimeout(() => {
          forceRerender();
        }, 100);
        
        setHasStructure(true);
        debugLog('✅ Structure loaded successfully and should be visible');
        
        // Validate that we can see the structure
        setTimeout(() => {
          const isValid = validatePluginState();
          if (!isValid) {
            debugLog('Plugin state validation failed after loading', 'warning');
          }
        }, 500);
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        debugLog(`❌ Failed to load structure: ${errorMessage}`, 'error');
        setStructureLoadError(errorMessage);
        setHasStructure(false);
        onError?.(error as Error);
      } finally {
        setIsLoading(false);
      }
    }, [onError, updateSelectionState, debugLog, forceRerender, validatePluginState]);

    // Comprehensive cleanup function
    const cleanupPlugin = useCallback(() => {
      debugLog('🧹 Starting comprehensive plugin cleanup');
      
      // Clear any pending timeouts
      if (disposalTimeoutRef.current) {
        clearTimeout(disposalTimeoutRef.current);
        disposalTimeoutRef.current = null;
      }
      
      if (renderTimeoutRef.current) {
        clearTimeout(renderTimeoutRef.current);
        renderTimeoutRef.current = null;
      }
      
      // Set mounted to false immediately
      mountedRef.current = false;
      
      // Remove instance from global registry
      const instanceId = instanceIdRef.current;
      if (MOLSTAR_INSTANCES.has(instanceId)) {
        MOLSTAR_INSTANCES.delete(instanceId);
        debugLog(`Removed instance ${instanceId} from registry`);
      }
      
      // Clean up subscriptions
      if (selectionSubscriptionRef.current) {
        try {
          selectionSubscriptionRef.current.unsubscribe();
          selectionSubscriptionRef.current = null;
          debugLog('Selection subscriptions cleaned up');
        } catch (error) {
          debugLog(`Error cleaning up subscriptions: ${error}`, 'warning');
        }
      }
      
      // Clean up global molstar reference if it's ours
      if ((window as any).molstar && (window as any).molstar._instanceId === instanceId) {
        (window as any).molstar = null;
        debugLog('Global molstar reference cleared');
      }
      
      // Dispose of plugin with proper error handling
      if (pluginRef.current) {
        try {
          // Try graceful disposal first
          pluginRef.current.dispose();
          debugLog('Plugin disposed gracefully');
        } catch (error) {
          debugLog(`Error during plugin disposal: ${error}`, 'warning');
          // Force cleanup even if disposal fails
        } finally {
          pluginRef.current = null;
        }
      }
      
      // Force clear container with multiple attempts
      if (containerRef.current) {
        try {
          // Method 1: Clear innerHTML
          containerRef.current.innerHTML = '';
          
          // Method 2: Remove all child nodes
          while (containerRef.current.firstChild) {
            containerRef.current.removeChild(containerRef.current.firstChild);
          }
          
          // Method 3: Reset any data attributes
          Array.from(containerRef.current.attributes).forEach(attr => {
            if (attr.name.startsWith('data-')) {
              containerRef.current?.removeAttribute(attr.name);
            }
          });
          
          debugLog('Container completely cleared');
        } catch (error) {
          debugLog(`Error clearing container: ${error}`, 'warning');
        }
      }
      
      // Reset all state
      setIsInitialized(false);
      setIsLoading(false);
      setHasStructure(false);
      setStructureLoadError(null);
      setCurrentSelection(null);
      waterRepresentationRef.current = null;
      originalRepresentationsRef.current = [];
      selectionOnlyModeRef.current = false;
      initializingRef.current = false;
      
      debugLog('Plugin cleanup completed');
    }, [debugLog]);

    // Enhanced initialization with prevention of multiple React roots
    const initializePlugin = useCallback(async () => {
      const instanceId = instanceIdRef.current;
      
      // Prevent multiple initializations
      if (!containerRef.current || pluginRef.current || initializingRef.current) {
        debugLog('Plugin initialization skipped - already initialized or in progress', 'warning');
        return;
      }

      // Check if component is still mounted
      if (!mountedRef.current) {
        debugLog('Plugin initialization skipped - component unmounted', 'warning');
        return;
      }

      // Check if this instance is already in the registry
      if (MOLSTAR_INSTANCES.has(instanceId)) {
        debugLog('Plugin initialization skipped - instance already exists', 'warning');
        return;
      }

      try {
        debugLog(`🚀 Starting plugin initialization for instance: ${instanceId}`);
        initializingRef.current = true;
        setIsLoading(true);
        setDebugInfo(''); // Clear debug info
        
        // Add to registry immediately
        MOLSTAR_INSTANCES.add(instanceId);
        
        // Force clear container to prevent React root conflicts
        if (containerRef.current) {
          // Clear completely - this is critical for preventing the React root error
          containerRef.current.innerHTML = '';
          
          // Remove any React-specific attributes that might cause conflicts
          Array.from(containerRef.current.attributes).forEach(attr => {
            if (attr.name.startsWith('data-react') || attr.name.startsWith('data-molstar')) {
              containerRef.current?.removeAttribute(attr.name);
            }
          });
          
          // Add a small delay to ensure DOM is completely clear
          await new Promise(resolve => setTimeout(resolve, 100));
          
          debugLog('Container cleared and ready');
        }
        
        // Check mount status after delay
        if (!mountedRef.current) {
          debugLog('Component unmounted during initialization delay', 'warning');
          MOLSTAR_INSTANCES.delete(instanceId);
          return;
        }
        
        const spec = createSpec();
        debugLog('Plugin spec created');
        
        // Create plugin with enhanced error handling
        debugLog('Creating Molstar plugin UI');
        const plugin = await createPluginUI({
          target: containerRef.current,
          render: renderReact18,
          spec
        });
        
        // Check if component is still mounted after async operation
        if (!mountedRef.current) {
          debugLog('Component unmounted during plugin creation - cleaning up', 'warning');
          try {
            plugin.dispose();
          } catch (e) {
            debugLog('Error disposing plugin during unmount cleanup', 'warning');
          }
          MOLSTAR_INSTANCES.delete(instanceId);
          return;
        }
        
        pluginRef.current = plugin;
        
        // Make molstar globally accessible with instance tracking
        (window as any).molstar = plugin;
        (window as any).molstar._instanceId = instanceId;
        debugLog('Molstar plugin initialized and made globally accessible');
        
        // Setup selection monitoring
        setupSelectionMonitoring(plugin);
        
        // Validate the plugin state
        setTimeout(() => {
          const isValid = validatePluginState();
          if (isValid) {
            debugLog('Plugin validation successful');
          } else {
            debugLog('Plugin validation failed', 'warning');
          }
        }, 200);
        
        setIsInitialized(true);
        onReady?.(plugin);
        debugLog('✅ Plugin initialization completed successfully');
        
      } catch (error) {
        debugLog(`❌ Failed to initialize molstar plugin: ${error}`, 'error');
        MOLSTAR_INSTANCES.delete(instanceId);
        onError?.(error as Error);
        initializingRef.current = false;
        setIsInitialized(false);
      } finally {
        setIsLoading(false);
        initializingRef.current = false;
      }
    }, [createSpec, onReady, onError, setupSelectionMonitoring, debugLog, validatePluginState]);

    // Other methods (keeping existing implementations for brevity)
    const clearSelection = useCallback(async (): Promise<void> => {
      try {
        (window as any).molstar?.managers.interactivity.lociSelects.clear();
        (window as any).molstar?.managers.interactivity.lociHighlights.clear();
        updateSelectionState(null);
        debugLog('Selection cleared');
      } catch (error) {
        debugLog(`Failed to clear selection: ${error}`, 'error');
        throw error;
      }
    }, [updateSelectionState, debugLog]);

    const resetView = useCallback(() => {
      if (!pluginRef.current) return;
      PluginCommands.Camera.Reset(pluginRef.current);
      debugLog('Camera view reset');
    }, [debugLog]);

    const zoomIn = useCallback(() => {
      if (!pluginRef.current) return;
      PluginCommands.Camera.Focus(pluginRef.current, { center: Vec3.create(0, 0, 0), radius: 20 });
      debugLog('Zoomed in');
    }, [debugLog]);

    const zoomOut = useCallback(() => {
      if (!pluginRef.current) return;
      PluginCommands.Camera.Focus(pluginRef.current, { center: Vec3.create(0, 0, 0), radius: 50 });
      debugLog('Zoomed out');
    }, [debugLog]);

    const setRepresentation = useCallback(async (type: 'cartoon' | 'surface' | 'ball-and-stick' | 'spacefill') => {
      if (!pluginRef.current) return;

      try {
        debugLog(`Changing representation to: ${type}`);
        
        const reprs = pluginRef.current.state.data.select(StateSelection.Generators.ofType(PluginStateObject.Molecule.Structure.Representation3D));
        for (const repr of reprs) {
          await PluginCommands.State.RemoveObject(pluginRef.current, { state: pluginRef.current.state.data, ref: repr.transform.ref });
        }

        const structures = pluginRef.current.state.data.select(StateSelection.Generators.ofType(PluginStateObject.Molecule.Structure));
        if (structures.length === 0) return;

        const reprType = type === 'ball-and-stick' ? 'ball-and-stick' : 
                        type === 'spacefill' ? 'spacefill' : 
                        type === 'surface' ? 'molecular-surface' : 'cartoon';

        await pluginRef.current.builders.structure.representation.addRepresentation(structures[0], {
          type: reprType,
          color: 'chain-id'
        });

        debugLog(`Representation changed to: ${type}`);

      } catch (error) {
        debugLog(`Failed to set representation: ${error}`, 'error');
        onError?.(error as Error);
      }
    }, [onError, debugLog]);

    // Placeholder implementations for other methods
    const showWaterMolecules = useCallback(async () => { throw new Error('Not implemented'); }, []);
    const hideWaterMolecules = useCallback(async () => { throw new Error('Not implemented'); }, []);
    const hideLigands = useCallback(async () => { throw new Error('Not implemented'); }, []);
    const focusOnChain = useCallback(async (chainId: string) => { throw new Error('Not implemented'); }, []);
    const getSelectionInfo = useCallback(async (): Promise<string> => { return 'Not implemented'; }, []);
    const showOnlySelected = useCallback(async () => { throw new Error('Not implemented'); }, []);
    const hideOnlySelected = useCallback(async () => { throw new Error('Not implemented'); }, []);
    const highlightChain = useCallback(async (chainId: string) => { throw new Error('Not implemented'); }, []);
    const clearHighlights = useCallback(async () => { throw new Error('Not implemented'); }, []);
    const getStructureInfo = useCallback(async (): Promise<string> => { return 'Not implemented'; }, []);
    const getCurrentSelection = useCallback(() => currentSelection, [currentSelection]);
    const selectResidueRange = useCallback(async (query: ResidueRangeQuery): Promise<string> => { throw new Error('Not implemented'); }, []);
    const selectResidue = useCallback(async (residueId: number, chainId?: string): Promise<string> => { throw new Error('Not implemented'); }, []);
    const getPlugin = useCallback(() => pluginRef.current, []);

    // Expose methods through ref
    React.useImperativeHandle(ref, () => ({
      loadStructure,
      resetView,
      zoomIn,
      zoomOut,
      setRepresentation,
      getPlugin,
      showWaterMolecules,
      hideWaterMolecules,
      hideLigands,
      focusOnChain,
      getSelectionInfo,
      showOnlySelected,
      hideOnlySelected,
      highlightChain,
      clearHighlights,
      getStructureInfo,
      getCurrentSelection,
      selectResidueRange,
      clearSelection,
      selectResidue,
      forceRerender,
      validatePluginState
    }), [
      loadStructure, resetView, zoomIn, zoomOut, setRepresentation, getPlugin,
      showWaterMolecules, hideWaterMolecules, hideLigands, focusOnChain, getSelectionInfo,
      showOnlySelected, hideOnlySelected, highlightChain, clearHighlights, getStructureInfo, getCurrentSelection,
      selectResidueRange, clearSelection, selectResidue, forceRerender, validatePluginState
    ]);

    // Enhanced mount and unmount handling
    useEffect(() => {
      // Set mounted flag
      mountedRef.current = true;
      debugLog('Component mounting - initializing plugin');
      
      // Delay initialization slightly to ensure DOM is ready
      const initTimeout = setTimeout(() => {
        if (mountedRef.current) {
          initializePlugin();
        }
      }, 200);

      // Cleanup function
      return () => {
        debugLog('Component unmounting - starting cleanup');
        
        // Clear initialization timeout if still pending
        clearTimeout(initTimeout);
        
        // Schedule cleanup with a small delay to ensure all async operations complete
        disposalTimeoutRef.current = setTimeout(() => {
          cleanupPlugin();
        }, 100);
      };
    }, [initializePlugin, cleanupPlugin, debugLog]);

    return (
      <div className={cn("relative w-full h-full", className)}>
        {/* CRITICAL FIX: Molstar container with constrained dimensions */}
        <div 
          ref={containerRef} 
          className="w-full h-full rounded-lg overflow-hidden bg-gray-900 border border-gray-700"
          style={{ 
            minHeight: '400px',
            maxWidth: '100%',
            maxHeight: '100%',
            pointerEvents: 'auto' // Ensure container can receive events
          }}
          data-molstar-container={instanceIdRef.current}
        />
        
        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-gray-900/50 flex items-center justify-center rounded-lg z-10">
            <div className="flex flex-col items-center space-y-3 text-white">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="text-sm">Loading structure...</span>
              {debugInfo && (
                <div className="max-w-md text-xs text-gray-300 bg-gray-800/50 p-2 rounded border max-h-24 overflow-y-auto">
                  <pre className="whitespace-pre-wrap">{debugInfo.split('\n').slice(-5).join('\n')}</pre>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error overlay */}
        {structureLoadError && (
          <div className="absolute inset-0 bg-red-900/20 flex items-center justify-center rounded-lg z-10">
            <div className="bg-red-800/90 text-white p-4 rounded-lg max-w-md">
              <div className="flex items-center space-x-2 mb-2">
                <AlertTriangle className="h-5 w-5" />
                <span className="font-semibold">Structure Load Error</span>
              </div>
              <p className="text-sm mb-3">{structureLoadError}</p>
              {debugInfo && (
                <details className="text-xs">
                  <summary className="cursor-pointer">Debug Info</summary>
                  <pre className="mt-2 whitespace-pre-wrap bg-red-900/50 p-2 rounded max-h-32 overflow-y-auto">
                    {debugInfo}
                  </pre>
                </details>
              )}
            </div>
          </div>
        )}

        {/* No structure message */}
        {isInitialized && !isLoading && !hasStructure && !structureLoadError && (
          <div className="absolute inset-0 bg-gray-800/20 flex items-center justify-center rounded-lg z-10">
            <div className="text-center text-gray-400">
              <div className="text-sm">No structure loaded</div>
              <div className="text-xs mt-1">Use the sidebar to load a protein structure</div>
            </div>
          </div>
        )}

        {/* Basic controls overlay - FIXED: Proper z-index and pointer events */}
        {isInitialized && !isLoading && hasStructure && (
          <div className="absolute top-4 right-4 flex flex-col space-y-2 z-20" style={{ pointerEvents: 'auto' }}>
            <Button
              size="sm"
              variant="secondary"
              onClick={resetView}
              className="bg-gray-800/90 hover:bg-gray-700 text-white border-gray-600 pointer-events-auto"
              title="Reset View"
            >
              <Home className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={zoomIn}
              className="bg-gray-800/90 hover:bg-gray-700 text-white border-gray-600 pointer-events-auto"
              title="Zoom In"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={zoomOut}
              className="bg-gray-800/90 hover:bg-gray-700 text-white border-gray-600 pointer-events-auto"
              title="Zoom Out"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={forceRerender}
              className="bg-gray-800/90 hover:bg-gray-700 text-white border-gray-600 pointer-events-auto"
              title="Force Rerender"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Selection info overlay - FIXED: Proper z-index */}
        {currentSelection && (
          <div className="absolute bottom-4 left-4 right-4 z-20" style={{ pointerEvents: 'none' }}>
            <Card className="bg-gray-800/90 border-gray-600 backdrop-blur-sm pointer-events-auto">
              <div className="p-3">
                <p className="text-white text-sm font-medium">
                  Selected: {currentSelection.description}
                </p>
                {currentSelection.coordinates && (
                  <p className="text-gray-400 text-xs mt-1">
                    Position: ({currentSelection.coordinates.x.toFixed(2)}, {currentSelection.coordinates.y.toFixed(2)}, {currentSelection.coordinates.z.toFixed(2)})
                  </p>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* Debug info panel (only in development) */}
        {process.env.NODE_ENV === 'development' && debugInfo && (
          <div className="absolute top-4 left-4 max-w-sm z-30" style={{ pointerEvents: 'auto' }}>
            <details className="bg-gray-800/90 text-white p-2 rounded text-xs border border-gray-600">
              <summary className="cursor-pointer">Debug Info ({debugInfo.split('\n').length} lines)</summary>
              <pre className="mt-2 whitespace-pre-wrap max-h-40 overflow-y-auto">
                {debugInfo}
              </pre>
            </details>
          </div>
        )}
      </div>
    );
  }
);

MolstarViewer.displayName = 'MolstarViewer';

export default MolstarViewer;