import { ViewerControls, ResidueRangeQuery } from '../components/MolstarViewer';

export interface MolstarCommand {
  name: string;
  description: string;
  execute: (viewer: ViewerControls, params?: any) => Promise<string>;
}

export class MolstarCommandProcessor {
  private viewer: ViewerControls | null = null;
  private commands: Map<string, MolstarCommand> = new Map();

  constructor() {
    this.initializeCommands();
  }

  setViewer(viewer: ViewerControls) {
    this.viewer = viewer;
  }

  private initializeCommands() {
    // FIXED: Water molecule commands now work
    this.commands.set('enable_water', {
      name: 'enable_water',
      description: 'Show water molecules',
      execute: async (viewer) => {
        try {
          await viewer.showWaterMolecules();
          return '💧 Water molecules are now visible! You can see HOH (water) residues displayed as small ball-and-stick structures.';
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          if (errorMsg.includes('No structure loaded')) {
            return 'Please load a protein structure first before showing water molecules.';
          }
          return `Failed to show water molecules: ${errorMsg}. This structure may not contain water molecules, or they may already be visible.`;
        }
      }
    });

    // Alternative command names for water
    this.commands.set('show_water', {
      name: 'show_water',
      description: 'Show water molecules',
      execute: async (viewer) => {
        return await this.commands.get('enable_water')!.execute(viewer);
      }
    });

    this.commands.set('hide_water', {
      name: 'hide_water',
      description: 'Hide water molecules',
      execute: async (viewer) => {
        try {
          await viewer.hideWaterMolecules();
          return '🚫 Water molecules have been hidden from view.';
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          return `Failed to hide water molecules: ${errorMsg}. They may not be currently visible.`;
        }
      }
    });

    this.commands.set('hide_ligands', {
      name: 'hide_ligands', 
      description: 'Hide ligand molecules',
      execute: async (viewer) => {
        try {
          await viewer.hideLigands();
          return 'Ligands have been hidden.';
        } catch (error) {
          return 'Failed to hide ligands.';
        }
      }
    });

    this.commands.set('zoom_chain', {
      name: 'zoom_chain',
      description: 'Zoom to specific chain',
      execute: async (viewer, params) => {
        try {
          const chainId = params?.chainId || 'A';
          await viewer.focusOnChain(chainId);
          return `Zoomed to chain ${chainId}.`;
        } catch (error) {
          return `Failed to zoom to chain ${params?.chainId || 'A'}.`;
        }
      }
    });

    this.commands.set('show_selection_info', {
      name: 'show_selection_info',
      description: 'Get information about current selection',
      execute: async (viewer) => {
        try {
          const info = await viewer.getSelectionInfo();
          return info || 'No selection information available.';
        } catch (error) {
          return 'Failed to get selection information.';
        }
      }
    });

    this.commands.set('show_only_selected', {
      name: 'show_only_selected',
      description: 'Show only the selected region',
      execute: async (viewer) => {
        try {
          await viewer.showOnlySelected();
          return '✅ Now showing only the selected region. The rest of the structure has been hidden.\n\nTo restore the full structure view, use the command "show full structure" or "restore view".';
        } catch (error) {
          return 'Failed to show only selected region. Please make a selection first.';
        }
      }
    });

    this.commands.set('show_full_structure', {
      name: 'show_full_structure',
      description: 'Show the full structure (restore from selection-only view)',
      execute: async (viewer) => {
        try {
          await viewer.hideOnlySelected();
          return '✅ Full structure view restored. All parts of the structure are now visible again.';
        } catch (error) {
          return 'Failed to restore full structure view.';
        }
      }
    });

    this.commands.set('restore_view', {
      name: 'restore_view',
      description: 'Restore full structure view',
      execute: async (viewer) => {
        try {
          await viewer.hideOnlySelected();
          return '✅ View restored to show the full structure.';
        } catch (error) {
          return 'Failed to restore view.';
        }
      }
    });

    this.commands.set('switch_to_surface', {
      name: 'switch_to_surface',
      description: 'Change to surface representation',
      execute: async (viewer) => {
        try {
          viewer.setRepresentation('surface');
          return '🌊 Switched to molecular surface representation. You can now see the protein\'s accessible surface area and binding pockets.';
        } catch (error) {
          return 'Failed to switch to surface representation.';
        }
      }
    });

    this.commands.set('switch_to_cartoon', {
      name: 'switch_to_cartoon',
      description: 'Change to cartoon representation',
      execute: async (viewer) => {
        try {
          viewer.setRepresentation('cartoon');
          return '🎭 Switched to cartoon representation. This shows the protein\'s secondary structure (α-helices, β-sheets) clearly.';
        } catch (error) {
          return 'Failed to switch to cartoon representation.';
        }
      }
    });

    this.commands.set('switch_to_ball_stick', {
      name: 'switch_to_ball_stick',
      description: 'Change to ball and stick representation',
      execute: async (viewer) => {
        try {
          viewer.setRepresentation('ball-and-stick');
          return '⚛️ Switched to ball-and-stick representation. You can now see individual atoms and bonds in detail.';
        } catch (error) {
          return 'Failed to switch to ball and stick representation.';
        }
      }
    });

    this.commands.set('switch_to_spacefill', {
      name: 'switch_to_spacefill',
      description: 'Change to spacefill representation',
      execute: async (viewer) => {
        try {
          viewer.setRepresentation('spacefill');
          return '🔵 Switched to space-fill representation. This shows the van der Waals radii of atoms.';
        } catch (error) {
          return 'Failed to switch to spacefill representation.';
        }
      }
    });

    this.commands.set('reset_view', {
      name: 'reset_view',
      description: 'Reset camera to default position',
      execute: async (viewer) => {
        try {
          viewer.resetView();
          return '🎯 Camera view has been reset to show the entire structure.';
        } catch (error) {
          return 'Failed to reset camera view.';
        }
      }
    });

    this.commands.set('highlight_chain', {
      name: 'highlight_chain',
      description: 'Highlight specific chain',
      execute: async (viewer, params) => {
        try {
          const chainId = params?.chainId || 'A';
          await viewer.highlightChain(chainId);
          return `Chain ${chainId} has been highlighted.`;
        } catch (error) {
          return `Failed to highlight chain ${params?.chainId || 'A'}.`;
        }
      }
    });

    this.commands.set('clear_highlights', {
      name: 'clear_highlights',
      description: 'Remove all highlights',
      execute: async (viewer) => {
        try {
          await viewer.clearHighlights();
          return 'All highlights have been cleared.';
        } catch (error) {
          return 'Failed to clear highlights.';
        }
      }
    });

    this.commands.set('show_structure_info', {
      name: 'show_structure_info',
      description: 'Display structure information',
      execute: async (viewer) => {
        try {
          const info = await viewer.getStructureInfo();
          return info || 'No structure information available.';
        } catch (error) {
          return 'Failed to get structure information.';
        }
      }
    });

    // Add residue range selection command
    this.commands.set('select_residue_range', {
      name: 'select_residue_range',
      description: 'Select residues within a specific range in a chain',
      execute: async (viewer, params) => {
        try {
          console.log('🎯 Executing select_residue_range with params:', params);
          
          // Check if MolScript is ready before proceeding
          if (!viewer.isMolScriptReady()) {
            return '⚠️ The 3D viewer is not fully ready for residue selection yet. Please wait a moment and try again, or try loading a different structure if the problem persists.';
          }
          
          // More flexible parameter validation
          if (!params) {
            return 'No parameters provided. Please specify chainId, startResidue, and endResidue.';
          }
          
          const chainId = params.chainId;
          const startResidue = params.startResidue;
          const endResidue = params.endResidue;
          
          if (!chainId) {
            return 'Missing chainId parameter. Please specify the chain (e.g., A, B, C).';
          }
          
          if (startResidue === undefined || startResidue === null || startResidue === '') {
            return 'Missing startResidue parameter. Please specify the starting residue number.';
          }
          
          if (endResidue === undefined || endResidue === null || endResidue === '') {
            return 'Missing endResidue parameter. Please specify the ending residue number.';
          }

          const query: ResidueRangeQuery = {
            chainId: chainId.toString().toUpperCase(),
            startResidue: parseInt(startResidue.toString()),
            endResidue: parseInt(endResidue.toString())
          };

          console.log('🎯 Parsed query:', query);

          if (isNaN(query.startResidue) || isNaN(query.endResidue)) {
            return 'Invalid residue numbers. Please provide valid numeric residue IDs.';
          }

          const result = await viewer.selectResidueRange(query);
          return result;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error('❌ select_residue_range error:', errorMessage);
          return `❌ Failed to select residue range:\n\n${errorMessage}`;
        }
      }
    });

    // Add single residue selection command
    this.commands.set('select_residue', {
      name: 'select_residue',
      description: 'Select a specific residue',
      execute: async (viewer, params) => {
        try {
          console.log('🎯 Executing select_residue with params:', params);
          
          // Check if MolScript is ready before proceeding
          if (!viewer.isMolScriptReady()) {
            return '⚠️ The 3D viewer is not fully ready for residue selection yet. Please wait a moment and try again, or try loading a different structure if the problem persists.';
          }
          
          if (!params) {
            return 'No parameters provided. Please specify residueId and optionally chainId.';
          }
          
          const residueId = params.residueId;
          const chainId = params.chainId;
          
          if (residueId === undefined || residueId === null || residueId === '') {
            return 'Missing residueId parameter. Please specify the residue number.';
          }

          const parsedResidueId = parseInt(residueId.toString());
          if (isNaN(parsedResidueId)) {
            return 'Invalid residue number. Please provide a valid numeric residue ID.';
          }

          const result = await viewer.selectResidue(parsedResidueId, chainId?.toString()?.toUpperCase());
          return result;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error('❌ select_residue error:', errorMessage);
          return `❌ Failed to select residue:\n\n${errorMessage}`;
        }
      }
    });

    this.commands.set('clear_selection', {
      name: 'clear_selection',
      description: 'Clear all current selections',
      execute: async (viewer) => {
        try {
          await viewer.clearSelection();
          return 'All selections have been cleared.';
        } catch (error) {
          return 'Failed to clear selection.';
        }
      }
    });

    // Add new selection-focused commands
    this.commands.set('what_is_selected', {
      name: 'what_is_selected',
      description: 'Get detailed information about current selection',
      execute: async (viewer) => {
        try {
          const selection = viewer.getCurrentSelection();
          if (!selection) {
            return 'Nothing is currently selected. Click on an atom or residue in the 3D viewer to select it.';
          }
          
          let response = `**Selection Analysis:**\n\n`;
          response += `${selection.description}\n\n`;
          
          if (selection.residueName) {
            response += `**Residue Information:**\n`;
            response += `- Name: ${selection.residueName}\n`;
            response += `- Number: ${selection.residueNumber}\n`;
            response += `- Chain: ${selection.chainId}\n`;
            
            // Add amino acid properties
            const aaInfo = this.getAminoAcidInfo(selection.residueName);
            if (aaInfo) {
              response += `- Type: ${aaInfo.type}\n`;
              response += `- Properties: ${aaInfo.properties.join(', ')}\n`;
              response += `- Description: ${aaInfo.description}\n`;
            }
          }
          
          if (selection.atomName && selection.elementType) {
            response += `\n**Atom Information:**\n`;
            response += `- Atom Name: ${selection.atomName}\n`;
            response += `- Element: ${selection.elementType}\n`;
          }
          
          if (selection.coordinates) {
            response += `\n**Position:**\n`;
            response += `- X: ${selection.coordinates.x.toFixed(3)} Å\n`;
            response += `- Y: ${selection.coordinates.y.toFixed(3)} Å\n`;
            response += `- Z: ${selection.coordinates.z.toFixed(3)} Å\n`;
          }
          
          return response;
        } catch (error) {
          return 'Failed to analyze selection.';
        }
      }
    });

    this.commands.set('analyze_selection', {
      name: 'analyze_selection',
      description: 'Provide detailed analysis of the selected residue/atom',
      execute: async (viewer) => {
        try {
          return await this.commands.get('what_is_selected')!.execute(viewer);
        } catch (error) {
          return 'Failed to analyze selection.';
        }
      }
    });
  }

