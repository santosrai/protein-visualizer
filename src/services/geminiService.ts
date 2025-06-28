import { GoogleGenerativeAI } from '@google/generative-ai';

class GeminiService {
  private genAI: GoogleGenerativeAI | null = null;
  private model: any = null;

  constructor() {
    // Initialize with API key from environment variables
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
    }
  }

  async processCommand(message: string, context: any = {}) {
    if (!this.model) {
      throw new Error('Gemini API key not configured. Please add VITE_GEMINI_API_KEY to your environment variables.');
    }

    const systemPrompt = `You are an AI assistant for a protein visualization tool powered by Molstar. 
You can help users interact with 3D protein structures through specific commands. 

Available commands you can suggest or execute:
- "enable_water" - Show water molecules
- "hide_ligands" - Hide ligand molecules  
- "zoom_chain [chain_id]" - Zoom to specific chain (A, B, C, etc.)
- "show_selection_info" - Get information about current selection
- "show_only_selected" - Show only the selected region
- "switch_to_surface" - Change to surface representation
- "switch_to_cartoon" - Change to cartoon representation
- "switch_to_ball_stick" - Change to ball and stick representation
- "reset_view" - Reset camera to default position
- "highlight_chain [chain_id]" - Highlight specific chain
- "clear_highlights" - Remove all highlights
- "show_structure_info" - Display structure information

Current context:
- Structure: ${context.structureName || 'Unknown'}
- Representation: ${context.representation || 'cartoon'}
- Has structure loaded: ${context.hasStructure || false}

Respond naturally to user queries and suggest appropriate commands. If a user asks something that requires a specific action, include the command in your response using the format: [COMMAND: command_name].

User message: ${message}`;

    try {
      const result = await this.model.generateContent(systemPrompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error('Gemini API error:', error);
      throw new Error('Failed to process command with AI. Please try again.');
    }
  }

  extractCommands(text: string): string[] {
    const commandRegex = /\[COMMAND:\s*([^\]]+)\]/g;
    const commands = [];
    let match;
    
    while ((match = commandRegex.exec(text)) !== null) {
      commands.push(match[1].trim());
    }
    
    return commands;
  }

  cleanResponse(text: string): string {
    return text.replace(/\[COMMAND:\s*[^\]]+\]/g, '').trim();
  }
}

export const geminiService = new GeminiService();