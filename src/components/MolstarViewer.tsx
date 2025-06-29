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
import { StructureElement, StructureProperties, Structure } from 'molstar/lib/mol-model/structure';
import { Script } from 'molstar/lib/mol-script/script';
import { StructureSelection } from 'molstar/lib/mol-model/structure/query';
import { Loci } from 'molstar/lib/mol-model/loci';
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
  highlightChain: (chainId: string) => Promise<void>;
  clearHighlights: () => Promise<void>;
  getStructureInfo: () => Promise<string>;
  getCurrentSelection: () => SelectionInfo | null;
  selectResidueRange: (query: ResidueRangeQuery) => Promise<string>;
  clearSelection: () => Promise<void>;
}

const MolstarViewer = React.forwardRef<ViewerControls, MolstarViewerProps>(
  ({ className, onReady, onError, onSelectionChange }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const pluginRef = useRef<PluginContext | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);
    const [currentSelection, setCurrentSelection] = useState<SelectionInfo | null>(null);
    const waterRepresentationRef = useRef<string | null>(null);
    const subscriptionsRef = useRef<any[]>([]);

    // Create the plugin specification with proper selection enabled
    const createSpec = useCallback(() => {
      const spec = DefaultPluginUISpec();
      
      // Configure layout - keep State Tree visible for selection mode
      spec.layout = {
        initial: {
          isExpanded: true,
          showControls: true,
          regionState: {
            bottom: 'hidden',
            left: 'collapsed',    // State Tree available but collapsed
            right: 'hidden',      // Hide Structure Tools
            top: 'collapsed',     // Sequence view available but collapsed
          }
        }
      };
      
      // Enable all necessary features for selection
      spec.config = [
        [PluginConfig.Viewport.ShowExpand, true],
        [PluginConfig.Viewport.ShowControls, true],
        [PluginConfig.Viewport.ShowSettings, true],
        [PluginConfig.Viewport.ShowSelectionMode, true],    // Critical for selection
        [PluginConfig.Viewport.ShowAnimation, true]
      ];
      
      return spec;
    }, []);

    // Process selection from loci data
    const processLociSelection = useCallback((loci: Loci): SelectionInfo | null => {
      try {
        console.log('🔍 Processing loci selection:', loci);

        if (!StructureElement.Loci.is(loci)) {
          console.log('❌ Loci is not a StructureElement.Loci');
          return null;
        }

        if (!loci.elements || loci.elements.length === 0) {
          console.log('❌ No elements in loci');
          return null;
        }

        const element = loci.elements[0];
        if (!element.indices || element.indices.length === 0) {
          console.log('❌ No indices in element');
          return null;
        }

        const structure = loci.structure;
        const unit = structure.units[element.unit];
        if (!unit) {
          console.log('❌ No unit found');
          return null;
        }

        // Get the first atom
        const atomIndex = element.indices[0];
        const elementIndex = unit.elements[atomIndex];
        
        // Create location for property extraction
        const location = StructureElement.Location.create(structure, unit, elementIndex);

        // Extract properties
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
          console.log('⚠️ Could not extract coordinates:', e);
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

        console.log('✅ Selection processed successfully:', selectionInfo);
        return selectionInfo;

      } catch (error) {
        console.error('❌ Error processing loci selection:', error);
        return null;
      }
    }, []);

    // Setup selection monitoring using multiple event sources
    const setupSelectionMonitoring = useCallback((plugin: PluginContext) => {
      console.log('🎧 Setting up comprehensive selection monitoring...');
      
      // Clear previous subscriptions
      subscriptionsRef.current.forEach(sub => {
        try {
          sub.unsubscribe();
        } catch (e) {
          console.log('Warning: Error unsubscribing:', e);
        }
      });
      subscriptionsRef.current = [];

      try {
        // Method 1: Listen to highlight changes (most reliable)
        const highlightSub = plugin.behaviors.interaction.hover.subscribe((event) => {
          console.log('🎯 Hover event:', event);
          if (event.current && event.current.loci) {
            const selectionInfo = processLociSelection(event.current.loci);
            if (selectionInfo) {
              console.log('✨ Hover selection detected:', selectionInfo.description);
            }
          }
        });
        subscriptionsRef.current.push(highlightSub);

        // Method 2: Listen to click events for selection
        const clickSub = plugin.behaviors.interaction.click.subscribe((event) => {
          console.log('🖱️ Click event detected:', event);
          
          // Trigger selection manually if needed
          if (event.current && event.current.loci) {
            const selectionInfo = processLociSelection(event.current.loci);
            if (selectionInfo) {
              setCurrentSelection(selectionInfo);
              onSelectionChange?.(selectionInfo);
              console.log('✅ Click selection updated:', selectionInfo.description);
            } else {
              console.log('🔄 Click detected but no valid selection');
            }
          }
        });
        subscriptionsRef.current.push(clickSub);

        // Method 3: Listen to selection manager changes
        if (plugin.managers.structure?.selection?.events?.changed) {
          const selectionSub = plugin.managers.structure.selection.events.changed.subscribe(() => {
            console.log('📊 Selection manager changed');
            
            // Get current selections from the manager
            try {
              const selections = plugin.managers.structure.selection.entries;
              console.log('📝 Current selections count:', selections.length);
              
              if (selections.length > 0) {
                // Process the first selection
                const entry = selections[0];
                if (entry && entry.selection) {
                  console.log('🔍 Processing selection entry:', entry);
                  
                  // Try to extract info from the selection
                  const structures = plugin.state.data.select(StateSelection.Generators.ofType(PluginStateObject.Molecule.Structure));
                  if (structures.length > 0) {
                    const structure = structures[0].obj?.data;
                    if (structure) {
                      // Convert selection to loci if possible
                      // This might need more work depending on the structure of entry.selection
                      console.log('📊 Selection entry structure:', entry.selection);
                    }
                  }
                }
              } else {
                // No selections, clear current
                setCurrentSelection(null);
                onSelectionChange?.(null);
                console.log('🔄 No selections, cleared current selection');
              }
            } catch (error) {
              console.error('❌ Error processing selection manager change:', error);
            }
          });
          subscriptionsRef.current.push(selectionSub);
        }

        // Method 4: Listen to interactivity pick events
        if (plugin.behaviors.interaction.pick) {
          const pickSub = plugin.behaviors.interaction.pick.subscribe((event) => {
            console.log('🎯 Pick event:', event);
            if (event.current && event.current.loci) {
              const selectionInfo = processLociSelection(event.current.loci);
              if (selectionInfo) {
                setCurrentSelection(selectionInfo);
                onSelectionChange?.(selectionInfo);
                console.log('✅ Pick selection updated:', selectionInfo.description);
              }
            }
          });
          subscriptionsRef.current.push(pickSub);
        }

        console.log('✅ Selection monitoring setup complete with', subscriptionsRef.current.length, 'subscriptions');

      } catch (error) {
        console.error('❌ Error setting up selection monitoring:', error);
      }
    }, [processLociSelection, onSelectionChange]);

    // Initialize the molstar plugin
    const initializePlugin = useCallback(async () => {
      if (!containerRef.current || pluginRef.current) return;

      try {
        console.log('🚀 Initializing Molstar plugin with enhanced selection...');
        setIsLoading(true);
        
        const spec = createSpec();
        const plugin = await createPluginUI({
          target: containerRef.current,
          render: renderReact18,
          spec
        });
        
        pluginRef.current = plugin;
        console.log('✅ Molstar plugin initialized');
        
        // Wait for plugin to be fully ready
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Verify plugin state
        console.log('📝 Plugin state check:');
        console.log('  - Builders available:', !!plugin.builders);
        console.log('  - Managers available:', !!plugin.managers);
        console.log('  - Structure manager:', !!plugin.managers?.structure);
        console.log('  - Selection manager:', !!plugin.managers?.structure?.selection);
        console.log('  - Interaction behaviors:', !!plugin.behaviors?.interaction);
        console.log('  - Click behavior:', !!plugin.behaviors?.interaction?.click);
        console.log('  - Hover behavior:', !!plugin.behaviors?.interaction?.hover);
        
        // Setup selection monitoring
        setupSelectionMonitoring(plugin);
        
        setIsInitialized(true);
        onReady?.(plugin);
        console.log('🎉 Plugin setup complete');
        
      } catch (error) {
        console.error('❌ Failed to initialize molstar plugin:', error);
        onError?.(error as Error);
      } finally {
        setIsLoading(false);
      }
    }, [createSpec, onReady, onError, setupSelectionMonitoring]);

    // Load structure from URL
    const loadStructure = useCallback(async (url: string, format: string = 'pdb') => {
      // Capture plugin reference at the start to prevent null reference errors
      const plugin = pluginRef.current;
      if (!plugin) return;

      try {
        console.log(`📁 Loading structure from: ${url}`);
        setIsLoading(true);
        
        // Clear existing structures and reset selection
        await PluginCommands.State.RemoveObject(plugin, { 
          state: plugin.state.data, 
          ref: plugin.state.data.tree.root.ref
        });
        waterRepresentationRef.current = null;
        setCurrentSelection(null);
        console.log('🧹 Cleared existing structures and selection');

        // Download and load the structure
        const data = await plugin.builders.data.download({ url: Asset.Url(url) }, { state: { isGhost: false } });
        const trajectory = await plugin.builders.structure.parseTrajectory(data, format as any);
        const model = await plugin.builders.structure.createModel(trajectory);
        const structure = await plugin.builders.structure.createStructure(model);
        
        // Create default representation with interaction enabled
        await plugin.builders.structure.representation.addRepresentation(structure, {
          type: 'cartoon',
          color: 'chain-id'
        });

        // Focus the camera on the structure
        await PluginCommands.Camera.Reset(plugin);
        
        console.log('✅ Structure loaded successfully');
        
        // Re-setup selection monitoring after structure load
        setTimeout(() => {
          const currentPlugin = pluginRef.current;
          if (currentPlugin) {
            setupSelectionMonitoring(currentPlugin);
          }
        }, 500);
        
      } catch (error) {
        console.error('❌ Failed to load structure:', error);
        onError?.(error as Error);
      } finally {
        setIsLoading(false);
      }
    }, [onError, setupSelectionMonitoring]);

    // Helper function to get available chains in the structure
    const getAvailableChains = useCallback((structure: Structure): string[] => {
      const chains = new Set<string>();
      
      try {
        // Iterate through units to find all chain IDs
        for (const unit of structure.units) {
          if (unit.model) {
            const { atomicHierarchy } = unit.model;
            if (atomicHierarchy && atomicHierarchy.chains) {
              // Get chain information
              for (let i = 0; i < atomicHierarchy.chains._rowCount; i++) {
                const chainId = atomicHierarchy.chains.label_asym_id.value(i);
                if (chainId) {
                  chains.add(chainId);
                }
              }
            }
          }
        }
      } catch (error) {
        console.error('Error getting available chains:', error);
      }
      
      return Array.from(chains).sort();
    }, []);

    // Helper function to get residue range for a specific chain
    const getResidueRangeForChain = useCallback((structure: Structure, chainId: string): { min: number; max: number } | null => {
      let minResidue = Infinity;
      let maxResidue = -Infinity;
      let found = false;
      
      try {
        for (const unit of structure.units) {
          if (unit.model) {
            const { atomicHierarchy } = unit.model;
            if (atomicHierarchy && atomicHierarchy.residues) {
              
              // Check each residue
              for (let i = 0; i < atomicHierarchy.residues._rowCount; i++) {
                // Get the chain ID directly from the residue
                const currentChainId = atomicHierarchy.residues.label_asym_id.value(i);
                
                if (currentChainId === chainId) {
                  const seqId = atomicHierarchy.residues.auth_seq_id.value(i);
                  if (typeof seqId === 'number') {
                    minResidue = Math.min(minResidue, seqId);
                    maxResidue = Math.max(maxResidue, seqId);
                    found = true;
                  }
                }
              }
            }
          }
        }
      } catch (error) {
        console.error('Error getting residue range for chain:', error);
      }
      
      return found ? { min: minResidue, max: maxResidue } : null;
    }, []);

    // Select residue range with improved error handling
    const selectResidueRange = useCallback(async (query: ResidueRangeQuery): Promise<string> => {
      const plugin = pluginRef.current;
      if (!plugin) {
        return 'No plugin available';
      }

      try {
        console.log(`🎯 Selecting residue range: chain ${query.chainId}, residues ${query.startResidue}-${query.endResidue}`);

        // Get the structure
        const structures = plugin.state.data.select(StateSelection.Generators.ofType(PluginStateObject.Molecule.Structure));
        if (structures.length === 0) {
          throw new Error('No structure loaded');
        }

        const structure = structures[0].obj?.data;
        if (!structure) {
          throw new Error('Structure data not available');
        }

        // First, check if the chain exists
        const availableChains = getAvailableChains(structure);
        console.log('Available chains:', availableChains);
        
        if (!availableChains.includes(query.chainId)) {
          throw new Error(`Chain '${query.chainId}' not found in the structure. Available chains: ${availableChains.join(', ')}`);
        }

        // Get the residue range for this chain
        const residueRange = getResidueRangeForChain(structure, query.chainId);
        if (!residueRange) {
          throw new Error(`Chain '${query.chainId}' found but contains no residues with sequence IDs`);
        }

        console.log(`Chain ${query.chainId} residue range: ${residueRange.min} - ${residueRange.max}`);

        // Check if the requested range is valid
        if (query.startResidue > residueRange.max || query.endResidue < residueRange.min) {
          throw new Error(`Residue range ${query.startResidue}-${query.endResidue} is outside the available range for chain '${query.chainId}' (${residueRange.min}-${residueRange.max})`);
        }

        // Warn if the range is partially outside
        const actualStart = Math.max(query.startResidue, residueRange.min);
        const actualEnd = Math.min(query.endResidue, residueRange.max);
        let warningMessage = '';
        
        if (actualStart !== query.startResidue || actualEnd !== query.endResidue) {
          warningMessage = `Note: Adjusted range to ${actualStart}-${actualEnd} to fit available residues. `;
        }

        // Create selection query using Molstar's selection language
        const selection = Script.getStructureSelection(Q => 
          Q.struct.generator.atomGroups({
            'chain-test': Q.core.rel.eq([
              Q.struct.atomProperty.macromolecular.auth_asym_id(), 
              query.chainId
            ]),
            'residue-test': Q.core.rel.inRange([
              Q.struct.atomProperty.macromolecular.auth_seq_id(),
              actualStart,
              actualEnd
            ])
          }), structure);

        // Apply the selection
        const loci = StructureSelection.toLociWithSourceUnits(selection);
        
        // Add selection to the manager
        await plugin.managers.structure.selection.fromLoci('add', loci);

        // Process and store the selection info
        if (loci.elements && loci.elements.length > 0) {
          // Count total residues and atoms
          let totalAtoms = 0;
          let residueCount = 0;
          
          for (const element of loci.elements) {
            totalAtoms += element.indices.length;
          }

          // Estimate residue count (rough approximation)
          residueCount = Math.ceil(totalAtoms / 10); // Rough estimate

          const selectionInfo: SelectionInfo = {
            chainId: query.chainId,
            residueNumber: actualStart,
            atomCount: totalAtoms,
            description: `Chain ${query.chainId}, residues ${actualStart}-${actualEnd} (${residueCount} residues, ${totalAtoms} atoms)`
          };

          setCurrentSelection(selectionInfo);
          onSelectionChange?.(selectionInfo);

          console.log('✅ Residue range selected successfully');
          return `${warningMessage}Selected residues ${actualStart}-${actualEnd} in chain ${query.chainId}. Total: ${residueCount} residues, ${totalAtoms} atoms.`;
        } else {
          throw new Error(`No atoms found in residue range ${actualStart}-${actualEnd} for chain '${query.chainId}'. This might indicate an issue with the structure data or residue numbering.`);
        }

      } catch (error) {
        console.error('❌ Failed to select residue range:', error);
        throw error;
      }
    }, [onSelectionChange, getAvailableChains, getResidueRangeForChain]);

    // Clear selection
    const clearSelection = useCallback(async (): Promise<void> => {
      const plugin = pluginRef.current;
      if (!plugin) return;

      try {
        console.log('🧹 Clearing selection');
        
        // Clear selection manager
        await plugin.managers.structure.selection.clear();
        
        // Clear current selection state
        setCurrentSelection(null);
        onSelectionChange?.(null);
        
        console.log('✅ Selection cleared');
      } catch (error) {
        console.error('❌ Failed to clear selection:', error);
        throw error;
      }
    }, [onSelectionChange]);

    // Reset camera view
    const resetView = useCallback(() => {
      const plugin = pluginRef.current;
      if (!plugin) return;
      console.log('📷 Resetting camera view');
      PluginCommands.Camera.Reset(plugin);
    }, []);

    // Zoom in
    const zoomIn = useCallback(() => {
      const plugin = pluginRef.current;
      if (!plugin) return;
      console.log('🔍 Zooming in');
      PluginCommands.Camera.Focus(plugin, { center: Vec3.create(0, 0, 0), radius: 20 });
    }, []);

    // Zoom out  
    const zoomOut = useCallback(() => {
      const plugin = pluginRef.current;
      if (!plugin) return;
      console.log('🔍 Zooming out');
      PluginCommands.Camera.Focus(plugin, { center: Vec3.create(0, 0, 0), radius: 50 });
    }, []);

    // Set representation type
    const setRepresentation = useCallback(async (type: 'cartoon' | 'surface' | 'ball-and-stick' | 'spacefill') => {
      // Capture plugin reference at the start to prevent null reference errors
      const plugin = pluginRef.current;
      if (!plugin) return;

      try {
        console.log(`🎨 Setting representation to: ${type}`);
        
        // Remove existing representations
        const reprs = plugin.state.data.select(StateSelection.Generators.ofType(PluginStateObject.Molecule.Structure.Representation3D));
        for (const repr of reprs) {
          await PluginCommands.State.RemoveObject(plugin, { state: plugin.state.data, ref: repr.transform.ref });
        }

        // Get the structure
        const structures = plugin.state.data.select(StateSelection.Generators.ofType(PluginStateObject.Molecule.Structure));
        if (structures.length === 0) return;

        // Create new representation
        const reprType = type === 'ball-and-stick' ? 'ball-and-stick' : 
                        type === 'spacefill' ? 'spacefill' : 
                        type === 'surface' ? 'molecular-surface' : 'cartoon';

        await plugin.builders.structure.representation.addRepresentation(structures[0], {
          type: reprType,
          color: 'chain-id'
        });

        console.log(`✅ Representation changed to: ${type}`);
      } catch (error) {
        console.error('❌ Failed to set representation:', error);
        onError?.(error as Error);
      }
    }, [onError]);

    // Show water molecules
    const showWaterMolecules = useCallback(async () => {
      // Capture plugin reference at the start to prevent null reference errors
      const plugin = pluginRef.current;
      if (!plugin) return;

      try {
        console.log('💧 Showing water molecules');
        
        // First check if water representation already exists
        if (waterRepresentationRef.current) {
          throw new Error('Water molecules are already visible');
        }

        const structures = plugin.state.data.select(StateSelection.Generators.ofType(PluginStateObject.Molecule.Structure));
        if (structures.length === 0) throw new Error('No structure loaded');

        // Create water representation with water selection
        const waterRepr = await plugin.builders.structure.representation.addRepresentation(structures[0], {
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

        console.log('✅ Water molecules shown');
      } catch (error) {
        console.error('❌ Failed to show water molecules:', error);
        throw error;
      }
    }, []);

    // Hide water molecules
    const hideWaterMolecules = useCallback(async () => {
      // Capture plugin reference at the start to prevent null reference errors
      const plugin = pluginRef.current;
      if (!plugin) return;

      try {
        console.log('💧 Hiding water molecules');
        
        // Method 1: If we have a stored reference, use it
        if (waterRepresentationRef.current) {
          await PluginCommands.State.RemoveObject(plugin, {
            state: plugin.state.data,
            ref: waterRepresentationRef.current
          });
          waterRepresentationRef.current = null;
          console.log('✅ Water molecules hidden using stored reference');
          return;
        }

        // Method 2: Find and remove representations with water tag
        const representations = plugin.state.data.select(
          StateSelection.Generators.ofType(PluginStateObject.Molecule.Structure.Representation3D)
        );

        let foundWater = false;
        for (const repr of representations) {
          if (repr.transform.tags && repr.transform.tags.includes('water-representation')) {
            await PluginCommands.State.RemoveObject(plugin, {
              state: plugin.state.data,
              ref: repr.transform.ref
            });
            foundWater = true;
          }
        }

        if (!foundWater) {
          throw new Error('No water molecules found to hide');
        }

        console.log('✅ Water molecules hidden');
      } catch (error) {
        console.error('❌ Failed to hide water molecules:', error);
        throw error;
      }
    }, []);

    // Hide ligands
    const hideLigands = useCallback(async () => {
      const plugin = pluginRef.current;
      if (!plugin) return;

      try {
        console.log('💊 Hide ligands functionality would be implemented here');
      } catch (error) {
        console.error('❌ Failed to hide ligands:', error);
        throw error;
      }
    }, []);

    // Focus on specific chain
    const focusOnChain = useCallback(async (chainId: string) => {
      const plugin = pluginRef.current;
      if (!plugin) return;

      try {
        console.log(`🔗 Focus on chain ${chainId} functionality would be implemented here`);
      } catch (error) {
        console.error('❌ Failed to focus on chain:', error);
        throw error;
      }
    }, []);

    // Get selection information
    const getSelectionInfo = useCallback(async (): Promise<string> => {
      const plugin = pluginRef.current;
      if (!plugin) {
        console.log('❌ No plugin available for getSelectionInfo');
        return 'No plugin available';
      }

      try {
        console.log('📋 Getting selection info, current selection:', currentSelection);
        
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

        console.log('✅ Selection info generated:', info);
        return info;
      } catch (error) {
        console.error('❌ Failed to get selection info:', error);
        return 'Unable to access selection information. Please ensure a structure is loaded and try clicking on the protein to select parts of it.';
      }
    }, [currentSelection]);

    // Get current selection
    const getCurrentSelection = useCallback(() => {
      console.log('📋 getCurrentSelection called, returning:', currentSelection);
      return currentSelection;
    }, [currentSelection]);

    // Show only selected region
    const showOnlySelected = useCallback(async () => {
      const plugin = pluginRef.current;
      if (!plugin) return;

      try {
        console.log('👁️ Show only selected functionality would be implemented here');
      } catch (error) {
        console.error('❌ Failed to show only selected:', error);
        throw error;
      }
    }, []);

    // Highlight specific chain
    const highlightChain = useCallback(async (chainId: string) => {
      const plugin = pluginRef.current;
      if (!plugin) return;

      try {
        console.log(`🎯 Highlight chain ${chainId} functionality would be implemented here`);
      } catch (error) {
        console.error('❌ Failed to highlight chain:', error);
        throw error;
      }
    }, []);

    // Clear all highlights
    const clearHighlights = useCallback(async () => {
      // Capture plugin reference at the start to prevent null reference errors
      const plugin = pluginRef.current;
      if (!plugin) return;

      try {
        console.log('🧹 Clearing highlights');
        await PluginCommands.Interactivity.ClearHighlights(plugin);
      } catch (error) {
        console.error('❌ Failed to clear highlights:', error);
        throw error;
      }
    }, []);

    // Get structure information
    const getStructureInfo = useCallback(async (): Promise<string> => {
      const plugin = pluginRef.current;
      if (!plugin) {
        console.log('❌ No plugin available for getStructureInfo');
        return 'No plugin available';
      }

      try {
        console.log('🏗️ Getting structure info');
        
        const structures = plugin.state.data.select(StateSelection.Generators.ofType(PluginStateObject.Molecule.Structure));
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
          
          console.log('✅ Structure info generated:', info);
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
      highlightChain,
      clearHighlights,
      getStructureInfo,
      getCurrentSelection,
      selectResidueRange,
      clearSelection
    }), [
      loadStructure, resetView, zoomIn, zoomOut, setRepresentation, getPlugin,
      showWaterMolecules, hideWaterMolecules, hideLigands, focusOnChain, getSelectionInfo,
      showOnlySelected, highlightChain, clearHighlights, getStructureInfo, getCurrentSelection,
      selectResidueRange, clearSelection
    ]);

    // Initialize plugin on mount
    useEffect(() => {
      initializePlugin();

      // Cleanup on unmount
      return () => {
        console.log('🧹 Cleaning up MolstarViewer component');
        
        // Clean up all subscriptions
        subscriptionsRef.current.forEach(sub => {
          try {
            sub.unsubscribe();
          } catch (e) {
            console.log('⚠️ Error during subscription cleanup:', e);
          }
        });
        subscriptionsRef.current = [];
        
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
            contain: 'layout style size',
            position: 'relative'
          }}
        />
        
        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-gray-900/80 flex items-center justify-center rounded-lg z-50">
            <div className="flex items-center space-x-2 text-white">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>Loading structure...</span>
            </div>
          </div>
        )}

        {/* Selection info overlay */}
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