  private getAminoAcidInfo(residueName: string): { type: string; properties: string[]; description: string } | null {
    const aminoAcids: { [key: string]: { type: string; properties: string[]; description: string } } = {
      'ALA': { type: 'Nonpolar', properties: ['Hydrophobic', 'Small'], description: 'Alanine - Small, nonpolar side chain' },
      'ARG': { type: 'Basic', properties: ['Positively charged', 'Polar', 'Large'], description: 'Arginine - Positively charged, often involved in binding' },
      'ASN': { type: 'Polar', properties: ['Uncharged polar', 'Hydrophilic'], description: 'Asparagine - Can form hydrogen bonds' },
      'ASP': { type: 'Acidic', properties: ['Negatively charged', 'Polar'], description: 'Aspartic acid - Negatively charged at physiological pH' },
      'CYS': { type: 'Polar', properties: ['Can form disulfide bonds', 'Sulfur-containing'], description: 'Cysteine - Can form disulfide bridges' },
      'GLN': { type: 'Polar', properties: ['Uncharged polar', 'Hydrophilic'], description: 'Glutamine - Longer polar side chain, forms hydrogen bonds' },
      'GLU': { type: 'Acidic', properties: ['Negatively charged', 'Polar'], description: 'Glutamic acid - Negatively charged, important for protein structure' },
      'GLY': { type: 'Nonpolar', properties: ['Flexible', 'Smallest'], description: 'Glycine - Provides flexibility, no side chain' },
      'HIS': { type: 'Basic', properties: ['Can be charged', 'Aromatic'], description: 'Histidine - Can be protonated, important in enzyme active sites' },
      'ILE': { type: 'Nonpolar', properties: ['Hydrophobic', 'Branched'], description: 'Isoleucine - Hydrophobic, branched aliphatic side chain' },
      'LEU': { type: 'Nonpolar', properties: ['Hydrophobic', 'Branched'], description: 'Leucine - Hydrophobic, common in protein cores' },
      'LYS': { type: 'Basic', properties: ['Positively charged', 'Long'], description: 'Lysine - Positively charged, often on protein surfaces' },
      'MET': { type: 'Nonpolar', properties: ['Hydrophobic', 'Sulfur-containing'], description: 'Methionine - Contains sulfur, often buried in protein core' },
      'PHE': { type: 'Nonpolar', properties: ['Aromatic', 'Hydrophobic', 'Large'], description: 'Phenylalanine - Aromatic, important for protein structure' },
      'PRO': { type: 'Nonpolar', properties: ['Rigid', 'Ring structure'], description: 'Proline - Rigid structure, introduces kinks in proteins' },
      'SER': { type: 'Polar', properties: ['Hydroxyl group', 'Can be phosphorylated'], description: 'Serine - Small polar residue, important for regulation' },
      'THR': { type: 'Polar', properties: ['Hydroxyl group', 'Can be phosphorylated'], description: 'Threonine - Polar with hydroxyl group' },
      'TRP': { type: 'Nonpolar', properties: ['Aromatic', 'Large', 'Indole ring'], description: 'Tryptophan - Largest amino acid, aromatic indole ring' },
      'TYR': { type: 'Polar', properties: ['Aromatic', 'Hydroxyl group'], description: 'Tyrosine - Aromatic with hydroxyl group, can form hydrogen bonds' },
      'VAL': { type: 'Nonpolar', properties: ['Hydrophobic', 'Branched'], description: 'Valine - Hydrophobic, branched aliphatic side chain' }
    };

    return aminoAcids[residueName] || null;
  }

