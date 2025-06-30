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
    const originalRepresentationsRef = useRef<string[]>([]);
    const selectionOnlyModeRef = useRef<boolean>(false);

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

    // ENHANCED: Extract selection information with better error handling
    const extractSelectionInfo = useCallback((location: StructureElement.Location): SelectionInfo | null => {
      try {
        console.log('🔍 Extracting selection info from location:', location);
        
        const residueName = StructureProperties.residue.label_comp_id(location);
        const residueNumber = StructureProperties.residue.label_seq_id(location);
        const chainId = StructureProperties.chain.label_asym_id(location);
        const atomName = StructureProperties.atom.label_atom_id(location);
        const elementType = StructureProperties.atom.type_symbol(location);

        console.log('📊 Extracted properties:', {
          residueName, residueNumber, chainId, atomName, elementType
        });

        let coordinates;
        try {
          const unit = location.unit;
          const elementIndex = location.element;
          const pos = unit.conformation.position(elementIndex, Vec3());
          coordinates = { x: pos[0], y: pos[1], z: pos[2] };
          console.log('📍 Coordinates:', coordinates);
        } catch (e) {
          console.log('⚠️ Coordinates not available for selection');
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

        console.log('✅ Successfully extracted selection info:', selectionInfo);
        return selectionInfo;

      } catch (error) {
        console.error('❌ Error extracting selection info:', error);
        return null;
      }
    }, []);

    // ENHANCED: Helper function to update selection state
    const updateSelectionState = useCallback((selectionInfo: SelectionInfo | null) => {
      console.log('🔄 Updating selection state:', selectionInfo);
      setCurrentSelection(selectionInfo);
      onSelectionChange?.(selectionInfo);
      
      if (selectionInfo) {
        console.log('✅ Selection state updated successfully:', selectionInfo.description);
      } else {
        console.log('🗑️ Selection state cleared');
      }
    }, [onSelectionChange]);

    // Monitor selection changes through multiple channels
    const setupSelectionMonitoring = useCallback((plugin: PluginContext) => {
      console.log('🔍 Setting up enhanced selection monitoring...');
      
      // Clean up previous subscriptions
      if (selectionSubscriptionRef.current) {
        selectionSubscriptionRef.current.unsubscribe();
      }

      // Method 1: Listen to structure selection manager changes (most reliable)
      const selectionSubscription = plugin.managers.structure.selection.events.changed.subscribe(() => {
        console.log('🎯 Structure selection manager event fired');
        
        try {
          const manager = plugin.managers.structure.selection;
          
          if (manager.entries && manager.entries.length > 0) {
            const entry = manager.entries[0];
            if (entry && entry.selection && StructureElement.Loci.is(entry.selection)) {
              const loci = entry.selection;
              
              if (loci.elements && loci.elements.length > 0) {
                const element = loci.elements[0];
                const structure = loci.structure;
                const unit = structure.units[element.unit];
                
                if (unit && element.indices && element.indices.length > 0) {
                  const atomIndex = element.indices[0];
                  const elementIndex = unit.elements[atomIndex];
                  const location = StructureElement.Location.create(structure, unit, elementIndex);
                  
                  const selectionInfo = extractSelectionInfo(location);
                  if (selectionInfo) {
                    // Calculate total atom count for all elements
                    const totalAtoms = loci.elements.reduce((acc: number, el: any) => acc + el.indices.length, 0);
                    selectionInfo.atomCount = totalAtoms;
                    
                    console.log('✅ Manual selection detected via selection manager:', selectionInfo.description);
                    updateSelectionState(selectionInfo);
                  }
                }
              }
            }
          } else {
            // No selection - clear current selection
            console.log('🔄 Selection cleared via selection manager');
            updateSelectionState(null);
          }
        } catch (error) {
          console.log('⚠️ Error processing selection manager event:', error);
        }
      });

      // Method 2: Listen to interaction events as backup
      const interactionSubscription = plugin.behaviors.interaction.click.subscribe((event) => {
        console.log('🖱️ Click interaction event fired');
        
        // Small delay to allow selection to be processed
        setTimeout(() => {
          try {
            // Check current highlights as a backup method
            const currentLoci = plugin.managers.interactivity.lociHighlights.current.loci;
            
            if (currentLoci && StructureElement.Loci.is(currentLoci)) {
              console.log('🎯 Processing highlighted loci from click interaction');
              
              if (currentLoci.elements && currentLoci.elements.length > 0) {
                const element = currentLoci.elements[0];
                const structure = currentLoci.structure;
                const unit = structure.units[element.unit];
                
                if (unit && element.indices && element.indices.length > 0) {
                  const atomIndex = element.indices[0];
                  const elementIndex = unit.elements[atomIndex];
                  const location = StructureElement.Location.create(structure, unit, elementIndex);
                  
                  const selectionInfo = extractSelectionInfo(location);
                  if (selectionInfo) {
                    const totalAtoms = currentLoci.elements.reduce((acc: number, el: any) => acc + el.indices.length, 0);
                    selectionInfo.atomCount = totalAtoms;
                    
                    console.log('✅ Manual selection detected via click interaction:', selectionInfo.description);
                    updateSelectionState(selectionInfo);
                  }
                }
              }
            }
          } catch (error) {
            console.log('⚠️ Error processing click interaction:', error);
          }
        }, 100);
      });

      // Store subscription for cleanup
      selectionSubscriptionRef.current = {
        unsubscribe: () => {
          selectionSubscription.unsubscribe();
          interactionSubscription.unsubscribe();
        }
      };

      console.log('✅ Enhanced selection monitoring setup complete');
      
      return () => {
        if (selectionSubscriptionRef.current) {
          selectionSubscriptionRef.current.unsubscribe();
        }
      };
    }, [extractSelectionInfo, updateSelectionState]);

    // ENHANCED: Fixed manual extraction for programmatic selections
    const extractSelectionFromLoci = useCallback((loci: any): SelectionInfo | null => {
      try {
        console.log('🔍 Extracting selection from loci:', loci);
        console.log('📊 Loci structure details:', {
          hasElements: !!loci.elements,
          elementsCount: loci.elements?.length,
          hasStructure: !!loci.structure,
          hasUnits: !!loci.structure?.units
        });

        if (!loci.elements || loci.elements.length === 0) {
          console.log('❌ No elements in loci');
          return null;
        }

        const element = loci.elements[0];
        console.log('📊 Element details:', {
          unit: element.unit,
          hasIndices: !!element.indices,
          indicesLength: element.indices?.length,
          indicesType: typeof element.indices,
          element: element
        });

        // Check if element has indices in different possible formats
        let atomIndices;
        if (element.indices && element.indices.length > 0) {
          atomIndices = element.indices;
        } else if (element.indices && typeof element.indices === 'object') {
          // Sometimes indices might be in a different format
          atomIndices = Array.from(element.indices);
        } else {
          console.log('❌ No valid indices found in element');
          return null;
        }

        const structure = loci.structure;
        const unit = structure.units[element.unit];

        if (!unit) {
          console.log('❌ No unit found for element.unit:', element.unit);
          return null;
        }

        console.log('📊 Unit details:', {
          hasElements: !!unit.elements,
          elementsLength: unit.elements?.length,
          unitKind: unit.kind
        });

        // Get the first atom index
        const atomIndex = atomIndices[0];
        console.log('🎯 Using atomIndex:', atomIndex);

        // Different approaches to get element index
        let elementIndex;
        
        if (unit.elements && atomIndex < unit.elements.length) {
          elementIndex = unit.elements[atomIndex];
        } else {
          // Sometimes atomIndex is already the elementIndex
          elementIndex = atomIndex;
        }

        console.log('🎯 Using elementIndex:', elementIndex);

        // Create location
        const location = StructureElement.Location.create(structure, unit, elementIndex);
        console.log('🎯 Created location:', location);

        // Extract properties
        const selectionInfo = extractSelectionInfo(location);
        if (selectionInfo) {
          // Calculate total atom count
          const totalAtoms = loci.elements.reduce((acc: number, el: any) => {
            const indicesCount = el.indices?.length || (el.indices ? Array.from(el.indices).length : 0);
            return acc + indicesCount;
          }, 0);
          selectionInfo.atomCount = totalAtoms;
          
          console.log('✅ Successfully extracted selection info:', selectionInfo);
          return selectionInfo;
        }

        return null;

      } catch (error) {
        console.error('❌ Error in extractSelectionFromLoci:', error);
        return null;
      }
    }, [extractSelectionInfo]);

    // ENHANCED: Direct implementation following your working code exactly
    const selectResidue = useCallback(async (selectedResidue: number, chainId?: string): Promise<string> => {
      console.log(`🎯 selectResidue called with residue: ${selectedResidue}, chain: ${chainId}`);
      
      // Use the exact approach from your working code
      const data = (window as any).molstar?.managers.structure.hierarchy.current.structures[0]?.cell?.obj?.data;
      if (!data) {
        console.log('❌ No structure data available');
        return 'No structure data available';
      }

      console.log('✅ Structure data found:', data);

      try {
        const seq_id = selectedResidue;
        let sel;

        if (chainId) {
          // Select specific residue in specific chain
          sel = Script.getStructureSelection(
            (Q: any) =>
              Q.struct.generator.atomGroups({
                "chain-test": Q.core.rel.eq([
                  Q.struct.atomProperty.macromolecular.auth_asym_id(),
                  chainId
                ]),
                "residue-test": Q.core.rel.eq([
                  Q.struct.atomProperty.macromolecular.label_seq_id(),
                  seq_id,
                ]),
                "group-by": Q.struct.atomProperty.macromolecular.residueKey(),
              }),
            data
          );
        } else {
          // Use your exact working code for any chain
          sel = Script.getStructureSelection(
            (Q: any) =>
              Q.struct.generator.atomGroups({
                "residue-test": Q.core.rel.eq([
                  Q.struct.atomProperty.macromolecular.label_seq_id(),
                  seq_id,
                ]),
                "group-by": Q.struct.atomProperty.macromolecular.residueKey(),
              }),
            data
          );
        }

        console.log('✅ Selection query created:', sel);

        const loci = StructureSelection.toLociWithSourceUnits(sel);
        console.log('✅ Loci created:', loci);

        if (!loci.elements || loci.elements.length === 0) {
          throw new Error(`Residue ${selectedResidue}${chainId ? ` in chain ${chainId}` : ''} not found`);
        }

        // Use lociSelects for actual selection (following maintainer's tip)
        (window as any).molstar?.managers.interactivity.lociSelects.selectOnly({ loci });
        console.log('✅ Selection applied via lociSelects');

        // Also highlight for visual feedback (your original working approach)
        (window as any).molstar?.managers.interactivity.lociHighlights.highlightOnly({ loci });
        console.log('✅ Highlight applied via lociHighlights');

        // ENHANCED: Extract selection info manually using the improved method
        console.log('🔍 Manually extracting selection info for programmatic selection...');
        
        const selectionInfo = extractSelectionFromLoci(loci);
        if (selectionInfo) {
          console.log('✅ Programmatic selection info extracted successfully:', selectionInfo);
          updateSelectionState(selectionInfo);
        } else {
          console.log('❌ Failed to extract selection info - but selection still worked');
          
          // Create a basic selection info as fallback
          const fallbackInfo: SelectionInfo = {
            residueNumber: selectedResidue,
            chainId: chainId,
            description: `Residue ${selectedResidue}${chainId ? ` in chain ${chainId}` : ''} (selected programmatically)`,
            atomCount: loci.elements.reduce((acc: number, el: any) => {
              const indicesCount = el.indices?.length || (el.indices ? Array.from(el.indices).length : 0);
              return acc + indicesCount;
            }, 0)
          };
          
          console.log('🔄 Using fallback selection info:', fallbackInfo);
          updateSelectionState(fallbackInfo);
        }

        const totalAtoms = loci.elements.reduce((acc: number, el: any) => {
          const indicesCount = el.indices?.length || (el.indices ? Array.from(el.indices).length : 0);
          return acc + indicesCount;
        }, 0);
        return `✅ Selected residue ${selectedResidue}${chainId ? ` in chain ${chainId}` : ''} (${totalAtoms} atoms)`;

      } catch (error) {
        console.error('❌ Selection failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Failed to select residue ${selectedResidue}: ${errorMessage}`);
      }
    }, [extractSelectionFromLoci, updateSelectionState]);

    // Simplified residue range selection
    const selectResidueRange = useCallback(async (query: ResidueRangeQuery): Promise<string> => {
      console.log(`🎯 selectResidueRange called:`, query);
      
      const data = (window as any).molstar?.managers.structure.hierarchy.current.structures[0]?.cell?.obj?.data;
      if (!data) {
        return 'No structure data available';
      }

      try {
        const sel = Script.getStructureSelection(
          (Q: any) =>
            Q.struct.generator.atomGroups({
              "chain-test": Q.core.rel.eq([
                Q.struct.atomProperty.macromolecular.auth_asym_id(),
                query.chainId
              ]),
              "residue-test": Q.core.rel.inRange([
                Q.struct.atomProperty.macromolecular.label_seq_id(),
                query.startResidue,
                query.endResidue
              ]),
              "group-by": Q.struct.atomProperty.macromolecular.residueKey(),
            }),
          data
        );

        const loci = StructureSelection.toLociWithSourceUnits(sel);

        if (!loci.elements || loci.elements.length === 0) {
          throw new Error(`No residues found in range ${query.startResidue}-${query.endResidue} for chain ${query.chainId}`);
        }

        // Use both selection and highlighting
        (window as any).molstar?.managers.interactivity.lociSelects.selectOnly({ loci });
        (window as any).molstar?.managers.interactivity.lociHighlights.highlightOnly({ loci });

        const totalAtoms = loci.elements.reduce((acc: number, el: any) => {
          const indicesCount = el.indices?.length || (el.indices ? Array.from(el.indices).length : 0);
          return acc + indicesCount;
        }, 0);
        const estimatedResidues = Math.ceil(totalAtoms / 10);

        const selectionInfo: SelectionInfo = {
          chainId: query.chainId,
          residueNumber: query.startResidue,
          atomCount: totalAtoms,
          description: `Chain ${query.chainId}, residues ${query.startResidue}-${query.endResidue} (${estimatedResidues} residues)`,
          rangeStart: query.startResidue,
          rangeEnd: query.endResidue
        };

        updateSelectionState(selectionInfo);

        return `✅ Selected residues ${query.startResidue}-${query.endResidue} in chain ${query.chainId} (${estimatedResidues} residues, ${totalAtoms} atoms)`;

      } catch (error) {
        console.error('❌ Range selection failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Failed to select residue range: ${errorMessage}`);
      }
    }, [updateSelectionState]);

    // Show only selected region - IMPLEMENTED!
    const showOnlySelected = useCallback(async (): Promise<void> => {
      if (!pluginRef.current || !currentSelection) {
        throw new Error('No selection available or plugin not ready');
      }

      try {
        console.log('👁️ Starting show only selected for:', currentSelection);

        // Store current representations for later restoration
        const currentReprs = pluginRef.current.state.data.select(
          StateSelection.Generators.ofType(PluginStateObject.Molecule.Structure.Representation3D)
        );
        originalRepresentationsRef.current = currentReprs.map(repr => repr.transform.ref);

        // Remove all existing representations
        for (const repr of currentReprs) {
          await PluginCommands.State.RemoveObject(pluginRef.current, {
            state: pluginRef.current.state.data,
            ref: repr.transform.ref
          });
        }

        // Get the structure
        const structures = pluginRef.current.state.data.select(
          StateSelection.Generators.ofType(PluginStateObject.Molecule.Structure)
        );
        if (structures.length === 0) {
          throw new Error('No structure available');
        }

        const structure = structures[0];
        const data = structure.obj?.data;
        if (!data) {
          throw new Error('No structure data available');
        }

        // Create selection for the current selection
        let sel;
        if (currentSelection.rangeStart && currentSelection.rangeEnd && currentSelection.chainId) {
          // Handle range selection
          sel = Script.getStructureSelection(
            (Q: any) =>
              Q.struct.generator.atomGroups({
                "chain-test": Q.core.rel.eq([
                  Q.struct.atomProperty.macromolecular.auth_asym_id(),
                  currentSelection.chainId
                ]),
                "residue-test": Q.core.rel.inRange([
                  Q.struct.atomProperty.macromolecular.label_seq_id(),
                  currentSelection.rangeStart,
                  currentSelection.rangeEnd
                ]),
                "group-by": Q.struct.atomProperty.macromolecular.residueKey(),
              }),
            data
          );
        } else if (currentSelection.residueNumber && currentSelection.chainId) {
          // Handle single residue selection
          sel = Script.getStructureSelection(
            (Q: any) =>
              Q.struct.generator.atomGroups({
                "chain-test": Q.core.rel.eq([
                  Q.struct.atomProperty.macromolecular.auth_asym_id(),
                  currentSelection.chainId
                ]),
                "residue-test": Q.core.rel.eq([
                  Q.struct.atomProperty.macromolecular.label_seq_id(),
                  currentSelection.residueNumber,
                ]),
                "group-by": Q.struct.atomProperty.macromolecular.residueKey(),
              }),
            data
          );
        } else {
          throw new Error('Invalid selection - missing chain or residue information');
        }

        // Create a new structure with only the selected part
        const selectedStructure = await pluginRef.current.builders.structure.createStructure(
          structure,
          { selection: sel }
        );

        // Create representation for the selected structure only
        await pluginRef.current.builders.structure.representation.addRepresentation(selectedStructure, {
          type: 'cartoon',
          color: 'chain-id'
        });

        // Focus camera on the selected region
        const loci = StructureSelection.toLociWithSourceUnits(sel);
        if (loci.elements && loci.elements.length > 0) {
          await PluginCommands.Camera.Focus(pluginRef.current, { loci });
        }

        selectionOnlyModeRef.current = true;
        console.log('✅ Successfully showing only selected region');

      } catch (error) {
        console.error('❌ Failed to show only selected:', error);
        throw error;
      }
    }, [currentSelection]);

    // Hide only selected (restore full structure) - NEW!
    const hideOnlySelected = useCallback(async (): Promise<void> => {
      if (!pluginRef.current || !selectionOnlyModeRef.current) {
        return; // Not in selection-only mode
      }

      try {
        console.log('👁️ Restoring full structure view');

        // Remove current representations
        const currentReprs = pluginRef.current.state.data.select(
          StateSelection.Generators.ofType(PluginStateObject.Molecule.Structure.Representation3D)
        );
        for (const repr of currentReprs) {
          await PluginCommands.State.RemoveObject(pluginRef.current, {
            state: pluginRef.current.state.data,
            ref: repr.transform.ref
          });
        }

        // Get the main structure and recreate full representation
        const structures = pluginRef.current.state.data.select(
          StateSelection.Generators.ofType(PluginStateObject.Molecule.Structure)
        );
        if (structures.length > 0) {
          await pluginRef.current.builders.structure.representation.addRepresentation(structures[0], {
            type: 'cartoon',
            color: 'chain-id'
          });
        }

        // Reset camera to show full structure
        await PluginCommands.Camera.Reset(pluginRef.current);

        selectionOnlyModeRef.current = false;
        originalRepresentationsRef.current = [];
        console.log('✅ Successfully restored full structure view');

      } catch (error) {
        console.error('❌ Failed to restore full structure:', error);
        throw error;
      }
    }, []);

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
        
        // Make molstar globally accessible (critical for your working approach)
        (window as any).molstar = plugin;
        console.log('✅ Molstar plugin initialized and made globally accessible');
        
        // Setup selection monitoring - CRITICAL FOR MANUAL SELECTION CAPTURE
        setupSelectionMonitoring(plugin);
        
        setIsInitialized(true);
        onReady?.(plugin);
      } catch (error) {
        console.error('❌ Failed to initialize molstar plugin:', error);
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
        updateSelectionState(null);
        selectionOnlyModeRef.current = false;
        originalRepresentationsRef.current = [];

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
        
        console.log('✅ Structure loaded successfully');
        
      } catch (error) {
        console.error('❌ Failed to load structure:', error);
        onError?.(error as Error);
      } finally {
        setIsLoading(false);
      }
    }, [onError, updateSelectionState]);

    // Clear selection
    const clearSelection = useCallback(async (): Promise<void> => {
      try {
        // Clear both selections and highlights using global molstar access
        (window as any).molstar?.managers.interactivity.lociSelects.clear();
        (window as any).molstar?.managers.interactivity.lociHighlights.clear();
        
        // Clear current selection state
        updateSelectionState(null);
        
        console.log('✅ Selection cleared');
      } catch (error) {
        console.error('❌ Failed to clear selection:', error);
        throw error;
      }
    }, [updateSelectionState]);

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
        console.error('❌ Failed to set representation:', error);
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
        console.error('❌ Failed to show water molecules:', error);
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
          throw new Error('No water molecules found to hide');
        }

      } catch (error) {
        console.error('❌ Failed to hide water molecules:', error);
        throw error;
      }
    }, []);

    // Hide ligands
    const hideLigands = useCallback(async () => {
      try {
        console.log('💊 Hide ligands functionality would be implemented here');
      } catch (error) {
        console.error('❌ Failed to hide ligands:', error);
        throw error;
      }
    }, []);

    // Focus on specific chain
    const focusOnChain = useCallback(async (chainId: string) => {
      try {
        console.log(`🔗 Focus on chain ${chainId} functionality would be implemented here`);
      } catch (error) {
        console.error('❌ Failed to focus on chain:', error);
        throw error;
      }
    }, []);

    // Get selection information - Enhanced implementation
    const getSelectionInfo = useCallback(async (): Promise<string> => {
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
        console.error('❌ Failed to get selection info:', error);
        return 'Unable to access selection information. Please ensure a structure is loaded and try clicking on the protein to select parts of it.';
      }
    }, [currentSelection]);

    // Get current selection
    const getCurrentSelection = useCallback(() => {
      return currentSelection;
    }, [currentSelection]);

    // Highlight specific chain
    const highlightChain = useCallback(async (chainId: string) => {
      try {
        console.log(`🎯 Highlight chain ${chainId} functionality would be implemented here`);
      } catch (error) {
        console.error('❌ Failed to highlight chain:', error);
        throw error;
      }
    }, []);

    // Clear all highlights
    const clearHighlights = useCallback(async () => {
      if (!pluginRef.current) return;

      try {
        await PluginCommands.Interactivity.ClearHighlights(pluginRef.current);
      } catch (error) {
        console.error('❌ Failed to clear highlights:', error);
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
        console.error('❌ Failed to get structure info:', error);
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
      hideOnlySelected,
      highlightChain,
      clearHighlights,
      getStructureInfo,
      getCurrentSelection,
      selectResidueRange,
      clearSelection,
      selectResidue
    }), [
      loadStructure, resetView, zoomIn, zoomOut, setRepresentation, getPlugin,
      showWaterMolecules, hideWaterMolecules, hideLigands, focusOnChain, getSelectionInfo,
      showOnlySelected, hideOnlySelected, highlightChain, clearHighlights, getStructureInfo, getCurrentSelection,
      selectResidueRange, clearSelection, selectResidue
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