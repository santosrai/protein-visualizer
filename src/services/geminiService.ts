import { GoogleGenerativeAI } from '@google/generative-ai';

class GeminiService {
  private genAI: GoogleGenerativeAI | null = null;
  private model: any = null;
  private apiKey: string = '';
  private listeners: Array<(hasKey: boolean) => void> = [];

  constructor() {
    this.refreshApiKey();
  }

  // Add listener for API key changes
  addListener(listener: (hasKey: boolean) => void) {
    this.listeners.push(listener);
  }

  removeListener(listener: (hasKey: boolean) => void) {
    this.listeners = this.listeners.filter(l => l !== listener);
  }

  private notifyListeners() {
    const hasKey = this.isConfigured();
    this.listeners.forEach(listener => listener(hasKey));
  }

  private refreshApiKey() {
    // Check localStorage first, then environment variables
    const savedKey = localStorage.getItem('gemini_api_key');
    const envKey = import.meta.env.VITE_GEMINI_API_KEY;
    const newApiKey = savedKey || envKey || '';
    
    if (newApiKey && newApiKey !== this.apiKey) {
      this.initializeAI(newApiKey);
    } else if (!newApiKey) {
      this.genAI = null;
      this.model = null;
      this.apiKey = '';
    }
  }

  private initializeAI(apiKey: string) {
    try {
      // Validate API key format (Gemini keys typically start with 'AIza')
      if (!apiKey.startsWith('AIza') || apiKey.length < 35) {
        throw new Error('Invalid API key format');
      }

      this.genAI = new GoogleGenerativeAI(apiKey.trim());
      this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      this.apiKey = apiKey.trim();
      console.log('Gemini AI initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Gemini AI:', error);
      this.genAI = null;
      this.model = null;
      this.apiKey = '';
      throw error;
    }
  }

  updateApiKey(apiKey: string) {
    try {
      if (apiKey && apiKey.trim()) {
        this.initializeAI(apiKey.trim());
        localStorage.setItem('gemini_api_key', apiKey.trim());
      } else {
        this.genAI = null;
        this.model = null;
        this.apiKey = '';
        localStorage.removeItem('gemini_api_key');
      }
      this.notifyListeners();
    } catch (error) {
      this.notifyListeners();
      throw error;
    }
  }

  async testApiKey(apiKey: string): Promise<boolean> {
    try {
      // Validate format first
      if (!apiKey.startsWith('AIza') || apiKey.length < 35) {
        throw new Error('Invalid API key format. Gemini API keys should start with "AIza"');
      }

      const testAI = new GoogleGenerativeAI(apiKey.trim());
      const testModel = testAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      
      const result = await testModel.generateContent('Hello, can you respond with just "OK"?');
      const response = await result.response;
      const text = response.text();
      
      return text && text.length > 0;
    } catch (error) {
      console.error('API key test failed:', error);
      if (error instanceof Error) {
        if (error.message.includes('API_KEY_INVALID') || error.message.includes('Invalid API key')) {
          throw new Error('Invalid API key. Please check your Gemini API key.');
        } else if (error.message.includes('format')) {
          throw error;
        }
      }
      throw new Error('Failed to connect to Gemini API. Please check your internet connection and API key.');
    }
  }

  isConfigured(): boolean {
    return !!this.model && !!this.apiKey && this.apiKey.length > 0;
  }

  getApiKeyStatus(): { hasKey: boolean; isValid: boolean; source: string } {
    const savedKey = localStorage.getItem('gemini_api_key');
    const envKey = import.meta.env.VITE_GEMINI_API_KEY;
    
    return {
      hasKey: !!(savedKey || envKey),
      isValid: this.isConfigured(),
      source: savedKey ? 'localStorage' : envKey ? 'environment' : 'none'
    };
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
      if (error instanceof Error) {
        if (error.message.includes('API_KEY_INVALID') || error.message.includes('401')) {
          throw new Error('Invalid API key. Please check your Gemini API key in Settings.');
        } else if (error.message.includes('QUOTA_EXCEEDED')) {
          throw new Error('API quota exceeded. Please check your Gemini API usage limits.');
        } else if (error.message.includes('RATE_LIMIT_EXCEEDED')) {
          throw new Error('Rate limit exceeded. Please wait a moment and try again.');
        }
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