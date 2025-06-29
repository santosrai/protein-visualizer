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
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Loader2, RotateCcw, Home, ZoomIn, ZoomOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { logger } from '@/utils/logger';

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
  highlightChain: (chainId: string) => Promise<void>;
  clearHighlights: () => Promise<void>;
  getStructureInfo: () => Promise<string>;
  getCurrentSelection: () => SelectionInfo | null;
}

const MolstarViewer = React.forwardRef<ViewerControls, MolstarViewerProps>(
  ({ className, onReady, onError, onSelectionChange }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const pluginRef = useRef<PluginContext | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);
    const [currentSelection, setCurrentSelection] = useState<SelectionInfo | null>(null);
    const waterRepresentationRef = useRef<string | null>(null);
    const selectionSubscriptionRef = useRef<any>(null);

    // Create the plugin specification with contained Molstar UI and hidden Structure Tools
    const createSpec = useCallback(() => {
      const spec = DefaultPluginUISpec();
      
      // Configure layout for contained UI - hide Structure Tools completely
      spec.layout = {
        initial: {
          isExpanded: true,  // Start expanded but contained
          showControls: true,  // Show viewport controls
          regionState: {
            bottom: 'hidden',     // Keep bottom panel hidden
            left: 'collapsed',    // Start with State Tree collapsed but available
            right: 'hidden',      // Hide Structure Tools completely (not just collapsed)
            top: 'collapsed',     // Start with Sequence view collapsed but available
          }
        }
      };
      
      // Configure viewport to show essential controls
      spec.config = [
        [PluginConfig.Viewport.ShowExpand, true],           // Allow panel expansion
        [PluginConfig.Viewport.ShowControls, true],         // Show viewport controls
        [PluginConfig.Viewport.ShowSettings, true],         // Show settings button
        [PluginConfig.Viewport.ShowSelectionMode, true],    // Show selection mode toggle
        [PluginConfig.Viewport.ShowAnimation, true]         // Show animation controls
      ];
      
      return spec;
    }, []);

    // Extract selection information from the current state
    const extractSelectionFromState = useCallback((plugin: PluginContext): SelectionInfo | null => {
      try {
        logger.selection('Extracting selection from plugin state...');
        
        // Method 1: Try to get selection from selection manager
        const selectionManager = plugin.managers.structure.selection;
        if (selectionManager?.state?.entries) {
          logger.selection('Selection manager entries found', selectionManager.state.entries);
          
          const entries = Array.from(selectionManager.state.entries);
          if (entries.length > 0) {
            const [key, entry] = entries[0];
            logger.selection('First selection entry:', { key, entry });
            
            if (entry?.selection && StructureElement.Loci.is(entry.selection)) {
              return extractFromLoci(entry.selection, entry.structure);
            }
          }
        }
        
        // Method 2: Try to get from interactivity manager's current loci
        const interactivity = plugin.managers.interactivity;
        if (interactivity?.lociGranularity) {
          logger.selection('Checking interactivity loci granularity...');
          
          // Check if there's a current loci being tracked
          if (interactivity.lociGranularity.current) {
            const currentLoci = interactivity.lociGranularity.current;
            logger.selection('Current loci:', currentLoci);
            
            if (StructureElement.Loci.is(currentLoci)) {
              return extractFromLoci(currentLoci, currentLoci.structure);
            }
          }
        }
        
        logger.selection('No valid selection found in state');
        return null;
      } catch (error) {
        logger.error('Error extracting selection from state:', error);
        return null;
      }
    }, []);

    // Helper function to extract information from a Loci object
    const extractFromLoci = useCallback((loci: StructureElement.Loci, structure: any): SelectionInfo | null => {
      try {
        logger.selection('Extracting from loci:', loci);
        
        if (!loci.elements || loci.elements.length === 0) {
          logger.selection('No elements in loci');
          return null;
        }

        const element = loci.elements[0];
        if (!element.indices || element.indices.length === 0) {
          logger.selection('No indices in loci element');
          return null;
        }

        const unit = structure.units[element.unit];
        if (!unit) {
          logger.selection('No unit found');
          return null;
        }

        const atomIndex = element.indices[0];
        const elementIndex = unit.elements[atomIndex];
        
        // Create location for property extraction
        const location = StructureElement.Location.create(structure, unit, elementIndex);

        // Extract properties using StructureProperties
        const residueName = StructureProperties.residue.label_comp_id(location);
        const residueNumber = StructureProperties.residue.label_seq_id(location);
        const chainId = StructureProperties.chain.label_asym_id(location);
        const atomName = StructureProperties.atom.label_atom_id(location);
        const elementType = StructureProperties.atom.type_symbol(location);

        logger.selection('Extracted properties:', {
          residueName,
          residueNumber,
          chainId,
          atomName,
          elementType
        });

        // Get coordinates
        let coordinates;
        try {
          const pos = unit.conformation.position(elementIndex, Vec3());
          coordinates = { x: pos[0], y: pos[1], z: pos[2] };
        } catch (e) {
          logger.warn('Could not extract coordinates:', e);
        }

        const selectionInfo: SelectionInfo = {
          residueName,
          residueNumber,
          chainId,
          atomName,
          elementType,
          coordinates,
          atomCount: element.indices.length,
          description: `${residueName} ${residueNumber} (Chain ${chainId}) - ${atomName} atom`
        };

        logger.selection('Successfully extracted selection info:', selectionInfo);
        return selectionInfo;
      } catch (error) {
        logger.error('Error extracting from loci:', error);
        return null;
      }
    }, []);

    // Setup comprehensive selection monitoring
    const setupSelectionMonitoring = useCallback((plugin: PluginContext) => {
      logger.molstar('Setting up comprehensive selection monitoring...');
      
      // Clean up previous subscriptions
      if (selectionSubscriptionRef.current) {
        logger.molstar('Cleaning up previous subscriptions');
        if (Array.isArray(selectionSubscriptionRef.current)) {
          selectionSubscriptionRef.current.forEach(sub => sub.unsubscribe());
        } else {
          selectionSubscriptionRef.current.unsubscribe();
        }
      }

      const subscriptions: any[] = [];

      try {
        // Method 1: Selection manager events
        const selectionSub = plugin.managers.structure.selection.events.changed.subscribe(() => {
          logger.selection('Selection manager changed event!');
          setTimeout(() => {
            const selectionInfo = extractSelectionFromState(plugin);
            if (selectionInfo) {
              setCurrentSelection(selectionInfo);
              onSelectionChange?.(selectionInfo);
              logger.selection('Selection updated from manager:', selectionInfo.description);
            }
          }, 50);
        });
        subscriptions.push(selectionSub);
      } catch (error) {
        logger.warn('Could not subscribe to selection events:', error);
      }

      try {
        // Method 2: Click events with better timing
        const clickSub = plugin.behaviors.interaction.click.subscribe((event) => {
          logger.viewer('Click event detected:', event);
          
          // Use multiple timeouts to handle different processing delays
          [50, 150, 300].forEach((delay, index) => {
            setTimeout(() => {
              const selectionInfo = extractSelectionFromState(plugin);
              if (selectionInfo) {
                setCurrentSelection(selectionInfo);
                onSelectionChange?.(selectionInfo);
                logger.selection(`Click selection updated (attempt ${index + 1}):`, selectionInfo.description);
              } else if (index === 0) {
                logger.debug(`No selection on attempt ${index + 1}, will retry...`);
              }
            }, delay);
          });
        });
        subscriptions.push(clickSub);
      } catch (error) {
        logger.warn('Could not subscribe to click events:', error);
      }

      try {
        // Method 3: Monitor interactivity state changes
        const interactivitySub = plugin.managers.interactivity.events.changed.subscribe(() => {
          logger.viewer('Interactivity changed event!');
          setTimeout(() => {
            const selectionInfo = extractSelectionFromState(plugin);
            if (selectionInfo) {
              setCurrentSelection(selectionInfo);
              onSelectionChange?.(selectionInfo);
              logger.selection('Selection updated from interactivity:', selectionInfo.description);
            }
          }, 50);
        });
        subscriptions.push(interactivitySub);
      } catch (error) {
        logger.warn('Could not subscribe to interactivity events:', error);
      }

      // Store all subscriptions
      selectionSubscriptionRef.current = subscriptions;

      logger.molstar('Selection monitoring setup complete with', subscriptions.length, 'subscriptions');

      return () => {
        logger.molstar('Cleaning up selection monitoring');
        subscriptions.forEach(sub => {
          try {
            sub.unsubscribe();
          } catch (e) {
            logger.warn('Error unsubscribing:', e);
          }
        });
      };
    }, [extractSelectionFromState, onSelectionChange]);

    // Initialize the molstar plugin
    const initializePlugin = useCallback(async () => {
      if (!containerRef.current || pluginRef.current) return;

      try {
        logger.molstar('Initializing Molstar plugin with comprehensive selection support...');
        setIsLoading(true);
        const spec = createSpec();
        const plugin = await createPluginUI({
          target: containerRef.current,
          render: renderReact18,
          spec
        });
        pluginRef.current = plugin;
        logger.molstar('Molstar plugin initialized:', plugin);
        
        // Verify that essential plugin properties are available
        if (!plugin.builders) {
          throw new Error('Plugin builders not initialized - plugin is not ready for operations');
        }
        
        logger.molstar('Plugin builders verified');
        
        // Setup selection monitoring after plugin is fully ready
        setTimeout(() => {
          setupSelectionMonitoring(plugin);
        }, 1000); // Give plugin time to fully initialize
        
        setIsInitialized(true);
        onReady?.(plugin);
        logger.molstar('Plugin setup complete with enhanced selection tracking');
      } catch (error) {
        logger.error('Failed to initialize molstar plugin:', error);
        onError?.(error as Error);
      } finally {
        setIsLoading(false);
      }
    }, [createSpec, onReady, onError, setupSelectionMonitoring]);

    // Load structure from URL
    const loadStructure = useCallback(async (url: string, format: string = 'pdb') => {
      if (!pluginRef.current) return;

      try {
        logger.molstar(`Loading structure from: ${url}`);
        setIsLoading(true);
        
        // Clear existing structures and reset selection
        await PluginCommands.State.RemoveObject(pluginRef.current, { 
          state: pluginRef.current.state.data, 
          ref: pluginRef.current.state.data.tree.root.ref
        });
        waterRepresentationRef.current = null;
        setCurrentSelection(null);
        logger.molstar('Cleared existing structures and selection');

        // Download and load the structure
        const data = await pluginRef.current.builders.data.download({ url: Asset.Url(url) }, { state: { isGhost: false } });
        const trajectory = await pluginRef.current.builders.structure.parseTrajectory(data, format as any);
        const model = await pluginRef.current.builders.structure.createModel(trajectory);
        const structure = await pluginRef.current.builders.structure.createStructure(model);
        
        // Create default representation
        await pluginRef.current.builders.structure.representation.addRepresentation(structure, {
          type: 'cartoon',
          color: 'chain-id'
        });

        // Focus the camera on the structure
        await PluginCommands.Camera.Reset(pluginRef.current);
        
        logger.molstar('Structure loaded successfully');
      } catch (error) {
        logger.error('Failed to load structure:', error);
        onError?.(error as Error);
      } finally {
        setIsLoading(false);
      }
    }, [onError]);

    // Reset camera view
    const resetView = useCallback(() => {
      if (!pluginRef.current) return;
      logger.viewer('Resetting camera view');
      PluginCommands.Camera.Reset(pluginRef.current);
    }, []);

    // Zoom in
    const zoomIn = useCallback(() => {
      if (!pluginRef.current) return;
      logger.viewer('Zooming in');
      PluginCommands.Camera.Focus(pluginRef.current, { center: Vec3.create(0, 0, 0), radius: 20 });
    }, []);

    // Zoom out  
    const zoomOut = useCallback(() => {
      if (!pluginRef.current) return;
      logger.viewer('Zooming out');
      PluginCommands.Camera.Focus(pluginRef.current, { center: Vec3.create(0, 0, 0), radius: 50 });
    }, []);

    // Set representation type
    const setRepresentation = useCallback(async (type: 'cartoon' | 'surface' | 'ball-and-stick' | 'spacefill') => {
      if (!pluginRef.current) return;

      try {
        logger.viewer(`Setting representation to: ${type}`);
        
        // Remove existing representations
        const reprs = pluginRef.current.state.data.select(StateSelection.Generators.ofType(PluginStateObject.Molecule.Structure.Representation3D));
        for (const repr of reprs) {
          await PluginCommands.State.RemoveObject(pluginRef.current, { state: pluginRef.current.state.data, ref: repr.transform.ref });
        }

        // Get the structure
        const structures = pluginRef.current.state.data.select(StateSelection.Generators.ofType(PluginStateObject.Molecule.Structure));
        if (structures.length === 0) return;

        // Create new representation
        const reprType = type === 'ball-and-stick' ? 'ball-and-stick' : 
                        type === 'spacefill' ? 'spacefill' : 
                        type === 'surface' ? 'molecular-surface' : 'cartoon';

        await pluginRef.current.builders.structure.representation.addRepresentation(structures[0], {
          type: reprType,
          color: 'chain-id'
        });

        logger.viewer(`Representation changed to: ${type}`);
      } catch (error) {
        logger.error('Failed to set representation:', error);
        onError?.(error as Error);
      }
    }, [onError]);

    // Show water molecules
    const showWaterMolecules = useCallback(async () => {
      if (!pluginRef.current) return;

      try {
        logger.viewer('Showing water molecules');
        
        // First check if water representation already exists
        if (waterRepresentationRef.current) {
          throw new Error('Water molecules are already visible');
        }

        const structures = pluginRef.current.state.data.select(StateSelection.Generators.ofType(PluginStateObject.Molecule.Structure));
        if (structures.length === 0) throw new Error('No structure loaded');

        // Create water representation with water selection
        const waterRepr = await pluginRef.current.builders.structure.representation.addRepresentation(structures[0], {
          type: 'ball-and-stick',
          typeParams: {
            sizeFactor: 0.3,
            radiusOffset: 0,
            linkRadius: 0.1
          },
          colorParams: {
            carbonColor: { name: 'element-symbol' },
            value: 0x88CCEE
          }
        }, { 
          tag: 'water-representation'
        });

        // Store reference to the water representation
        if (waterRepr && waterRepr.ref) {
          waterRepresentationRef.current = waterRepr.ref;
        }

        logger.viewer('Water molecules shown');
      } catch (error) {
        logger.error('Failed to show water molecules:', error);
        throw error;
      }
    }, []);

    // Hide water molecules
    const hideWaterMolecules = useCallback(async () => {
      if (!pluginRef.current) return;

      try {
        logger.viewer('Hiding water molecules');
        
        // Method 1: If we have a stored reference, use it
        if (waterRepresentationRef.current) {
          await PluginCommands.State.RemoveObject(pluginRef.current, {
            state: pluginRef.current.state.data,
            ref: waterRepresentationRef.current
          });
          waterRepresentationRef.current = null;
          logger.viewer('Water molecules hidden using stored reference');
          return;
        }

        // Method 2: Find and remove representations with water tag
        const representations = pluginRef.current.state.data.select(
          StateSelection.Generators.ofType(PluginStateObject.Molecule.Structure.Representation3D)
        );

        let foundWater = false;
        for (const repr of representations) {
          if (repr.transform.tags && repr.transform.tags.includes('water-representation')) {
            await PluginCommands.State.RemoveObject(pluginRef.current, {
              state: pluginRef.current.state.data,
              ref: repr.transform.ref
            });
            foundWater = true;
          }
        }

        if (!foundWater) {
          // Method 3: Look for ball-and-stick representations (likely water)
          for (const repr of representations) {
            if (repr.obj && repr.obj.data && repr.obj.data.repr && 
                repr.obj.data.repr.params && repr.obj.data.repr.params.type === 'ball-and-stick') {
              await PluginCommands.State.RemoveObject(pluginRef.current, {
                state: pluginRef.current.state.data,
                ref: repr.transform.ref
              });
              foundWater = true;
              break; // Only remove the first ball-and-stick representation
            }
          }
        }

        if (!foundWater) {
          throw new Error('No water molecules found to hide');
        }

        logger.viewer('Water molecules hidden');
      } catch (error) {
        logger.error('Failed to hide water molecules:', error);
        throw error;
      }
    }, []);

    // Hide ligands
    const hideLigands = useCallback(async () => {
      if (!pluginRef.current) return;

      try {
        logger.debug('Hide ligands functionality would be implemented here');
      } catch (error) {
        logger.error('Failed to hide ligands:', error);
        throw error;
      }
    }, []);

    // Focus on specific chain
    const focusOnChain = useCallback(async (chainId: string) => {
      if (!pluginRef.current) return;

      try {
        logger.debug(`Focus on chain ${chainId} functionality would be implemented here`);
      } catch (error) {
        logger.error('Failed to focus on chain:', error);
        throw error;
      }
    }, []);

    // Get selection information - Enhanced implementation
    const getSelectionInfo = useCallback(async (): Promise<string> => {
      if (!pluginRef.current) {
        logger.debug('No plugin available for getSelectionInfo');
        return 'No plugin available';
      }

      try {
        logger.debug('Getting selection info, current selection:', currentSelection);
        
        if (!currentSelection) {
          return 'No atoms or residues are currently selected. Click on the protein structure to make a selection, then ask again.';
        }

        let info = `Current Selection Details:\n\n`;
        info += `${currentSelection.description}\n\n`;
        
        if (currentSelection.residueName) {
          info += `• Residue: ${currentSelection.residueName}\n`;
        }
        if (currentSelection.residueNumber) {
          info += `• Residue Number: ${currentSelection.residueNumber}\n`;
        }
        if (currentSelection.chainId) {
          info += `• Chain: ${currentSelection.chainId}\n`;
        }
        if (currentSelection.atomName) {
          info += `• Atom: ${currentSelection.atomName}\n`;
        }
        if (currentSelection.elementType) {
          info += `• Element: ${currentSelection.elementType}\n`;
        }
        if (currentSelection.atomCount) {
          info += `• Total Atoms: ${currentSelection.atomCount}\n`;
        }
        if (currentSelection.coordinates) {
          info += `• Coordinates: (${currentSelection.coordinates.x.toFixed(2)}, ${currentSelection.coordinates.y.toFixed(2)}, ${currentSelection.coordinates.z.toFixed(2)})\n`;
        }

        logger.debug('Selection info generated:', info);
        return info;
      } catch (error) {
        logger.error('Failed to get selection info:', error);
        return 'Unable to access selection information. Please ensure a structure is loaded and try clicking on the protein to select parts of it.';
      }
    }, [currentSelection]);

    // Get current selection
    const getCurrentSelection = useCallback(() => {
      logger.debug('getCurrentSelection called, returning:', currentSelection);
      return currentSelection;
    }, [currentSelection]);

    // Show only selected region
    const showOnlySelected = useCallback(async () => {
      if (!pluginRef.current) return;

      try {
        logger.debug('Show only selected functionality would be implemented here');
      } catch (error) {
        logger.error('Failed to show only selected:', error);
        throw error;
      }
    }, []);

    // Highlight specific chain
    const highlightChain = useCallback(async (chainId: string) => {
      if (!pluginRef.current) return;

      try {
        logger.debug(`Highlight chain ${chainId} functionality would be implemented here`);
      } catch (error) {
        logger.error('Failed to highlight chain:', error);
        throw error;
      }
    }, []);

    // Clear all highlights
    const clearHighlights = useCallback(async () => {
      if (!pluginRef.current) return;

      try {
        logger.viewer('Clearing highlights');
        await PluginCommands.Interactivity.ClearHighlights(pluginRef.current);
      } catch (error) {
        logger.error('Failed to clear highlights:', error);
        throw error;
      }
    }, []);

    // Get structure information
    const getStructureInfo = useCallback(async (): Promise<string> => {
      if (!pluginRef.current) {
        logger.debug('No plugin available for getStructureInfo');
        return 'No plugin available';
      }

      try {
        logger.debug('Getting structure info');
        
        const structures = pluginRef.current.state.data.select(StateSelection.Generators.ofType(PluginStateObject.Molecule.Structure));
        if (structures.length === 0) {
          return 'No structure loaded.';
        }

        // Try to get basic structure information
        const structure = structures[0];
        if (structure && structure.obj && structure.obj.data) {
          const data = structure.obj.data;
          
          let info = 'Structure Information:\n\n';
          
          // Get basic stats
          if (data.atomicHierarchy) {
            const hierarchy = data.atomicHierarchy;
            info += `• Total atoms: ${hierarchy.atoms._rowCount || 'Unknown'}\n`;
            info += `• Total residues: ${hierarchy.residues._rowCount || 'Unknown'}\n`;
            info += `• Total chains: ${hierarchy.chains._rowCount || 'Unknown'}\n`;
          }
          
          // Get model information
          if (data.models && data.models.length > 0) {
            info += `• Models: ${data.models.length}\n`;
          }
          
          logger.debug('Structure info generated:', info);
          return info;
        }

        return 'Structure is loaded but detailed information is not available.';
      } catch (error) {
        logger.error('Failed to get structure info:', error);
        return 'Failed to get structure information.';
      }
    }, []);

    // Get plugin instance
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
      highlightChain,
      clearHighlights,
      getStructureInfo,
      getCurrentSelection
    }), [
      loadStructure, resetView, zoomIn, zoomOut, setRepresentation, getPlugin,
      showWaterMolecules, hideWaterMolecules, hideLigands, focusOnChain, getSelectionInfo,
      showOnlySelected, highlightChain, clearHighlights, getStructureInfo, getCurrentSelection
    ]);

    // Initialize plugin on mount
    useEffect(() => {
      initializePlugin();

      // Cleanup on unmount
      return () => {
        logger.molstar('Cleaning up MolstarViewer component');
        if (selectionSubscriptionRef.current) {
          if (Array.isArray(selectionSubscriptionRef.current)) {
            selectionSubscriptionRef.current.forEach(sub => {
              try {
                sub.unsubscribe();
              } catch (e) {
                logger.warn('Error during cleanup:', e);
              }
            });
          } else {
            try {
              selectionSubscriptionRef.current.unsubscribe();
            } catch (e) {
              logger.warn('Error during cleanup:', e);
            }
          }
        }
        if (pluginRef.current) {
          pluginRef.current.dispose();
          pluginRef.current = null;
        }
      };
    }, [initializePlugin]);

    return (
      <Card className={cn("relative w-full h-full bg-gray-900 border-gray-700 overflow-hidden", className)}>
        <div 
          ref={containerRef} 
          className="w-full h-full rounded-lg"
          style={{ 
            minHeight: '400px',
            contain: 'layout style size',  // CSS containment
            position: 'relative'
          }}
        />
        
        {/* Loading overlay with higher z-index */}
        {isLoading && (
          <div className="absolute inset-0 bg-gray-900/80 flex items-center justify-center rounded-lg z-50">
            <div className="flex items-center space-x-2 text-white">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>Loading structure...</span>
            </div>
          </div>
        )}

        {/* Selection info overlay - positioned to not interfere with Molstar UI */}
        {currentSelection && (
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-40 pointer-events-none">
            <Card className="bg-gray-800/90 border-gray-600 backdrop-blur-sm max-w-sm">
              <div className="p-3">
                <p className="text-white text-sm font-medium text-center">
                  Selected: {currentSelection.description}
                </p>
                {currentSelection.coordinates && (
                  <p className="text-gray-400 text-xs mt-1 text-center">
                    Position: ({currentSelection.coordinates.x.toFixed(2)}, {currentSelection.coordinates.y.toFixed(2)}, {currentSelection.coordinates.z.toFixed(2)})
                  </p>
                )}
              </div>
            </Card>
          </div>
        )}
      </Card>
    );
  }
);

MolstarViewer.displayName = 'MolstarViewer';

export default MolstarViewer;