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
import { MolScriptBuilder as MS } from 'molstar/lib/mol-script/language/builder';
import { StructureSelection } from 'molstar/lib/mol-model/structure/query';
import { compile } from 'molstar/lib/mol-script/runtime/query/compiler';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Loader2, RotateCcw, Home, ZoomIn, ZoomOut, AlertTriangle, RefreshCw } from 'lucide-react';
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

// Global instance tracking to prevent conflicts
const ACTIVE_INSTANCES = new Map<string, PluginContext>();
let globalInitializationLock = false;

const MolstarViewer = React.forwardRef<ViewerControls, MolstarViewerProps>(
  ({ className, onReady, onError, onSelectionChange }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const pluginRef = useRef<PluginContext | null>(null);
    const instanceIdRef = useRef<string>(`molstar-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    const initializationAttempts = useRef<number>(0);
    const maxInitializationAttempts = 3;
    
    // State management
    const [isLoading, setIsLoading] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);
    const [hasStructure, setHasStructure] = useState(false);
    const [initializationError, setInitializationError] = useState<string | null>(null);
    const [structureLoadError, setStructureLoadError] = useState<string | null>(null);
    const [currentSelection, setCurrentSelection] = useState<SelectionInfo | null>(null);
    
    // Refs for cleanup and state tracking
    const mountedRef = useRef<boolean>(true);
    const waterRepresentationRef = useRef<string | null>(null);
    const selectionSubscriptionRef = useRef<any>(null);
    const disposalTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const initTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Enhanced debug logging with initialization tracking
    const debugLog = useCallback((message: string, type: 'info' | 'warning' | 'error' = 'info') => {
      const timestamp = new Date().toISOString().substr(11, 12);
      const instanceId = instanceIdRef.current.substr(-6);
      const logMessage = `[${timestamp}][${instanceId}] ${message}`;
      
      const emoji = type === 'error' ? '❌' : type === 'warning' ? '⚠️' : '✅';
      console.log(`${emoji} ${logMessage}`);
    }, []);

    // CRITICAL FIX: Wait for DOM to be completely ready
    const waitForDOMReady = useCallback((): Promise<void> => {
      return new Promise((resolve) => {
        if (document.readyState === 'complete') {
          resolve();
          return;
        }
        
        const checkReady = () => {
          if (document.readyState === 'complete') {
            resolve();
          } else {
            setTimeout(checkReady, 10);
          }
        };
        
        checkReady();
      });
    }, []);

    // CRITICAL FIX: Ensure container is completely clean before initialization
    const prepareContainer = useCallback(async (): Promise<boolean> => {
      if (!containerRef.current || !mountedRef.current) {
        debugLog('Container not available or component unmounted', 'warning');
        return false;
      }

      try {
        debugLog('Preparing container for initialization');
        
        // Force complete cleanup of container
        const container = containerRef.current;
        
        // Remove all children with multiple methods
        while (container.firstChild) {
          container.removeChild(container.firstChild);
        }
        container.innerHTML = '';
        
        // Remove any molstar-specific attributes
        Array.from(container.attributes).forEach(attr => {
          if (attr.name.startsWith('data-molstar') || 
              attr.name.startsWith('data-plugin') ||
              attr.name.startsWith('data-react')) {
            container.removeAttribute(attr.name);
          }
        });
        
        // Reset container styles to ensure proper rendering
        container.style.cssText = '';
        container.className = 'w-full h-full rounded-lg overflow-hidden bg-gray-900 border border-gray-700';
        
        // Ensure container has proper dimensions
        const rect = container.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          debugLog(`Container has zero dimensions: ${rect.width}x${rect.height}`, 'warning');
          // Force dimensions
          container.style.width = '100%';
          container.style.height = '100%';
          container.style.minHeight = '400px';
          
          // Wait for layout
          await new Promise(resolve => requestAnimationFrame(resolve));
        }
        
        debugLog(`Container prepared - Dimensions: ${rect.width}x${rect.height}`);
        return true;
        
      } catch (error) {
        debugLog(`Error preparing container: ${error}`, 'error');
        return false;
      }
    }, [debugLog]);

    // CRITICAL FIX: Enhanced plugin initialization with proper error handling
    const initializePlugin = useCallback(async (isRetry: boolean = false): Promise<void> => {
      const instanceId = instanceIdRef.current;
      
      // Prevent multiple concurrent initializations
      if (globalInitializationLock && !isRetry) {
        debugLog('Initialization already in progress globally, waiting...', 'warning');
        await new Promise(resolve => setTimeout(resolve, 500));
        if (!mountedRef.current) return;
      }

      // Check if already initialized
      if (pluginRef.current && isInitialized) {
        debugLog('Plugin already initialized', 'warning');
        return;
      }

      // Check mount status
      if (!mountedRef.current) {
        debugLog('Component unmounted during initialization attempt', 'warning');
        return;
      }

      // Check retry attempts
      if (initializationAttempts.current >= maxInitializationAttempts) {
        const error = `Failed to initialize Molstar after ${maxInitializationAttempts} attempts`;
        debugLog(error, 'error');
        setInitializationError(error);
        onError?.(new Error(error));
        return;
      }

      try {
        debugLog(`🚀 Starting plugin initialization (attempt ${initializationAttempts.current + 1}/${maxInitializationAttempts})`);
        initializationAttempts.current++;
        
        globalInitializationLock = true;
        setIsLoading(true);
        setInitializationError(null);

        // Wait for DOM to be completely ready
        await waitForDOMReady();
        
        if (!mountedRef.current) {
          debugLog('Component unmounted during DOM wait', 'warning');
          return;
        }

        // Prepare container
        const containerReady = await prepareContainer();
        if (!containerReady) {
          throw new Error('Container preparation failed');
        }

        // Additional wait to ensure container is stable
        await new Promise(resolve => setTimeout(resolve, 100));
        
        if (!mountedRef.current) {
          debugLog('Component unmounted during container preparation', 'warning');
          return;
        }

        // Check for existing instance and clean up
        if (ACTIVE_INSTANCES.has(instanceId)) {
          debugLog('Cleaning up existing instance', 'warning');
          const existingPlugin = ACTIVE_INSTANCES.get(instanceId);
          try {
            existingPlugin?.dispose();
          } catch (e) {
            debugLog(`Warning during existing plugin disposal: ${e}`, 'warning');
          }
          ACTIVE_INSTANCES.delete(instanceId);
        }

        // Create plugin specification
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

        debugLog('Creating Molstar plugin with prepared container');
        
        // CRITICAL: Use a timeout to catch initialization hangs
        const initPromise = createPluginUI({
          target: containerRef.current!,
          render: renderReact18,
          spec
        });

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Plugin initialization timeout (10s)')), 10000);
        });

        const plugin = await Promise.race([initPromise, timeoutPromise]);

        // Final mount check after async operation
        if (!mountedRef.current) {
          debugLog('Component unmounted during plugin creation - cleaning up', 'warning');
          try {
            plugin.dispose();
          } catch (e) {
            debugLog('Error disposing plugin during unmount cleanup', 'warning');
          }
          return;
        }

        // Store plugin references
        pluginRef.current = plugin;
        ACTIVE_INSTANCES.set(instanceId, plugin);

        // Set up selection monitoring
        setupSelectionMonitoring(plugin);

        // Validate plugin state
        const isValid = validatePluginState();
        if (!isValid) {
          throw new Error('Plugin state validation failed after initialization');
        }

        setIsInitialized(true);
        setInitializationError(null);
        initializationAttempts.current = 0; // Reset on success
        
        debugLog('✅ Plugin initialization completed successfully');
        onReady?.(plugin);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown initialization error';
        debugLog(`❌ Plugin initialization failed: ${errorMessage}`, 'error');
        
        setInitializationError(errorMessage);
        setIsInitialized(false);
        
        // Clean up failed initialization
        if (pluginRef.current) {
          try {
            pluginRef.current.dispose();
          } catch (e) {
            debugLog('Error disposing failed plugin', 'warning');
          }
          pluginRef.current = null;
        }
        
        ACTIVE_INSTANCES.delete(instanceId);
        
        // Retry after a delay if we haven't exceeded max attempts
        if (initializationAttempts.current < maxInitializationAttempts && mountedRef.current) {
          debugLog(`Retrying initialization in 1 second (attempt ${initializationAttempts.current + 1}/${maxInitializationAttempts})`);
          initTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
              initializePlugin(true);
            }
          }, 1000);
        } else {
          onError?.(error as Error);
        }
        
      } finally {
        globalInitializationLock = false;
        setIsLoading(false);
      }
    }, [waitForDOMReady, prepareContainer, debugLog, onReady, onError]);

    // Manual retry function
    const retryInitialization = useCallback(() => {
      debugLog('Manual retry requested - resetting attempts counter');
      initializationAttempts.current = 0;
      setInitializationError(null);
      setIsInitialized(false);
      initializePlugin(true);
    }, [initializePlugin, debugLog]);

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

    // Enhanced selection monitoring
    const setupSelectionMonitoring = useCallback((plugin: PluginContext) => {
      debugLog('Setting up selection monitoring');
      
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
        // Subscribe to selection changes
        const selectionSubscription = plugin.managers.structure.selection.events.changed.subscribe(() => {
          if (!mountedRef.current) return;
          
          try {
            const manager = plugin.managers.structure.selection;
            if (manager.entries && manager.entries.length > 0) {
              const entry = manager.entries[0];
              if (entry && entry.selection && StructureElement.Loci.is(entry.selection)) {
                // Process selection info
                const selectionInfo = extractSelectionInfo(entry.selection, entry.structure);
                setCurrentSelection(selectionInfo);
                onSelectionChange?.(selectionInfo);
              }
            } else {
              setCurrentSelection(null);
              onSelectionChange?.(null);
            }
          } catch (error) {
            debugLog(`Error processing selection: ${error}`, 'error');
          }
        });

        selectionSubscriptionRef.current = {
          unsubscribe: () => {
            try {
              selectionSubscription.unsubscribe();
            } catch (error) {
              debugLog(`Error unsubscribing: ${error}`, 'error');
            }
          }
        };

        debugLog('Selection monitoring setup complete');
        
      } catch (error) {
        debugLog(`Error setting up selection monitoring: ${error}`, 'error');
      }
    }, [onSelectionChange, debugLog]);

    // Extract selection information from loci
    const extractSelectionInfo = useCallback((loci: any, structure: any): SelectionInfo | null => {
      try {
        if (!loci.elements || loci.elements.length === 0) return null;
        
        const element = loci.elements[0];
        const unit = structure.units[element.unit];
        const atomIndex = element.indices[0];
        const elementIndex = unit.elements[atomIndex];
        
        const location = StructureElement.Location.create(structure, unit, elementIndex);
        
        const residueName = StructureProperties.residue.label_comp_id(location);
        const residueNumber = StructureProperties.residue.label_seq_id(location);
        const chainId = StructureProperties.chain.label_asym_id(location);
        const atomName = StructureProperties.atom.label_atom_id(location);
        const elementType = StructureProperties.atom.type_symbol(location);
        
        let coordinates;
        try {
          const pos = unit.conformation.position(elementIndex, Vec3());
          coordinates = { x: pos[0], y: pos[1], z: pos[2] };
        } catch (e) {
          // Coordinates not available
        }
        
        return {
          residueName,
          residueNumber,
          chainId,
          atomName,
          elementType,
          coordinates,
          atomCount: loci.elements.reduce((acc: number, el: any) => acc + (el.indices?.length || 0), 0),
          description: `${residueName} ${residueNumber} (Chain ${chainId}) - ${atomName} atom`
        };
      } catch (error) {
        debugLog(`Error extracting selection info: ${error}`, 'error');
        return null;
      }
    }, [debugLog]);

    // Helper function to get the current structure
    const getCurrentStructure = useCallback(() => {
      if (!pluginRef.current) {
        debugLog('Plugin not available for structure access', 'warning');
        return null;
      }

      try {
        const structures = pluginRef.current.state.data.select(StateSelection.Generators.ofType(PluginStateObject.Molecule.Structure));
        if (structures.length === 0) {
          debugLog('No structures found in plugin state', 'warning');
          return null;
        }
        
        return structures[0].obj?.data;
      } catch (error) {
        debugLog(`Error getting current structure: ${error}`, 'error');
        return null;
      }
    }, [debugLog]);

    // FIXED: Implement selectResidue method with defensive checks
    const selectResidue = useCallback(async (residueId: number, chainId?: string): Promise<string> => {
      debugLog(`Selecting residue ${residueId}${chainId ? ` in chain ${chainId}` : ''}`);
      
      if (!pluginRef.current) {
        throw new Error('Plugin not initialized');
      }

      const structure = getCurrentStructure();
      if (!structure) {
        throw new Error('No structure loaded');
      }

      try {
        // CRITICAL FIX: Add defensive checks for MolScript properties
        if (!MS.struct || !MS.struct.atomProperty || !MS.struct.atomProperty.residue) {
          throw new Error('MolScript properties not properly initialized - residue properties not available');
        }

        if (!MS.struct.atomProperty.residue.label_seq_id) {
          throw new Error('MolScript residue label_seq_id property not available');
        }

        if (chainId && (!MS.struct.atomProperty.chain || !MS.struct.atomProperty.chain.label_asym_id)) {
          throw new Error('MolScript chain properties not available');
        }

        // Build the selection query using correct property names
        let query;
        if (chainId) {
          // Select specific residue in specific chain
          query = MS.struct.generator.atomGroups({
            'residue-test': MS.core.rel.eq([MS.struct.atomProperty.residue.label_seq_id(), residueId]),
            'chain-test': MS.core.rel.eq([MS.struct.atomProperty.chain.label_asym_id(), chainId])
          });
        } else {
          // Select residue in any chain
          query = MS.struct.generator.atomGroups({
            'residue-test': MS.core.rel.eq([MS.struct.atomProperty.residue.label_seq_id(), residueId])
          });
        }

        // Execute the selection using correct Molstar API
        const compiled = compile(query);
        const result = compiled(structure);
        
        // CRITICAL FIX: Check if selection is empty
        if (!result || (result.elements && result.elements.length === 0)) {
          const message = `Residue ${residueId}${chainId ? ` in chain ${chainId}` : ''} not found in the structure`;
          debugLog(message, 'warning');
          return message;
        }

        const selection = StructureSelection.toLociWithSourceUnits(result);

        // Apply the selection
        await pluginRef.current.managers.structure.selection.fromLoci('add', selection);

        // Focus on the selection
        await PluginCommands.Camera.Focus(pluginRef.current, { 
          loci: selection,
          minRadius: 5,
          extraRadius: 0
        });

        const message = `Selected residue ${residueId}${chainId ? ` in chain ${chainId}` : ''}`;
        debugLog(message);
        return message;
        
      } catch (error) {
        const errorMessage = `Failed to select residue: ${error instanceof Error ? error.message : 'Unknown error'}`;
        debugLog(errorMessage, 'error');
        throw new Error(errorMessage);
      }
    }, [debugLog, getCurrentStructure]);

    // FIXED: Implement selectResidueRange method with defensive checks
    const selectResidueRange = useCallback(async (query: ResidueRangeQuery): Promise<string> => {
      debugLog(`Selecting residue range ${query.startResidue}-${query.endResidue} in chain ${query.chainId}`);
      
      if (!pluginRef.current) {
        throw new Error('Plugin not initialized');
      }

      const structure = getCurrentStructure();
      if (!structure) {
        throw new Error('No structure loaded');
      }

      try {
        // CRITICAL FIX: Add defensive checks for MolScript properties
        if (!MS.struct || !MS.struct.atomProperty || !MS.struct.atomProperty.residue) {
          throw new Error('MolScript properties not properly initialized - residue properties not available');
        }

        if (!MS.struct.atomProperty.residue.label_seq_id) {
          throw new Error('MolScript residue label_seq_id property not available');
        }

        if (!MS.struct.atomProperty.chain || !MS.struct.atomProperty.chain.label_asym_id) {
          throw new Error('MolScript chain properties not available');
        }

        // Build the selection query for residue range using correct property names
        const rangeQuery = MS.struct.generator.atomGroups({
          'residue-test': MS.core.rel.and([
            MS.core.rel.gr([MS.struct.atomProperty.residue.label_seq_id(), query.startResidue - 1]),
            MS.core.rel.le([MS.struct.atomProperty.residue.label_seq_id(), query.endResidue])
          ]),
          'chain-test': MS.core.rel.eq([MS.struct.atomProperty.chain.label_asym_id(), query.chainId])
        });

        // Execute the selection using correct Molstar API
        const compiled = compile(rangeQuery);
        const result = compiled(structure);
        
        // CRITICAL FIX: Check if selection is empty
        if (!result || (result.elements && result.elements.length === 0)) {
          const message = `Residue range ${query.startResidue}-${query.endResidue} in chain ${query.chainId} not found in the structure`;
          debugLog(message, 'warning');
          return message;
        }

        const selection = StructureSelection.toLociWithSourceUnits(result);

        // Apply the selection
        await pluginRef.current.managers.structure.selection.fromLoci('add', selection);

        // Focus on the selection
        await PluginCommands.Camera.Focus(pluginRef.current, { 
          loci: selection,
          minRadius: 10,
          extraRadius: 5
        });

        const message = `Selected residues ${query.startResidue}-${query.endResidue} in chain ${query.chainId}`;
        debugLog(message);
        return message;
        
      } catch (error) {
        const errorMessage = `Failed to select residue range: ${error instanceof Error ? error.message : 'Unknown error'}`;
        debugLog(errorMessage, 'error');
        throw new Error(errorMessage);
      }
    }, [debugLog, getCurrentStructure]);

    // Implement clearSelection method
    const clearSelection = useCallback(async (): Promise<void> => {
      debugLog('Clearing all selections');
      
      if (!pluginRef.current) {
        throw new Error('Plugin not initialized');
      }

      try {
        // Clear all selections using the plugin's selection manager
        await pluginRef.current.managers.structure.selection.clear();
        
        debugLog('All selections cleared successfully');
        
      } catch (error) {
        const errorMessage = `Failed to clear selections: ${error instanceof Error ? error.message : 'Unknown error'}`;
        debugLog(errorMessage, 'error');
        throw new Error(errorMessage);
      }
    }, [debugLog]);

    // Structure loading
    const loadStructure = useCallback(async (url: string, format: string = 'pdb') => {
      debugLog(`🔄 Starting structure load: ${url}`);
      
      if (!pluginRef.current || !isInitialized) {
        throw new Error('Plugin not initialized. Cannot load structure.');
      }

      try {
        setIsLoading(true);
        setStructureLoadError(null);
        setHasStructure(false);
        
        // Clear existing structures
        await PluginCommands.State.RemoveObject(pluginRef.current, { 
          state: pluginRef.current.state.data, 
          ref: pluginRef.current.state.data.tree.root.ref
        });
        
        // Load structure
        const data = await pluginRef.current.builders.data.download({ url: Asset.Url(url) }, { state: { isGhost: false } });
        const trajectory = await pluginRef.current.builders.structure.parseTrajectory(data, format as any);
        const model = await pluginRef.current.builders.structure.createModel(trajectory);
        const structure = await pluginRef.current.builders.structure.createStructure(model);
        
        // Create representation
        await pluginRef.current.builders.structure.representation.addRepresentation(structure, {
          type: 'cartoon',
          color: 'chain-id'
        });

        // Reset camera
        await PluginCommands.Camera.Reset(pluginRef.current);
        
        setHasStructure(true);
        debugLog('✅ Structure loaded successfully');
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        debugLog(`❌ Failed to load structure: ${errorMessage}`, 'error');
        setStructureLoadError(errorMessage);
        throw error;
      } finally {
        setIsLoading(false);
      }
    }, [debugLog, isInitialized]);

    // Simple camera controls
    const resetView = useCallback(() => {
      if (pluginRef.current) {
        PluginCommands.Camera.Reset(pluginRef.current);
      }
    }, []);

    const zoomIn = useCallback(() => {
      if (pluginRef.current) {
        PluginCommands.Camera.Focus(pluginRef.current, { center: Vec3.create(0, 0, 0), radius: 20 });
      }
    }, []);

    const zoomOut = useCallback(() => {
      if (pluginRef.current) {
        PluginCommands.Camera.Focus(pluginRef.current, { center: Vec3.create(0, 0, 0), radius: 50 });
      }
    }, []);

    const setRepresentation = useCallback(async (type: 'cartoon' | 'surface' | 'ball-and-stick' | 'spacefill') => {
      if (!pluginRef.current) return;

      try {
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
      } catch (error) {
        debugLog(`Failed to set representation: ${error}`, 'error');
      }
    }, [debugLog]);

    const forceRerender = useCallback(async (): Promise<void> => {
      if (pluginRef.current) {
        await PluginCommands.Camera.Reset(pluginRef.current);
      }
    }, []);

    // Cleanup function
    const cleanup = useCallback(() => {
      debugLog('Starting cleanup');
      mountedRef.current = false;
      
      // Clear timeouts
      if (disposalTimeoutRef.current) {
        clearTimeout(disposalTimeoutRef.current);
        disposalTimeoutRef.current = null;
      }
      
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
        initTimeoutRef.current = null;
      }
      
      // Clean up subscriptions
      if (selectionSubscriptionRef.current) {
        try {
          selectionSubscriptionRef.current.unsubscribe();
          selectionSubscriptionRef.current = null;
        } catch (error) {
          debugLog(`Error cleaning up subscriptions: ${error}`, 'warning');
        }
      }
      
      // Dispose plugin
      const instanceId = instanceIdRef.current;
      if (pluginRef.current) {
        try {
          pluginRef.current.dispose();
          debugLog('Plugin disposed');
        } catch (error) {
          debugLog(`Error disposing plugin: ${error}`, 'warning');
        }
        pluginRef.current = null;
      }
      
      // Remove from global registry
      ACTIVE_INSTANCES.delete(instanceId);
      
      // Clear container
      if (containerRef.current) {
        try {
          containerRef.current.innerHTML = '';
        } catch (error) {
          debugLog(`Error clearing container: ${error}`, 'warning');
        }
      }
      
      debugLog('Cleanup completed');
    }, [debugLog]);

    // Placeholder implementations for remaining methods
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

    // Initialize plugin on mount
    useEffect(() => {
      mountedRef.current = true;
      debugLog('Component mounting - starting initialization');
      
      // Start initialization with a small delay to ensure DOM is ready
      const initTimeout = setTimeout(() => {
        if (mountedRef.current) {
          initializePlugin();
        }
      }, 100);

      return () => {
        clearTimeout(initTimeout);
        cleanup();
      };
    }, [initializePlugin, cleanup, debugLog]);

    return (
      <div className={cn("relative w-full h-full", className)}>
        {/* Molstar container */}
        <div 
          ref={containerRef} 
          className="w-full h-full rounded-lg overflow-hidden bg-gray-900 border border-gray-700"
          style={{ 
            minHeight: '400px',
            pointerEvents: 'auto',
            position: 'relative'
          }}
          data-molstar-instance={instanceIdRef.current}
        />
        
        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-gray-900/80 flex items-center justify-center rounded-lg z-20">
            <div className="flex flex-col items-center space-y-3 text-white">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="text-sm">
                {!isInitialized ? 'Initializing 3D viewer...' : 'Loading structure...'}
              </span>
            </div>
          </div>
        )}

        {/* Initialization error overlay */}
        {initializationError && (
          <div className="absolute inset-0 bg-red-900/20 flex items-center justify-center rounded-lg z-20">
            <div className="bg-red-800/90 text-white p-6 rounded-lg max-w-md text-center">
              <div className="flex items-center justify-center space-x-2 mb-3">
                <AlertTriangle className="h-6 w-6" />
                <span className="font-semibold">Plugin Initialization Failed</span>
              </div>
              <p className="text-sm mb-4">{initializationError}</p>
              <div className="flex justify-center space-x-2">
                <Button
                  onClick={retryInitialization}
                  className="bg-red-600 hover:bg-red-700 text-white"
                  disabled={isLoading}
                >
                  <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
                  Retry Initialization
                </Button>
              </div>
              <p className="text-xs text-red-200 mt-3">
                Attempt {initializationAttempts.current}/{maxInitializationAttempts}
              </p>
            </div>
          </div>
        )}

        {/* Basic controls overlay */}
        {isInitialized && !isLoading && (
          <div className="absolute top-4 right-4 flex flex-col space-y-2 z-20">
            <Button
              size="sm"
              variant="secondary"
              onClick={resetView}
              className="bg-gray-800/90 hover:bg-gray-700 text-white border-gray-600"
              title="Reset View"
            >
              <Home className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={zoomIn}
              className="bg-gray-800/90 hover:bg-gray-700 text-white border-gray-600"
              title="Zoom In"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={zoomOut}
              className="bg-gray-800/90 hover:bg-gray-700 text-white border-gray-600"
              title="Zoom Out"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Selection info overlay */}
        {currentSelection && (
          <div className="absolute bottom-4 left-4 right-4 z-20">
            <Card className="bg-gray-800/90 border-gray-600 backdrop-blur-sm">
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

        {/* No structure message */}
        {isInitialized && !isLoading && !hasStructure && !structureLoadError && !initializationError && (
          <div className="absolute inset-0 bg-gray-800/20 flex items-center justify-center rounded-lg z-10">
            <div className="text-center text-gray-400">
              <div className="text-sm">3D Viewer Ready</div>
              <div className="text-xs mt-1">Load a protein structure to begin</div>
            </div>
          </div>
        )}
      </div>
    );
  }
);

MolstarViewer.displayName = 'MolstarViewer';

export default MolstarViewer;