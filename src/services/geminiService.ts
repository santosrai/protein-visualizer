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

    const selectionContext = context.currentSelection ? `
Current Selection Information:
- Description: ${context.currentSelection.description}
- Residue: ${context.currentSelection.residueName} ${context.currentSelection.residueNumber}
- Chain: ${context.currentSelection.chainId}
- Atom: ${context.currentSelection.atomName} (${context.currentSelection.elementType})
- Total atoms in selection: ${context.currentSelection.atomCount}
` : 'No current selection.';

    const systemPrompt = `You are an AI assistant for a protein visualization tool powered by Molstar. 
You help users interact with 3D protein structures and understand their visualization needs.

CRITICAL: When users express intent to perform molecular visualization actions, you should:
1. Parse their intent carefully
2. Match it to available Molstar commands
3. Suggest the most appropriate command with exact parameters
4. Ask for confirmation using the [SUGGESTION] format

Available commands you can suggest or execute:

**SELECTION COMMANDS:**
- "select_residue" - Select a single residue by number and chain
- "select_residue_range" - Select a range of residues in a chain
- "what_is_selected" - Get information about current selection
- "analyze_selection" - Detailed analysis of current selection
- "clear_selection" - Clear all selections

**VISUALIZATION COMMANDS:**
- "enable_water" / "show_water" - Show water molecules (HOH residues)
- "hide_water" - Hide water molecules
- "switch_to_surface" - Change to molecular surface representation
- "switch_to_cartoon" - Change to cartoon representation (default)
- "switch_to_ball_stick" - Change to ball-and-stick representation
- "switch_to_spacefill" - Change to space-fill representation
- "show_only_selected" - Show only selected region
- "show_full_structure" - Show the full structure (restore view)
- "reset_view" - Reset camera to default position

**ANALYSIS COMMANDS:**
- "show_structure_info" - Display structure information
- "highlight_chain [chainId]" - Highlight specific chain
- "clear_highlights" - Remove all highlights
- "zoom_chain [chainId]" - Focus camera on specific chain

WATER MOLECULES UNDERSTANDING:
When users mention any of these terms, suggest "enable_water" command:
- "show water", "water molecules", "display water", "make water visible"
- "H2O", "HOH", "solvent molecules", "hydration shell"
- "water around", "bound water", "structural water"

When users want to hide water, suggest "hide_water" command:
- "hide water", "remove water", "turn off water", "no water"

SELECTION INTENT RECOGNITION:
When users say things like:
- "select residue 45" → suggest select_residue with residueId=45
- "select residue 45 in chain A" → suggest select_residue with residueId=45, chainId=A
- "select residues 10 to 50 in chain B" → suggest select_residue_range with startResidue=10, endResidue=50, chainId=B
- "show me residues 100-200 from chain A" → suggest select_residue_range
- "select the loop from 25 to 35" → suggest select_residue_range (ask which chain if not specified)

REPRESENTATION UNDERSTANDING:
When users mention visualization styles, suggest appropriate commands:
- "surface view", "molecular surface" → switch_to_surface
- "cartoon view", "ribbon", "secondary structure" → switch_to_cartoon
- "ball and stick", "atomic detail", "bonds" → switch_to_ball_stick
- "space fill", "van der Waals" → switch_to_spacefill

SUGGESTION FORMAT:
When you detect intent that matches available commands, respond with:
[SUGGESTION: command_name] with parameters: {param1: value1, param2: value2}

For example:
"I understand you want to show water molecules. 
[SUGGESTION: enable_water] with parameters: {}
Is this what you want to do?"

For selections:
"I understand you want to select residue 45 in chain A.
[SUGGESTION: select_residue] with parameters: {residueId: 45, chainId: "A"}
Is this what you want to do?"

IMPORTANT RULES:
1. Always match user intent to the most appropriate available command
2. Ask for confirmation when suggesting commands
3. If intent is unclear, ask clarifying questions
4. Be specific about what will happen when the command executes
5. If no matching command exists, explain what's available

Current context:
- Structure: ${context.structureName || 'Unknown'}
- Representation: ${context.representation || 'cartoon'}
- Has structure loaded: ${context.hasStructure || false}

${selectionContext}

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

  extractSuggestions(text: string): Array<{command: string, parameters: any, description: string}> {
    const suggestions = [];
    
    // Extract suggestions with parameters
    const suggestionRegex = /\[SUGGESTION:\s*([^\]]+)\]\s*with parameters:\s*\{([^}]*)\}/g;
    let match;
    
    while ((match = suggestionRegex.exec(text)) !== null) {
      try {
        const command = match[1].trim();
        const paramStr = match[2].trim();
        
        // Parse parameters (simple JSON-like parsing)
        const parameters: any = {};
        
        if (paramStr) {
          const paramPairs = paramStr.split(',');
          
          for (const pair of paramPairs) {
            const [key, value] = pair.split(':').map(s => s.trim());
            if (key && value) {
              const cleanKey = key.replace(/['"]/g, '');
              let cleanValue = value.replace(/['"]/g, '');
              
              // Try to parse as number if possible
              if (!isNaN(Number(cleanValue))) {
                cleanValue = Number(cleanValue);
              }
              
              parameters[cleanKey] = cleanValue;
            }
          }
        }
        
        // Extract description (everything before the suggestion)
        const suggestionIndex = text.indexOf(match[0]);
        const beforeSuggestion = text.substring(0, suggestionIndex).trim();
        const description = beforeSuggestion.split('\n').slice(-2).join(' ').trim();
        
        suggestions.push({
          command,
          parameters,
          description: description || `Execute ${command} command`
        });
      } catch (error) {
        console.warn('Failed to parse suggestion parameters:', error);
      }
    }
    
    return suggestions;
  }

  cleanResponse(text: string): string {
    return text
      .replace(/\[COMMAND:\s*[^\]]+\]/g, '')
      .replace(/\[SUGGESTION:\s*[^\]]+\]\s*with parameters:\s*\{[^}]*\}/g, '')
      .trim();
  }
}

export const geminiService = new GeminiService();