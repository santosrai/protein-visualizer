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

    // Extract selection information from the plugin's selection manager
    const extractCurrentSelection = useCallback((plugin: PluginContext): SelectionInfo | null => {
      try {
        const manager = plugin.managers.structure.selection;
        if (!manager || !manager.entries || manager.entries.length === 0) {
          return null;
        }

        // Get the first selection entry
        const entry = manager.entries[0];
        if (!entry || !entry.selection) {
          return null;
        }

        const selection = entry.selection;
        const structure = entry.structure;

        if (!StructureElement.Loci.is(selection)) {
          return null;
        }

        if (!selection.elements || selection.elements.length === 0) {
          return null;
        }

        // Get the first element
        const element = selection.elements[0];
        if (!element || !element.indices || element.indices.length === 0) {
          return null;
        }

        const unit = structure.units[element.unit];
        if (!unit) {
          return null;
        }

        // Get the first atom index
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

        // Get coordinates
        let coordinates;
        try {
          const pos = unit.conformation.position(elementIndex, Vec3());
          coordinates = { x: pos[0], y: pos[1], z: pos[2] };
        } catch (e) {
          // Coordinates not available
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

        return selectionInfo;
      } catch (error) {
        console.error('Error extracting selection:', error);
        return null;
      }
    }, []);

    // Monitor selection changes
    const setupSelectionMonitoring = useCallback((plugin: PluginContext) => {
      // Clean up previous subscription
      if (selectionSubscriptionRef.current) {
        selectionSubscriptionRef.current.unsubscribe();
      }

      // Subscribe to selection changes
      selectionSubscriptionRef.current = plugin.managers.structure.selection.events.changed.subscribe(() => {
        const selectionInfo = extractCurrentSelection(plugin);
        setCurrentSelection(selectionInfo);
        onSelectionChange?.(selectionInfo);
        
        if (selectionInfo) {
          console.log('Selection updated:', selectionInfo);
        }
      });

      // Also monitor for click events as a backup
      const clickSubscription = plugin.behaviors.interaction.click.subscribe(() => {
        // Small delay to ensure selection is processed
        setTimeout(() => {
          const selectionInfo = extractCurrentSelection(plugin);
          setCurrentSelection(selectionInfo);
          onSelectionChange?.(selectionInfo);
        }, 50);
      });

      return () => {
        if (selectionSubscriptionRef.current) {
          selectionSubscriptionRef.current.unsubscribe();
        }
        clickSubscription.unsubscribe();
      };
    }, [extractCurrentSelection, onSelectionChange]);

    // Initialize the molstar plugin
    const initializePlugin = useCallback(async () => {
      if (!containerRef.current || pluginRef.current) return;

      try {
        setIsLoading(true);
        const spec = createSpec();
        const plugin = await createPluginUI({
          target: containerRef.current,
          render: renderReact18,
          spec
        });
        pluginRef.current = plugin;
        
        // Setup selection monitoring
        setupSelectionMonitoring(plugin);
        
        setIsInitialized(true);
        onReady?.(plugin);
      } catch (error) {
        console.error('Failed to initialize molstar plugin:', error);
        onError?.(error as Error);
      } finally {
        setIsLoading(false);
      }
    }, [createSpec, onReady, onError, setupSelectionMonitoring]);

    // Load structure from URL
    const loadStructure = useCallback(async (url: string, format: string = 'pdb') => {
      if (!pluginRef.current) return;

      try {
        setIsLoading(true);
        
        // Clear existing structures and reset selection
        await PluginCommands.State.RemoveObject(pluginRef.current, { 
          state: pluginRef.current.state.data, 
          ref: pluginRef.current.state.data.tree.root.ref
        });
        waterRepresentationRef.current = null;
        setCurrentSelection(null);

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
        
      } catch (error) {
        console.error('Failed to load structure:', error);
        onError?.(error as Error);
      } finally {
        setIsLoading(false);
      }
    }, [onError]);

    // Reset camera view
    const resetView = useCallback(() => {
      if (!pluginRef.current) return;
      PluginCommands.Camera.Reset(pluginRef.current);
    }, []);

    // Zoom in
    const zoomIn = useCallback(() => {
      if (!pluginRef.current) return;
      PluginCommands.Camera.Focus(pluginRef.current, { center: Vec3.create(0, 0, 0), radius: 20 });
    }, []);

    // Zoom out  
    const zoomOut = useCallback(() => {
      if (!pluginRef.current) return;
      PluginCommands.Camera.Focus(pluginRef.current, { center: Vec3.create(0, 0, 0), radius: 50 });
    }, []);

    // Set representation type
    const setRepresentation = useCallback(async (type: 'cartoon' | 'surface' | 'ball-and-stick' | 'spacefill') => {
      if (!pluginRef.current) return;

      try {
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

      } catch (error) {
        console.error('Failed to set representation:', error);
        onError?.(error as Error);
      }
    }, [onError]);

    // Show water molecules
    const showWaterMolecules = useCallback(async () => {
      if (!pluginRef.current) return;

      try {
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

      } catch (error) {
        console.error('Failed to show water molecules:', error);
        throw error;
      }
    }, []);

    // Hide water molecules
    const hideWaterMolecules = useCallback(async () => {
      if (!pluginRef.current) return;

      try {
        // Method 1: If we have a stored reference, use it
        if (waterRepresentationRef.current) {
          await PluginCommands.State.RemoveObject(pluginRef.current, {
            state: pluginRef.current.state.data,
            ref: waterRepresentationRef.current
          });
          waterRepresentationRef.current = null;
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

      } catch (error) {
        console.error('Failed to hide water molecules:', error);
        throw error;
      }
    }, []);

    // Hide ligands
    const hideLigands = useCallback(async () => {
      if (!pluginRef.current) return;

      try {
        // This is a simplified implementation
        // In a real scenario, you'd need to identify and hide specific ligand representations
        console.log('Hide ligands functionality would be implemented here');
      } catch (error) {
        console.error('Failed to hide ligands:', error);
        throw error;
      }
    }, []);

    // Focus on specific chain
    const focusOnChain = useCallback(async (chainId: string) => {
      if (!pluginRef.current) return;

      try {
        // This would require more complex selection logic
        console.log(`Focus on chain ${chainId} functionality would be implemented here`);
      } catch (error) {
        console.error('Failed to focus on chain:', error);
        throw error;
      }
    }, []);

    // Get selection information - Enhanced implementation
    const getSelectionInfo = useCallback(async (): Promise<string> => {
      if (!pluginRef.current) return 'No plugin available';

      try {
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

        return info;
      } catch (error) {
        console.error('Failed to get selection info:', error);
        return 'Unable to access selection information. Please ensure a structure is loaded and try clicking on the protein to select parts of it.';
      }
    }, [currentSelection]);

    // Get current selection
    const getCurrentSelection = useCallback(() => {
      return currentSelection;
    }, [currentSelection]);

    // Show only selected region
    const showOnlySelected = useCallback(async () => {
      if (!pluginRef.current) return;

      try {
        console.log('Show only selected functionality would be implemented here');
      } catch (error) {
        console.error('Failed to show only selected:', error);
        throw error;
      }
    }, []);

    // Highlight specific chain
    const highlightChain = useCallback(async (chainId: string) => {
      if (!pluginRef.current) return;

      try {
        console.log(`Highlight chain ${chainId} functionality would be implemented here`);
      } catch (error) {
        console.error('Failed to highlight chain:', error);
        throw error;
      }
    }, []);

    // Clear all highlights
    const clearHighlights = useCallback(async () => {
      if (!pluginRef.current) return;

      try {
        await PluginCommands.Interactivity.ClearHighlights(pluginRef.current);
      } catch (error) {
        console.error('Failed to clear highlights:', error);
        throw error;
      }
    }, []);

    // Get structure information
    const getStructureInfo = useCallback(async (): Promise<string> => {
      if (!pluginRef.current) return 'No plugin available';

      try {
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
          
          return info;
        }

        return 'Structure is loaded but detailed information is not available.';
      } catch (error) {
        console.error('Failed to get structure info:', error);
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
        if (selectionSubscriptionRef.current) {
          selectionSubscriptionRef.current.unsubscribe();
        }
        if (pluginRef.current) {
          pluginRef.current.dispose();
          pluginRef.current = null;
        }
      };
    }, [initializePlugin]);

    return (
      <Card className={cn("relative w-full h-full bg-gray-900 border-gray-700", className)}>
        <div 
          ref={containerRef} 
          className="w-full h-full rounded-lg overflow-hidden"
          style={{ minHeight: '400px' }}
        />
        
        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-gray-900/50 flex items-center justify-center rounded-lg">
            <div className="flex items-center space-x-2 text-white">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>Loading structure...</span>
            </div>
          </div>
        )}

        {/* Basic controls overlay */}
        {isInitialized && !isLoading && (
          <div className="absolute top-4 right-4 flex flex-col space-y-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={resetView}
              className="bg-gray-800/80 hover:bg-gray-700 text-white border-gray-600"
            >
              <Home className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={zoomIn}
              className="bg-gray-800/80 hover:bg-gray-700 text-white border-gray-600"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={zoomOut}
              className="bg-gray-800/80 hover:bg-gray-700 text-white border-gray-600"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Selection info overlay */}
        {currentSelection && (
          <div className="absolute bottom-4 left-4 right-4">
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
      </Card>
    );
  }
);

MolstarViewer.displayName = 'MolstarViewer';

export default MolstarViewer;