import { ViewerControls } from '../components/MolstarViewer';

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
    // Parse commands like "zoom_chain A" or "highlight_chain B"
    const parts = input.trim().split(' ');
    const command = parts[0];
    
    if (this.commands.has(command)) {
      const params: any = {};
      
      if (command === 'zoom_chain' || command === 'highlight_chain') {
        params.chainId = parts[1] || 'A';
      }
      
      return { command, params };
    }
    
    return null;
  }

  getAvailableCommands(): string[] {
    return Array.from(this.commands.keys());
  }
}

export const molstarCommandProcessor = new MolstarCommandProcessor();