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

// Add a global registry to track active Molstar instances
const MOLSTAR_INSTANCES = new Set<string>();

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
    
    // Enhanced state management
    const mountedRef = useRef<boolean>(true);
    const initializingRef = useRef<boolean>(false);
    const instanceIdRef = useRef<string>(`molstar-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    const disposalTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
        console.log('🔍 Extracting selection info from location:', location);
        
        if (!location || !location.unit || !location.structure) {
          console.log('❌ Invalid location structure');
          return null;
        }
        
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
          if (unit && unit.conformation && typeof elementIndex !== 'undefined') {
            const pos = unit.conformation.position(elementIndex, Vec3());
            coordinates = { x: pos[0], y: pos[1], z: pos[2] };
            console.log('📍 Coordinates:', coordinates);
          }
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

    // Helper function to update selection state with mount checking
    const updateSelectionState = useCallback((selectionInfo: SelectionInfo | null) => {
      if (!mountedRef.current) {
        console.log('⚠️ Component unmounted - skipping selection update');
        return;
      }
      
      console.log('🔄 Updating selection state:', selectionInfo);
      setCurrentSelection(selectionInfo);
      onSelectionChange?.(selectionInfo);
      
      if (selectionInfo) {
        console.log('✅ Selection state updated successfully:', selectionInfo.description);
      } else {
        console.log('🗑️ Selection state cleared');
      }
    }, [onSelectionChange]);

    // Safe interaction event processing
    const processInteractionEvent = useCallback((eventData: any) => {
      if (!mountedRef.current) return;
      
      try {
        console.log('🖱️ Processing interaction event:', eventData);
        
        // Safely check for loci in the event data
        let loci = null;
        
        if (eventData && eventData.current && eventData.current.loci) {
          loci = eventData.current.loci;
        } else if (eventData && eventData.loci) {
          loci = eventData.loci;
        } else {
          console.log('⚠️ No loci found in interaction event');
          return;
        }
        
        if (!loci || !StructureElement.Loci.is(loci)) {
          console.log('⚠️ Invalid loci structure');
          return;
        }
        
        if (loci.elements && loci.elements.length > 0) {
          const element = loci.elements[0];
          const structure = loci.structure;
          
          if (!structure || !structure.units || !structure.units[element.unit]) {
            console.log('⚠️ Invalid structure or unit');
            return;
          }
          
          const unit = structure.units[element.unit];
          
          if (!element.indices || element.indices.length === 0) {
            console.log('⚠️ No indices in element');
            return;
          }
          
          const atomIndex = element.indices[0];
          const elementIndex = unit.elements[atomIndex];
          
          if (typeof elementIndex === 'undefined') {
            console.log('⚠️ Invalid element index');
            return;
          }
          
          const location = StructureElement.Location.create(structure, unit, elementIndex);
          
          const selectionInfo = extractSelectionInfo(location);
          if (selectionInfo) {
            const totalAtoms = loci.elements.reduce((acc: number, el: any) => acc + (el.indices?.length || 0), 0);
            selectionInfo.atomCount = totalAtoms;
            
            console.log('✅ Selection processed from interaction:', selectionInfo.description);
            updateSelectionState(selectionInfo);
          }
        }
      } catch (error) {
        console.log('⚠️ Error processing interaction event:', error);
      }
    }, [extractSelectionInfo, updateSelectionState]);

    // Robust selection monitoring setup
    const setupSelectionMonitoring = useCallback((plugin: PluginContext) => {
      console.log('🔍 Setting up enhanced selection monitoring...');
      
      // Clean up previous subscriptions
      if (selectionSubscriptionRef.current) {
        try {
          selectionSubscriptionRef.current.unsubscribe();
          selectionSubscriptionRef.current = null;
        } catch (error) {
          console.log('⚠️ Error cleaning up previous subscriptions:', error);
        }
      }

      try {
        // Method 1: Listen to structure selection manager changes
        const selectionSubscription = plugin.managers.structure.selection.events.changed.subscribe(() => {
          if (!mountedRef.current) return;
          
          console.log('🎯 Structure selection manager event fired');
          
          try {
            const manager = plugin.managers.structure.selection;
            
            if (manager.entries && manager.entries.length > 0) {
              const entry = manager.entries[0];
              if (entry && entry.selection && StructureElement.Loci.is(entry.selection)) {
                processInteractionEvent({ loci: entry.selection });
              }
            } else {
              console.log('🔄 Selection cleared via selection manager');
              updateSelectionState(null);
            }
          } catch (error) {
            console.log('⚠️ Error processing selection manager event:', error);
          }
        });

        // Method 2: Listen to click interactions as backup
        const clickSubscription = plugin.behaviors.interaction.click.subscribe((event) => {
          if (!mountedRef.current) return;
          
          console.log('🖱️ Click interaction event fired');
          
          // Delay processing to allow selection to be processed
          setTimeout(() => {
            if (!mountedRef.current) return;
            
            try {
              const currentHighlights = plugin.managers.interactivity.lociHighlights.current;
              if (currentHighlights && currentHighlights.loci) {
                processInteractionEvent({ loci: currentHighlights.loci });
              }
            } catch (error) {
              console.log('⚠️ Error processing click interaction:', error);
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
              console.log('⚠️ Error unsubscribing from events:', error);
            }
          }
        };

        console.log('✅ Enhanced selection monitoring setup complete');
        
      } catch (error) {
        console.error('❌ Error setting up selection monitoring:', error);
      }
    }, [processInteractionEvent, updateSelectionState]);

    // Safe manual extraction for programmatic selections
    const extractSelectionFromLoci = useCallback((loci: any): SelectionInfo | null => {
      try {
        console.log('🔍 Extracting selection from loci:', loci);
        
        if (!loci || !loci.elements || loci.elements.length === 0) {
          console.log('❌ No elements in loci');
          return null;
        }

        const element = loci.elements[0];
        if (!element || !element.indices || element.indices.length === 0) {
          console.log('❌ No valid indices found in element');
          return null;
        }

        const structure = loci.structure;
        if (!structure || !structure.units) {
          console.log('❌ No valid structure found');
          return null;
        }

        const unit = structure.units[element.unit];
        if (!unit) {
          console.log('❌ No unit found for element.unit:', element.unit);
          return null;
        }

        const atomIndex = element.indices[0];
        let elementIndex;
        
        if (unit.elements && atomIndex < unit.elements.length) {
          elementIndex = unit.elements[atomIndex];
        } else {
          elementIndex = atomIndex;
        }

        const location = StructureElement.Location.create(structure, unit, elementIndex);
        const selectionInfo = extractSelectionInfo(location);
        
        if (selectionInfo) {
          // Calculate total atom count
          const totalAtoms = loci.elements.reduce((acc: number, el: any) => {
            return acc + (el.indices?.length || 0);
          }, 0);
          selectionInfo.atomCount = totalAtoms;
          
          console.log('✅ Successfully extracted selection info from loci:', selectionInfo);
          return selectionInfo;
        }

        return null;

      } catch (error) {
        console.error('❌ Error in extractSelectionFromLoci:', error);
        return null;
      }
    }, [extractSelectionInfo]);

    // Robust single residue selection
    const selectResidue = useCallback(async (selectedResidue: number, chainId?: string): Promise<string> => {
      console.log(`🎯 selectResidue called with residue: ${selectedResidue}, chain: ${chainId}`);
      
      if (!mountedRef.current) {
        throw new Error('Component unmounted');
      }
      
      const data = (window as any).molstar?.managers.structure.hierarchy.current.structures[0]?.cell?.obj?.data;
      if (!data) {
        console.log('❌ No structure data available');
        return 'No structure data available';
      }

      try {
        const seq_id = selectedResidue;
        let sel;

        if (chainId) {
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

        const loci = StructureSelection.toLociWithSourceUnits(sel);

        if (!loci.elements || loci.elements.length === 0) {
          throw new Error(`Residue ${selectedResidue}${chainId ? ` in chain ${chainId}` : ''} not found`);
        }

        // Apply selection and highlighting
        (window as any).molstar?.managers.interactivity.lociSelects.selectOnly({ loci });
        (window as any).molstar?.managers.interactivity.lociHighlights.highlightOnly({ loci });

        // Extract selection info for state management
        const selectionInfo = extractSelectionFromLoci(loci);
        if (selectionInfo) {
          updateSelectionState(selectionInfo);
        } else {
          // Create fallback selection info
          const fallbackInfo: SelectionInfo = {
            residueNumber: selectedResidue,
            chainId: chainId,
            description: `Residue ${selectedResidue}${chainId ? ` in chain ${chainId}` : ''} (selected programmatically)`,
            atomCount: loci.elements.reduce((acc: number, el: any) => acc + (el.indices?.length || 0), 0)
          };
          updateSelectionState(fallbackInfo);
        }

        const totalAtoms = loci.elements.reduce((acc: number, el: any) => acc + (el.indices?.length || 0), 0);
        return `✅ Selected residue ${selectedResidue}${chainId ? ` in chain ${chainId}` : ''} (${totalAtoms} atoms)`;

      } catch (error) {
        console.error('❌ Selection failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Failed to select residue ${selectedResidue}: ${errorMessage}`);
      }
    }, [extractSelectionFromLoci, updateSelectionState]);

    // Residue range selection
    const selectResidueRange = useCallback(async (query: ResidueRangeQuery): Promise<string> => {
      console.log(`🎯 selectResidueRange called:`, query);
      
      if (!mountedRef.current) {
        throw new Error('Component unmounted');
      }
      
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

        (window as any).molstar?.managers.interactivity.lociSelects.selectOnly({ loci });
        (window as any).molstar?.managers.interactivity.lociHighlights.highlightOnly({ loci });

        const totalAtoms = loci.elements.reduce((acc: number, el: any) => acc + (el.indices?.length || 0), 0);
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

    // Show only selected region
    const showOnlySelected = useCallback(async (): Promise<void> => {
      if (!pluginRef.current || !currentSelection) {
        throw new Error('No selection available or plugin not ready');
      }

      try {
        console.log('👁️ Starting show only selected for:', currentSelection);

        const currentReprs = pluginRef.current.state.data.select(
          StateSelection.Generators.ofType(PluginStateObject.Molecule.Structure.Representation3D)
        );
        originalRepresentationsRef.current = currentReprs.map(repr => repr.transform.ref);

        for (const repr of currentReprs) {
          await PluginCommands.State.RemoveObject(pluginRef.current, {
            state: pluginRef.current.state.data,
            ref: repr.transform.ref
          });
        }

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

        let sel;
        if (currentSelection.rangeStart && currentSelection.rangeEnd && currentSelection.chainId) {
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

        const selectedStructure = await pluginRef.current.builders.structure.createStructure(
          structure,
          { selection: sel }
        );

        await pluginRef.current.builders.structure.representation.addRepresentation(selectedStructure, {
          type: 'cartoon',
          color: 'chain-id'
        });

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

    // Hide only selected (restore full structure)
    const hideOnlySelected = useCallback(async (): Promise<void> => {
      if (!pluginRef.current || !selectionOnlyModeRef.current) {
        return;
      }

      try {
        console.log('👁️ Restoring full structure view');

        const currentReprs = pluginRef.current.state.data.select(
          StateSelection.Generators.ofType(PluginStateObject.Molecule.Structure.Representation3D)
        );
        for (const repr of currentReprs) {
          await PluginCommands.State.RemoveObject(pluginRef.current, {
            state: pluginRef.current.state.data,
            ref: repr.transform.ref
          });
        }

        const structures = pluginRef.current.state.data.select(
          StateSelection.Generators.ofType(PluginStateObject.Molecule.Structure)
        );
        if (structures.length > 0) {
          await pluginRef.current.builders.structure.representation.addRepresentation(structures[0], {
            type: 'cartoon',
            color: 'chain-id'
          });
        }

        await PluginCommands.Camera.Reset(pluginRef.current);

        selectionOnlyModeRef.current = false;
        originalRepresentationsRef.current = [];
        console.log('✅ Successfully restored full structure view');

      } catch (error) {
        console.error('❌ Failed to restore full structure:', error);
        throw error;
      }
    }, []);

    // Comprehensive cleanup function
    const cleanupPlugin = useCallback(() => {
      console.log('🧹 Starting comprehensive plugin cleanup...');
      
      // Clear any pending disposal timeouts
      if (disposalTimeoutRef.current) {
        clearTimeout(disposalTimeoutRef.current);
        disposalTimeoutRef.current = null;
      }
      
      // Set mounted to false immediately
      mountedRef.current = false;
      
      // Remove instance from global registry
      const instanceId = instanceIdRef.current;
      if (MOLSTAR_INSTANCES.has(instanceId)) {
        MOLSTAR_INSTANCES.delete(instanceId);
        console.log(`✅ Removed instance ${instanceId} from registry`);
      }
      
      // Clean up subscriptions
      if (selectionSubscriptionRef.current) {
        try {
          selectionSubscriptionRef.current.unsubscribe();
          selectionSubscriptionRef.current = null;
          console.log('✅ Selection subscriptions cleaned up');
        } catch (error) {
          console.log('⚠️ Error cleaning up subscriptions:', error);
        }
      }
      
      // Clean up global molstar reference if it's ours
      if ((window as any).molstar && (window as any).molstar._instanceId === instanceId) {
        (window as any).molstar = null;
        console.log('✅ Global molstar reference cleared');
      }
      
      // Dispose of plugin with proper error handling
      if (pluginRef.current) {
        try {
          // Try graceful disposal first
          pluginRef.current.dispose();
          console.log('✅ Plugin disposed gracefully');
        } catch (error) {
          console.log('⚠️ Error during plugin disposal:', error);
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
          
          console.log('✅ Container completely cleared');
        } catch (error) {
          console.log('⚠️ Error clearing container:', error);
        }
      }
      
      // Reset all state
      setIsInitialized(false);
      setIsLoading(false);
      setCurrentSelection(null);
      waterRepresentationRef.current = null;
      originalRepresentationsRef.current = [];
      selectionOnlyModeRef.current = false;
      initializingRef.current = false;
      
      console.log('✅ Plugin cleanup completed');
    }, []);

    // Enhanced initialization with prevention of multiple React roots
    const initializePlugin = useCallback(async () => {
      const instanceId = instanceIdRef.current;
      
      // Prevent multiple initializations
      if (!containerRef.current || pluginRef.current || initializingRef.current) {
        console.log('⚠️ Plugin initialization skipped - already initialized or in progress');
        return;
      }

      // Check if component is still mounted
      if (!mountedRef.current) {
        console.log('⚠️ Plugin initialization skipped - component unmounted');
        return;
      }

      // Check if this instance is already in the registry
      if (MOLSTAR_INSTANCES.has(instanceId)) {
        console.log('⚠️ Plugin initialization skipped - instance already exists');
        return;
      }

      try {
        console.log('🚀 Starting plugin initialization for instance:', instanceId);
        initializingRef.current = true;
        setIsLoading(true);
        
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
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        // Check mount status after delay
        if (!mountedRef.current) {
          console.log('⚠️ Component unmounted during initialization delay');
          MOLSTAR_INSTANCES.delete(instanceId);
          return;
        }
        
        const spec = createSpec();
        console.log('✅ Plugin spec created');
        
        // Create plugin with enhanced error handling
        const plugin = await createPluginUI({
          target: containerRef.current,
          render: renderReact18,
          spec
        });
        
        // Check if component is still mounted after async operation
        if (!mountedRef.current) {
          console.log('⚠️ Component unmounted during plugin creation - cleaning up');
          try {
            plugin.dispose();
          } catch (e) {
            console.log('⚠️ Error disposing plugin during unmount cleanup');
          }
          MOLSTAR_INSTANCES.delete(instanceId);
          return;
        }
        
        pluginRef.current = plugin;
        
        // Make molstar globally accessible with instance tracking
        (window as any).molstar = plugin;
        (window as any).molstar._instanceId = instanceId;
        console.log('✅ Molstar plugin initialized and made globally accessible');
        
        // Setup selection monitoring
        setupSelectionMonitoring(plugin);
        
        setIsInitialized(true);
        onReady?.(plugin);
        console.log('✅ Plugin initialization completed successfully');
        
      } catch (error) {
        console.error('❌ Failed to initialize molstar plugin:', error);
        MOLSTAR_INSTANCES.delete(instanceId);
        onError?.(error as Error);
        initializingRef.current = false;
        setIsInitialized(false);
      } finally {
        setIsLoading(false);
        initializingRef.current = false;
      }
    }, [createSpec, onReady, onError, setupSelectionMonitoring]);

    // Load structure from URL
    const loadStructure = useCallback(async (url: string, format: string = 'pdb') => {
      if (!pluginRef.current || !mountedRef.current) return;

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
        (window as any).molstar?.managers.interactivity.lociSelects.clear();
        (window as any).molstar?.managers.interactivity.lociHighlights.clear();
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
        console.error('❌ Failed to set representation:', error);
        onError?.(error as Error);
      }
    }, [onError]);

    // Show water molecules
    const showWaterMolecules = useCallback(async () => {
      if (!pluginRef.current) return;

      try {
        if (waterRepresentationRef.current) {
          throw new Error('Water molecules are already visible');
        }

        const structures = pluginRef.current.state.data.select(StateSelection.Generators.ofType(PluginStateObject.Molecule.Structure));
        if (structures.length === 0) throw new Error('No structure loaded');

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
        if (waterRepresentationRef.current) {
          await PluginCommands.State.RemoveObject(pluginRef.current, {
            state: pluginRef.current.state.data,
            ref: waterRepresentationRef.current
          });
          waterRepresentationRef.current = null;
          return;
        }

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

    // Get selection information
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

        const structure = structures[0];
        if (structure && structure.obj && structure.obj.data) {
          const data = structure.obj.data;
          
          let info = 'Structure Information:\n\n';
          
          if (data.atomicHierarchy) {
            const hierarchy = data.atomicHierarchy;
            info += `• Total atoms: ${hierarchy.atoms._rowCount || 'Unknown'}\n`;
            info += `• Total residues: ${hierarchy.residues._rowCount || 'Unknown'}\n`;
            info += `• Total chains: ${hierarchy.chains._rowCount || 'Unknown'}\n`;
          }
          
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

    // Enhanced mount and unmount handling
    useEffect(() => {
      // Set mounted flag
      mountedRef.current = true;
      console.log('🎯 Component mounting - initializing plugin');
      
      // Delay initialization slightly to ensure DOM is ready
      const initTimeout = setTimeout(() => {
        if (mountedRef.current) {
          initializePlugin();
        }
      }, 100);

      // Cleanup function
      return () => {
        console.log('🎯 Component unmounting - starting cleanup');
        
        // Clear initialization timeout if still pending
        clearTimeout(initTimeout);
        
        // Schedule cleanup with a small delay to ensure all async operations complete
        disposalTimeoutRef.current = setTimeout(() => {
          cleanupPlugin();
        }, 50);
      };
    }, [initializePlugin, cleanupPlugin]);

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
            <div className="flex items-center space-x-2 text-white">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>Loading structure...</span>
            </div>
          </div>
        )}

        {/* Basic controls overlay - FIXED: Proper z-index and pointer events */}
        {isInitialized && !isLoading && (
          <div className="absolute top-4 right-4 flex flex-col space-y-2 z-20" style={{ pointerEvents: 'auto' }}>
            <Button
              size="sm"
              variant="secondary"
              onClick={resetView}
              className="bg-gray-800/90 hover:bg-gray-700 text-white border-gray-600 pointer-events-auto"
            >
              <Home className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={zoomIn}
              className="bg-gray-800/90 hover:bg-gray-700 text-white border-gray-600 pointer-events-auto"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={zoomOut}
              className="bg-gray-800/90 hover:bg-gray-700 text-white border-gray-600 pointer-events-auto"
            >
              <ZoomOut className="h-4 w-4" />
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
      </div>
    );
  }
);

MolstarViewer.displayName = 'MolstarViewer';

export default MolstarViewer;