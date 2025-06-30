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
    this.commands.set('enable_water', {
      name: 'enable_water',
      description: 'Show water molecules',
      execute: async (viewer) => {
        try {
          await viewer.showWaterMolecules();
          return 'Water molecules are now visible.';
        } catch (error) {
          return 'Failed to show water molecules. They may not be present in this structure or are already visible.';
        }
      }
    });

    this.commands.set('hide_water', {
      name: 'hide_water',
      description: 'Hide water molecules',
      execute: async (viewer) => {
        try {
          await viewer.hideWaterMolecules();
          return 'Water molecules have been hidden.';
        } catch (error) {
          return 'Failed to hide water molecules. They may not be currently visible.';
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
          return 'Now showing only the selected region.';
        } catch (error) {
          return 'Failed to show only selected region. Please make a selection first.';
        }
      }
    });

    this.commands.set('switch_to_surface', {
      name: 'switch_to_surface',
      description: 'Change to surface representation',
      execute: async (viewer) => {
        try {
          viewer.setRepresentation('surface');
          return 'Switched to surface representation.';
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
          return 'Switched to cartoon representation.';
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
          return 'Switched to ball and stick representation.';
        } catch (error) {
          return 'Failed to switch to ball and stick representation.';
        }
      }
    });

    this.commands.set('reset_view', {
      name: 'reset_view',
      description: 'Reset camera to default position',
      execute: async (viewer) => {
        try {
          viewer.resetView();
          return 'Camera view has been reset.';
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

    // Add residue range selection command
    this.commands.set('select_residue_range', {
      name: 'select_residue_range',
      description: 'Select residues within a specific range in a chain',
      execute: async (viewer, params) => {
        try {
          console.log('🎯 Executing select_residue_range with params:', params);
          
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
    console.log('🔍 Parsing command:', input);
    
    // Parse commands like "zoom_chain A" or "highlight_chain B"
    const parts = input.trim().split(' ');
    const command = parts[0];
    
    // Handle selection-related queries
    if (input.toLowerCase().includes('what is selected') || input.toLowerCase().includes('what\'s selected')) {
      return { command: 'what_is_selected' };
    }
    
    if (input.toLowerCase().includes('analyze selection') || input.toLowerCase().includes('analyze my selection')) {
      return { command: 'analyze_selection' };
    }

    if (input.toLowerCase().includes('clear selection')) {
      return { command: 'clear_selection' };
    }

    // Parse residue range selection commands with multiple patterns
    // Pattern 1: "select residues 12-200 in chain A" or "select residues 1-1 in chain A"
    const residueRangeRegex1 = /select.*?(?:residues?)\s*(\d+)[\s\-]+(\d+).*?(?:chain|in)\s*([A-Za-z])/i;
    const match1 = input.match(residueRangeRegex1);
    if (match1) {
      console.log('✅ Matched pattern 1:', match1);
      return {
        command: 'select_residue_range',
        params: {
          chainId: match1[3].toUpperCase(),
          startResidue: match1[1],
          endResidue: match1[2]
        }
      };
    }

    // Pattern 2: "select chain A residues 50 to 150"
    const residueRangeRegex2 = /select.*?chain\s*([A-Za-z]).*?(?:residues?)\s*(\d+)[\s\-to]+(\d+)/i;
    const match2 = input.match(residueRangeRegex2);
    if (match2) {
      console.log('✅ Matched pattern 2:', match2);
      return {
        command: 'select_residue_range',
        params: {
          chainId: match2[1].toUpperCase(),
          startResidue: match2[2],
          endResidue: match2[3]
        }
      };
    }

    // Pattern 3: "select residues 1 to 1 chain A" or similar variations
    const residueRangeRegex3 = /select.*?(?:residues?)\s*(\d+)\s*(?:to|through|\-)\s*(\d+).*?chain\s*([A-Za-z])/i;
    const match3 = input.match(residueRangeRegex3);
    if (match3) {
      console.log('✅ Matched pattern 3:', match3);
      return {
        command: 'select_residue_range',
        params: {
          chainId: match3[3].toUpperCase(),
          startResidue: match3[1],
          endResidue: match3[2]
        }
      };
    }

    // Pattern 4: Handle single residue selections "select residue 1 in chain A"
    const singleResidueRegex = /select.*?(?:residue)\s*(\d+).*?(?:chain|in)\s*([A-Za-z])/i;
    const singleMatch = input.match(singleResidueRegex);
    if (singleMatch) {
      console.log('✅ Matched single residue pattern:', singleMatch);
      return {
        command: 'select_residue',
        params: {
          residueId: singleMatch[1],
          chainId: singleMatch[2].toUpperCase()
        }
      };
    }

    // Pattern 5: Simple residue selection without chain "select residue 1"
    const simpleResidueRegex = /select.*?(?:residue)\s*(\d+)/i;
    const simpleMatch = input.match(simpleResidueRegex);
    if (simpleMatch) {
      console.log('✅ Matched simple residue pattern:', simpleMatch);
      return {
        command: 'select_residue',
        params: {
          residueId: simpleMatch[1]
        }
      };
    }
    
    if (this.commands.has(command)) {
      const params: any = {};
      
      if (command === 'zoom_chain' || command === 'highlight_chain') {
        params.chainId = parts[1] ? parts[1].toUpperCase() : 'A';
      }
      
      return { command, params };
    }
    
    console.log('❌ No command pattern matched for:', input);
    return null;
  }

  getAvailableCommands(): string[] {
    return Array.from(this.commands.keys());
  }
}

export const molstarCommandProcessor = new MolstarCommandProcessor();