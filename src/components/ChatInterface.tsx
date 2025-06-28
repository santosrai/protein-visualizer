import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { 
  MessageCircle, 
  Send, 
  Bot, 
  User, 
  Loader2, 
  AlertCircle,
  Lightbulb,
  Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { geminiService } from '../services/geminiService';
import { molstarCommandProcessor } from '../services/molstarCommandProcessor';
import { ViewerControls } from './MolstarViewer';

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  commands?: string[];
}

interface ChatInterfaceProps {
  viewerRef: React.RefObject<ViewerControls>;
  currentStructure?: string;
  currentRepresentation?: string;
  isStructureLoaded?: boolean;
  className?: string;
}

const QUICK_COMMANDS = [
  "Show water molecules",
  "Switch to surface view", 
  "Reset camera",
  "Show structure info",
  "Hide ligands",
  "Highlight chain A"
];

const ChatInterface: React.FC<ChatInterfaceProps> = ({
  viewerRef,
  currentStructure,
  currentRepresentation,
  isStructureLoaded,
  className
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      type: 'system',
      content: 'Welcome! I can help you interact with the 3D protein structure. Try asking me to "show water molecules" or "switch to surface view".',
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [apiKeyError, setApiKeyError] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Set up command processor with viewer
  useEffect(() => {
    if (viewerRef.current) {
      molstarCommandProcessor.setViewer(viewerRef.current);
    }
  }, [viewerRef.current]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addMessage = (message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const newMessage: ChatMessage = {
      ...message,
      id: Date.now().toString(),
      timestamp: new Date()
    };
    setMessages(prev => [...prev, newMessage]);
  };

  const handleSendMessage = async () => {
    const message = inputValue.trim();
    if (!message) return;

    // Add user message
    addMessage({
      type: 'user',
      content: message
    });

    setInputValue('');
    setIsLoading(true);
    setApiKeyError(false);

    try {
      // Check if it's a direct command
      const directCommand = molstarCommandProcessor.parseCommand(message.toLowerCase());
      
      if (directCommand) {
        // Execute direct command
        const result = await molstarCommandProcessor.executeCommand(
          directCommand.command, 
          directCommand.params
        );
        
        addMessage({
          type: 'assistant',
          content: result,
          commands: [directCommand.command]
        });
      } else {
        // Process with AI
        const context = {
          structureName: currentStructure,
          representation: currentRepresentation,
          hasStructure: isStructureLoaded
        };

        const aiResponse = await geminiService.processCommand(message, context);
        const commands = geminiService.extractCommands(aiResponse);
        const cleanResponse = geminiService.cleanResponse(aiResponse);

        // Execute any commands found in the AI response
        const commandResults = [];
        for (const command of commands) {
          const parsedCommand = molstarCommandProcessor.parseCommand(command);
          if (parsedCommand) {
            const result = await molstarCommandProcessor.executeCommand(
              parsedCommand.command,
              parsedCommand.params
            );
            commandResults.push(result);
          }
        }

        // Combine AI response with command results
        let finalResponse = cleanResponse;
        if (commandResults.length > 0) {
          finalResponse += '\n\n' + commandResults.join('\n');
        }

        addMessage({
          type: 'assistant',
          content: finalResponse,
          commands: commands
        });
      }
    } catch (error) {
      console.error('Chat error:', error);
      if (error instanceof Error && error.message.includes('API key')) {
        setApiKeyError(true);
        addMessage({
          type: 'system',
          content: 'AI features require a Gemini API key. You can still use direct commands like "reset_view" or "switch_to_surface".'
        });
      } else {
        addMessage({
          type: 'system',
          content: 'Sorry, I encountered an error. Please try again or use direct commands.'
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickCommand = (command: string) => {
    setInputValue(command);
    inputRef.current?.focus();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Card className={cn("h-full flex flex-col bg-gray-800/50 border-gray-700", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-white flex items-center">
          <MessageCircle className="h-5 w-5 mr-2 text-blue-400" />
          AI Assistant
        </CardTitle>
        {currentStructure && (
          <div className="flex items-center space-x-2">
            <Badge variant="outline" className="text-xs bg-gray-700/50 text-gray-300 border-gray-600">
              {currentStructure}
            </Badge>
            <Badge variant="outline" className="text-xs bg-gray-700/50 text-gray-300 border-gray-600">
              {currentRepresentation}
            </Badge>
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-4 space-y-4">
        {/* API Key Warning */}
        {apiKeyError && (
          <Alert className="bg-yellow-500/10 border-yellow-500/30">
            <AlertCircle className="h-4 w-4 text-yellow-400" />
            <AlertDescription className="text-yellow-300 text-sm">
              Add <code>VITE_GEMINI_API_KEY</code> to your environment variables to enable AI features.
            </AlertDescription>
          </Alert>
        )}

        {/* Quick Commands */}
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Zap className="h-4 w-4 text-green-400" />
            <span className="text-sm font-medium text-white">Quick Commands</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {QUICK_COMMANDS.map((command, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                onClick={() => handleQuickCommand(command)}
                className="text-xs bg-gray-700/50 border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white"
                disabled={!isStructureLoaded}
              >
                {command}
              </Button>
            ))}
          </div>
        </div>

        <Separator className="bg-gray-600" />

        {/* Messages */}
        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex space-x-3",
                  message.type === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                {message.type !== 'user' && (
                  <div className="flex-shrink-0">
                    {message.type === 'assistant' ? (
                      <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                        <Bot className="h-4 w-4 text-white" />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center">
                        <Lightbulb className="h-4 w-4 text-white" />
                      </div>
                    )}
                  </div>
                )}

                <div className={cn(
                  "max-w-[80%] rounded-lg p-3",
                  message.type === 'user' 
                    ? "bg-blue-600 text-white" 
                    : message.type === 'assistant'
                    ? "bg-gray-700/50 text-gray-100"
                    : "bg-gray-600/50 text-gray-200"
                )}>
                  <div className="text-sm whitespace-pre-wrap">
                    {message.content}
                  </div>
                  
                  {message.commands && message.commands.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {message.commands.map((cmd, index) => (
                        <Badge 
                          key={index}
                          variant="secondary" 
                          className="text-xs bg-blue-500/20 text-blue-300 border-blue-500/30"
                        >
                          {cmd}
                        </Badge>
                      ))}
                    </div>
                  )}
                  
                  <div className="text-xs opacity-70 mt-1">
                    {formatTime(message.timestamp)}
                  </div>
                </div>

                {message.type === 'user' && (
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center">
                      <User className="h-4 w-4 text-white" />
                    </div>
                  </div>
                )}
              </div>
            ))}
            
            {isLoading && (
              <div className="flex space-x-3 justify-start">
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-white" />
                </div>
                <div className="bg-gray-700/50 rounded-lg p-3">
                  <div className="flex items-center space-x-2">
                    <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                    <span className="text-sm text-gray-400">Thinking...</span>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="flex space-x-2">
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={isStructureLoaded ? "Ask me about the protein structure..." : "Load a structure first..."}
            className="flex-1 bg-gray-900/50 border-gray-600 text-white placeholder-gray-400"
            disabled={isLoading || !isStructureLoaded}
          />
          <Button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isLoading || !isStructureLoaded}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>

        {!isStructureLoaded && (
          <div className="text-center text-sm text-gray-400">
            Load a protein structure to start chatting with the AI assistant
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ChatInterface;