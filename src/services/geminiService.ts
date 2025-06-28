import { GoogleGenerativeAI } from '@google/generative-ai';

class GeminiService {
  private genAI: GoogleGenerativeAI | null = null;
  private model: any = null;
  private apiKey: string = '';

  constructor() {
    // Check localStorage first, then environment variables
    this.apiKey = localStorage.getItem('gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY || '';
    if (this.apiKey) {
      this.initializeAI(this.apiKey);
    }
  }

  private initializeAI(apiKey: string) {
    try {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
      this.apiKey = apiKey;
    } catch (error) {
      console.error('Failed to initialize Gemini AI:', error);
      this.genAI = null;
      this.model = null;
    }
  }

  updateApiKey(apiKey: string) {
    if (apiKey) {
      this.initializeAI(apiKey);
    } else {
      this.genAI = null;
      this.model = null;
      this.apiKey = '';
    }
  }

  async testApiKey(apiKey: string): Promise<boolean> {
    try {
      const testAI = new GoogleGenerativeAI(apiKey);
      const testModel = testAI.getGenerativeModel({ model: 'gemini-pro' });
      
      const result = await testModel.generateContent('Test connection');
      const response = await result.response;
      return !!response.text();
    } catch (error) {
      console.error('API key test failed:', error);
      throw new Error('Invalid API key or network error');
    }
  }

  isConfigured(): boolean {
    return !!this.model && !!this.apiKey;
  }

  async processCommand(message: string, context: any = {}) {
    if (!this.model) {
      throw new Error('Gemini API key not configured. Please add your API key in Settings.');
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
      if (error instanceof Error && error.message.includes('API_KEY_INVALID')) {
        throw new Error('Invalid API key. Please check your Gemini API key in Settings.');
      }
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