  async executeCommand(commandName: string, params?: any): Promise<string> {
    if (!this.viewer) {
      return 'No molecular viewer available. Please load a structure first.';
    }

    const command = this.commands.get(commandName);
    if (!command) {
      return `Unknown command: ${commandName}. Available commands: ${Array.from(this.commands.keys()).join(', ')}`;
    }

    return await command.execute(this.viewer, params);
  }

  parseCommand(input: string): { command: string; params?: any } | null {
    console.log('🔍 Parsing command input:', `"${input}"`);
    
    // Clean and normalize input
    const cleanInput = input.trim().toLowerCase();
    
    // Handle water-related commands FIRST (highest priority for this fix)
    if (cleanInput.includes('show water') || 
        cleanInput.includes('water molecules') || 
        cleanInput.includes('display water') ||
        cleanInput.includes('enable water') ||
        cleanInput.includes('make water visible') ||
        cleanInput.includes('h2o') ||
        cleanInput.includes('hoh') ||
        cleanInput.includes('solvent molecules')) {
      console.log('✅ Matched: enable_water');
      return { command: 'enable_water' };
    }

    if (cleanInput.includes('hide water') || 
        cleanInput.includes('remove water') ||
        cleanInput.includes('turn off water') ||
        cleanInput.includes('no water')) {
      console.log('✅ Matched: hide_water');
      return { command: 'hide_water' };
    }
    
    // Handle selection-related queries SECOND (high priority)
    if (cleanInput.includes('what is selected') || cleanInput.includes('what\'s selected')) {
      console.log('✅ Matched: what_is_selected');
      return { command: 'what_is_selected' };
    }
    
    if (cleanInput.includes('analyze selection') || cleanInput.includes('analyze my selection')) {
      console.log('✅ Matched: analyze_selection');
      return { command: 'analyze_selection' };
    }

    if (cleanInput.includes('clear selection')) {
      console.log('✅ Matched: clear_selection');
      return { command: 'clear_selection' };
    }

    // Handle show/hide commands THIRD (high priority)
    if (cleanInput.includes('show only selected') || 
        cleanInput.includes('show selected only') ||
        cleanInput.includes('hide everything else') ||
        cleanInput.includes('show just selected')) {
      console.log('✅ Matched: show_only_selected');
      return { command: 'show_only_selected' };
    }

    if (cleanInput.includes('show full structure') || 
        cleanInput.includes('show entire structure') ||
        cleanInput.includes('restore view') ||
        cleanInput.includes('show all') ||
        cleanInput.includes('unhide')) {
      console.log('✅ Matched: show_full_structure');
      return { command: 'show_full_structure' };
    }

    // Handle representation changes FOURTH
    if (cleanInput.includes('surface view') || 
        cleanInput.includes('molecular surface') ||
        cleanInput.includes('switch to surface')) {
      console.log('✅ Matched: switch_to_surface');
      return { command: 'switch_to_surface' };
    }

    if (cleanInput.includes('cartoon view') || 
        cleanInput.includes('ribbon') ||
        cleanInput.includes('secondary structure') ||
        cleanInput.includes('switch to cartoon')) {
      console.log('✅ Matched: switch_to_cartoon');
      return { command: 'switch_to_cartoon' };
    }

    if (cleanInput.includes('ball and stick') || 
        cleanInput.includes('atomic detail') ||
        cleanInput.includes('bonds') ||
        cleanInput.includes('switch to ball')) {
      console.log('✅ Matched: switch_to_ball_stick');
      return { command: 'switch_to_ball_stick' };
    }

    if (cleanInput.includes('space fill') || 
        cleanInput.includes('van der waals') ||
        cleanInput.includes('spacefill')) {
      console.log('✅ Matched: switch_to_spacefill');
      return { command: 'switch_to_spacefill' };
    }

    // SINGLE RESIDUE SELECTION - Check this BEFORE range patterns to avoid conflicts
    // Pattern: "select residue X in chain Y" (must be very specific)
    const singleResidueRegex = /select\s+residue\s+(\d+)\s+in\s+chain\s+([a-z])/i;
    const singleMatch = cleanInput.match(singleResidueRegex);
    if (singleMatch) {
      console.log('✅ Matched single residue pattern:', singleMatch);
      console.log('  - Residue:', singleMatch[1]);
      console.log('  - Chain:', singleMatch[2].toUpperCase());
      return {
        command: 'select_residue',
        params: {
          residueId: singleMatch[1],
          chainId: singleMatch[2].toUpperCase()
        }
      };
    }

    // Alternative single residue pattern: "select residue X chain Y"
    const singleResidueRegex2 = /select\s+residue\s+(\d+)\s+chain\s+([a-z])/i;
    const singleMatch2 = cleanInput.match(singleResidueRegex2);
    if (singleMatch2) {
      console.log('✅ Matched single residue pattern 2:', singleMatch2);
      console.log('  - Residue:', singleMatch2[1]);
      console.log('  - Chain:', singleMatch2[2].toUpperCase());
      return {
        command: 'select_residue',
        params: {
          residueId: singleMatch2[1],
          chainId: singleMatch2[2].toUpperCase()
        }
      };
    }

    // Simple residue selection without chain: "select residue X"
    const simpleResidueRegex = /select\s+residue\s+(\d+)(?!\s*[-\sto])/i;
    const simpleMatch = cleanInput.match(simpleResidueRegex);
    if (simpleMatch) {
      console.log('✅ Matched simple residue pattern:', simpleMatch);
      console.log('  - Residue:', simpleMatch[1]);
      return {
        command: 'select_residue',
        params: {
          residueId: simpleMatch[1]
        }
      };
    }

    // RESIDUE RANGE SELECTION PATTERNS (check after single residue)
    
    // Pattern 1: "select residues X-Y in chain Z" or "select residues X to Y in chain Z"
    const residueRangeRegex1 = /select\s+residues\s+(\d+)[\s\-to]+(\d+)\s+in\s+chain\s+([a-z])/i;
    const match1 = cleanInput.match(residueRangeRegex1);
    if (match1) {
      console.log('✅ Matched range pattern 1:', match1);
      return {
        command: 'select_residue_range',
        params: {
          chainId: match1[3].toUpperCase(),
          startResidue: match1[1],
          endResidue: match1[2]
        }
      };
    }

    // Pattern 2: "select chain X residues Y to Z"
    const residueRangeRegex2 = /select\s+chain\s+([a-z])\s+residues\s+(\d+)[\s\-to]+(\d+)/i;
    const match2 = cleanInput.match(residueRangeRegex2);
    if (match2) {
      console.log('✅ Matched range pattern 2:', match2);
      return {
        command: 'select_residue_range',
        params: {
          chainId: match2[1].toUpperCase(),
          startResidue: match2[2],
          endResidue: match2[3]
        }
      };
    }

    // Pattern 3: "select residues X to Y chain Z"
    const residueRangeRegex3 = /select\s+residues\s+(\d+)\s+(?:to|through|\-)\s+(\d+)\s+chain\s+([a-z])/i;
    const match3 = cleanInput.match(residueRangeRegex3);
    if (match3) {
      console.log('✅ Matched range pattern 3:', match3);
      return {
        command: 'select_residue_range',
        params: {
          chainId: match3[3].toUpperCase(),
          startResidue: match3[1],
          endResidue: match3[2]
        }
      };
    }

    // Camera controls
    if (cleanInput.includes('reset view') || cleanInput.includes('reset camera')) {
      console.log('✅ Matched: reset_view');
      return { command: 'reset_view' };
    }

    // BASIC COMMAND PARSING (original functionality)
    const parts = cleanInput.split(' ');
    const command = parts[0];
    
    if (this.commands.has(command)) {
      const params: any = {};
      
      if (command === 'zoom_chain' || command === 'highlight_chain') {
        params.chainId = parts[1] ? parts[1].toUpperCase() : 'A';
      }
      
      console.log('✅ Matched basic command:', command, 'with params:', params);
      return { command, params };
    }
    
    console.log('❌ No command pattern matched for:', `"${input}"`);
    return null;
  }

  getAvailableCommands(): string[] {
    return Array.from(this.commands.keys());
  }
}

export const molstarCommandProcessor = new MolstarCommandProcessor();