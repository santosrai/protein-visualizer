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

    // Extract selection information from click/hover events
    const extractSelectionFromEvent = useCallback((plugin: PluginContext): SelectionInfo | null => {
      try {
        console.log('🔍 Extracting selection from current state...');
        
        // Get the current selection from the plugin state
        const selectionManager = plugin.managers.structure.selection;
        console.log('📋 Selection manager:', selectionManager);
        
        // Check if there are any selections
        if (!selectionManager || !selectionManager.state || !selectionManager.state.entries) {
          console.log('❌ No selection manager state or entries');
          return null;
        }

        console.log('📊 Selection state:', selectionManager.state);
        console.log('📊 Selection entries:', selectionManager.state.entries);

        // Get the first selection entry from the state
        const entries = Array.from(selectionManager.state.entries);
        console.log('📊 Number of entries in state:', entries.length);

        if (entries.length === 0) {
          console.log('❌ No selection entries in state');
          return null;
        }

        const [key, entry] = entries[0];
        console.log('🎯 First selection entry key:', key);
        console.log('🎯 First selection entry:', entry);

        if (!entry || !entry.selection) {
          console.log('❌ No selection in first entry');
          return null;
        }

        const selection = entry.selection;
        const structure = entry.structure;
        
        console.log('🧬 Selection object:', selection);
        console.log('🏗️ Structure object:', structure);

        if (!StructureElement.Loci.is(selection)) {
          console.log('❌ Selection is not a StructureElement.Loci');
          return null;
        }

        if (!selection.elements || selection.elements.length === 0) {
          console.log('❌ No elements in selection');
          return null;
        }

        console.log('🔢 Number of selected elements:', selection.elements.length);

        // Get the first element
        const element = selection.elements[0];
        console.log('⚛️ First selected element:', element);
        
        if (!element || !element.indices || element.indices.length === 0) {
          console.log('❌ No indices in first element');
          return null;
        }

        console.log('📍 Number of indices:', element.indices.length);

        const unit = structure.units[element.unit];
        if (!unit) {
          console.log('❌ No unit found for element');
          return null;
        }

        console.log('🧱 Unit:', unit);

        // Get the first atom index
        const atomIndex = element.indices[0];
        const elementIndex = unit.elements[atomIndex];
        
        console.log('🎯 Atom index:', atomIndex);
        console.log('🎯 Element index:', elementIndex);

        // Create location for property extraction
        const location = StructureElement.Location.create(structure, unit, elementIndex);
        console.log('📍 Location:', location);

        // Extract properties using StructureProperties
        const residueName = StructureProperties.residue.label_comp_id(location);
        const residueNumber = StructureProperties.residue.label_seq_id(location);
        const chainId = StructureProperties.chain.label_asym_id(location);
        const atomName = StructureProperties.atom.label_atom_id(location);
        const elementType = StructureProperties.atom.type_symbol(location);

        console.log('🧬 Extracted properties:');
        console.log('  - Residue name:', residueName);
        console.log('  - Residue number:', residueNumber);
        console.log('  - Chain ID:', chainId);
        console.log('  - Atom name:', atomName);
        console.log('  - Element type:', elementType);

        // Get coordinates
        let coordinates;
        try {
          const pos = unit.conformation.position(elementIndex, Vec3());
          coordinates = { x: pos[0], y: pos[1], z: pos[2] };
          console.log('📍 Coordinates:', coordinates);
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

        console.log('✅ Final selection info:', selectionInfo);
        return selectionInfo;
      } catch (error) {
        console.error('❌ Error extracting selection:', error);
        console.error('Stack trace:', error.stack);
        return null;
      }
    }, []);

    // Alternative method using interactivity manager
    const extractSelectionFromInteractivity = useCallback((plugin: PluginContext): SelectionInfo | null => {
      try {
        console.log('🔍 Trying interactivity manager approach...');
        
        // Get the interactivity manager which tracks hover/click
        const interactivity = plugin.managers.interactivity;
        console.log('🎮 Interactivity manager:', interactivity);

        if (!interactivity || !interactivity.lociHighlights) {
          console.log('❌ No interactivity manager or loci highlights');
          return null;
        }

        console.log('🎯 Loci highlights:', interactivity.lociHighlights);

        // Try to get the current loci (location of interaction)
        const highlights = interactivity.lociHighlights;
        
        // Check if highlights is a Map instance and has content
        if (!highlights || !(highlights instanceof Map) || highlights.size === 0) {
          console.log('❌ No highlights available or not a Map');
          return null;
        }

        console.log('📊 Number of highlights:', highlights.size);

        // Get the first highlight
        const firstHighlight = highlights.values().next().value;
        console.log('🎯 First highlight:', firstHighlight);

        if (!firstHighlight || !firstHighlight.loci) {
          console.log('❌ No loci in first highlight');
          return null;
        }

        const loci = firstHighlight.loci;
        console.log('📍 Loci:', loci);

        if (!StructureElement.Loci.is(loci)) {
          console.log('❌ Loci is not a StructureElement.Loci');
          return null;
        }

        if (!loci.elements || loci.elements.length === 0) {
          console.log('❌ No elements in loci');
          return null;
        }

        const element = loci.elements[0];
        const structure = loci.structure;
        
        console.log('⚛️ Element from loci:', element);
        console.log('🏗️ Structure from loci:', structure);

        if (!element.indices || element.indices.length === 0) {
          console.log('❌ No indices in loci element');
          return null;
        }

        const unit = structure.units[element.unit];
        if (!unit) {
          console.log('❌ No unit found for loci element');
          return null;
        }

        const atomIndex = element.indices[0];
        const elementIndex = unit.elements[atomIndex];
        
        const location = StructureElement.Location.create(structure, unit, elementIndex);

        // Extract properties
        const residueName = StructureProperties.residue.label_comp_id(location);
        const residueNumber = StructureProperties.residue.label_seq_id(location);
        const chainId = StructureProperties.chain.label_asym_id(location);
        const atomName = StructureProperties.atom.label_atom_id(location);
        const elementType = StructureProperties.atom.type_symbol(location);

        console.log('🧬 Extracted from interactivity:');
        console.log('  - Residue name:', residueName);
        console.log('  - Residue number:', residueNumber);
        console.log('  - Chain ID:', chainId);
        console.log('  - Atom name:', atomName);
        console.log('  - Element type:', elementType);

        let coordinates;
        try {
          const pos = unit.conformation.position(elementIndex, Vec3());
          coordinates = { x: pos[0], y: pos[1], z: pos[2] };
        } catch (e) {
          console.log('⚠️ Could not extract coordinates from interactivity:', e);
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

        console.log('✅ Selection info from interactivity:', selectionInfo);
        return selectionInfo;
      } catch (error) {
        console.error('❌ Error extracting from interactivity:', error);
        return null;
      }
    }, []);

    // Monitor selection changes using multiple approaches
    const setupSelectionMonitoring = useCallback((plugin: PluginContext) => {
      console.log('🎧 Setting up selection monitoring...');
      
      // Clean up previous subscription
      if (selectionSubscriptionRef.current) {
        console.log('🧹 Cleaning up previous subscription');
        selectionSubscriptionRef.current.unsubscribe();
      }

      // Method 1: Subscribe to selection changes
      try {
        selectionSubscriptionRef.current = plugin.managers.structure.selection.events.changed.subscribe(() => {
          console.log('🔔 Selection changed event triggered!');
          
          const selectionInfo = extractSelectionFromEvent(plugin);
          console.log('📄 Extracted selection info from event:', selectionInfo);
          
          if (selectionInfo) {
            setCurrentSelection(selectionInfo);
            onSelectionChange?.(selectionInfo);
            console.log('✨ Selection updated successfully:', selectionInfo.description);
          } else {
            console.log('🚫 No valid selection from event');
          }
        });
      } catch (error) {
        console.log('⚠️ Could not subscribe to selection events:', error);
      }

      // Method 2: Monitor click events
      const clickSubscription = plugin.behaviors.interaction.click.subscribe((event) => {
        console.log('👆 Click event detected:', event);
        
        setTimeout(() => {
          // Try multiple approaches
          let selectionInfo = extractSelectionFromEvent(plugin);
          
          if (!selectionInfo) {
            console.log('🔄 Trying interactivity manager approach...');
            selectionInfo = extractSelectionFromInteractivity(plugin);
          }
          
          console.log('👆 Final click-based selection info:', selectionInfo);
          
          if (selectionInfo) {
            setCurrentSelection(selectionInfo);
            onSelectionChange?.(selectionInfo);
            console.log('✨ Click selection updated:', selectionInfo.description);
          } else {
            console.log('🚫 No valid selection from click');
            // Don't clear selection immediately on failed extraction
          }
        }, 100); // Slightly longer delay
      });

      // Method 3: Monitor hover events as backup
      const hoverSubscription = plugin.behaviors.interaction.hover.subscribe((event) => {
        console.log('🖱️ Hover event detected:', event);
        
        // Only extract on hover if we don't have a current selection
        if (!currentSelection) {
          const selectionInfo = extractSelectionFromInteractivity(plugin);
          if (selectionInfo) {
            console.log('🖱️ Hover selection info:', selectionInfo);
            // Don't set as current selection, just log for debugging
          }
        }
      });

      console.log('✅ Selection monitoring setup complete');

      return () => {
        console.log('🧹 Cleaning up selection monitoring');
        if (selectionSubscriptionRef.current) {
          selectionSubscriptionRef.current.unsubscribe();
        }
        clickSubscription.unsubscribe();
        hoverSubscription.unsubscribe();
      };
    }, [extractSelectionFromEvent, extractSelectionFromInteractivity, onSelectionChange, currentSelection]);

    // Initialize the molstar plugin
    const initializePlugin = useCallback(async () => {
      if (!containerRef.current || pluginRef.current) return;

      try {
        console.log('🚀 Initializing Molstar plugin...');
        setIsLoading(true);
        const spec = createSpec();
        const plugin = await createPluginUI({
          target: containerRef.current,
          render: renderReact18,
          spec
        });
        pluginRef.current = plugin;
        console.log('✅ Molstar plugin initialized:', plugin);
        
        // Verify that essential plugin properties are available
        if (!plugin.builders) {
          throw new Error('Plugin builders not initialized - plugin is not ready for operations');
        }
        
        console.log('✅ Plugin builders verified:', plugin.builders);
        
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
      if (!pluginRef.current) return;

      try {
        console.log(`📁 Loading structure from: ${url}`);
        setIsLoading(true);
        
        // Clear existing structures and reset selection
        await PluginCommands.State.RemoveObject(pluginRef.current, { 
          state: pluginRef.current.state.data, 
          ref: pluginRef.current.state.data.tree.root.ref
        });
        waterRepresentationRef.current = null;
        setCurrentSelection(null);
        console.log('🧹 Cleared existing structures and selection');

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
    }, [onError]);

    // Reset camera view
    const resetView = useCallback(() => {
      if (!pluginRef.current) return;
      console.log('📷 Resetting camera view');
      PluginCommands.Camera.Reset(pluginRef.current);
    }, []);

    // Zoom in
    const zoomIn = useCallback(() => {
      if (!pluginRef.current) return;
      console.log('🔍 Zooming in');
      PluginCommands.Camera.Focus(pluginRef.current, { center: Vec3.create(0, 0, 0), radius: 20 });
    }, []);

    // Zoom out  
    const zoomOut = useCallback(() => {
      if (!pluginRef.current) return;
      console.log('🔍 Zooming out');
      PluginCommands.Camera.Focus(pluginRef.current, { center: Vec3.create(0, 0, 0), radius: 50 });
    }, []);

    // Set representation type
    const setRepresentation = useCallback(async (type: 'cartoon' | 'surface' | 'ball-and-stick' | 'spacefill') => {
      if (!pluginRef.current) return;

      try {
        console.log(`🎨 Setting representation to: ${type}`);
        
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

        console.log(`✅ Representation changed to: ${type}`);
      } catch (error) {
        console.error('❌ Failed to set representation:', error);
        onError?.(error as Error);
      }
    }, [onError]);

    // Show water molecules
    const showWaterMolecules = useCallback(async () => {
      if (!pluginRef.current) return;

      try {
        console.log('💧 Showing water molecules');
        
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

        console.log('✅ Water molecules shown');
      } catch (error) {
        console.error('❌ Failed to show water molecules:', error);
        throw error;
      }
    }, []);

    // Hide water molecules
    const hideWaterMolecules = useCallback(async () => {
      if (!pluginRef.current) return;

      try {
        console.log('💧 Hiding water molecules');
        
        // Method 1: If we have a stored reference, use it
        if (waterRepresentationRef.current) {
          await PluginCommands.State.RemoveObject(pluginRef.current, {
            state: pluginRef.current.state.data,
            ref: waterRepresentationRef.current
          });
          waterRepresentationRef.current = null;
          console.log('✅ Water molecules hidden using stored reference');
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

        console.log('✅ Water molecules hidden');
      } catch (error) {
        console.error('❌ Failed to hide water molecules:', error);
        throw error;
      }
    }, []);

    // Hide ligands
    const hideLigands = useCallback(async () => {
      if (!pluginRef.current) return;

      try {
        console.log('💊 Hide ligands functionality would be implemented here');
      } catch (error) {
        console.error('❌ Failed to hide ligands:', error);
        throw error;
      }
    }, []);

    // Focus on specific chain
    const focusOnChain = useCallback(async (chainId: string) => {
      if (!pluginRef.current) return;

      try {
        console.log(`🔗 Focus on chain ${chainId} functionality would be implemented here`);
      } catch (error) {
        console.error('❌ Failed to focus on chain:', error);
        throw error;
      }
    }, []);

    // Get selection information - Enhanced implementation
    const getSelectionInfo = useCallback(async (): Promise<string> => {
      if (!pluginRef.current) {
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
      if (!pluginRef.current) return;

      try {
        console.log('👁️ Show only selected functionality would be implemented here');
      } catch (error) {
        console.error('❌ Failed to show only selected:', error);
        throw error;
      }
    }, []);

    // Highlight specific chain
    const highlightChain = useCallback(async (chainId: string) => {
      if (!pluginRef.current) return;

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
        console.log('🧹 Clearing highlights');
        await PluginCommands.Interactivity.ClearHighlights(pluginRef.current);
      } catch (error) {
        console.error('❌ Failed to clear highlights:', error);
        throw error;
      }
    }, []);

    // Get structure information
    const getStructureInfo = useCallback(async (): Promise<string> => {
      if (!pluginRef.current) {
        console.log('❌ No plugin available for getStructureInfo');
        return 'No plugin available';
      }

      try {
        console.log('🏗️ Getting structure info');
        
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
        console.log('🧹 Cleaning up MolstarViewer component');
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