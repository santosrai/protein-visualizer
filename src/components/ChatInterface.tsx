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
  Zap,
  Settings,
  Wifi,
  WifiOff,
  Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { geminiService } from '../services/geminiService';
import { molstarCommandProcessor } from '../services/molstarCommandProcessor';
import { ViewerControls, SelectionInfo } from './MolstarViewer';
import SettingsDialog from './SettingsDialog';

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system' | 'loading';
  content: string;
  timestamp: Date;
  commands?: string[];
  isWaitingForReady?: boolean;
  retryCommand?: { command: string; params?: any };
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
  "Hide water molecules",
  "Switch to surface view", 
  "Reset camera",
  "Show structure info",
  "What is selected?",
  "Analyze selection"
];

// Selection commands that need MolScript to be ready
const SELECTION_COMMANDS = [
  'select_residue',
  'select_residue_range',
  'what_is_selected',
  'analyze_selection'
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
      content: 'Welcome! I can help you interact with the 3D protein structure. Try selecting a residue in the viewer and ask me "What is selected?" or "Analyze my selection".',
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [apiKeyStatus, setApiKeyStatus] = useState({ hasKey: false, isValid: false, source: 'none' });
  const [currentSelection, setCurrentSelection] = useState<SelectionInfo | null>(null);
  const [readinessCheckInterval, setReadinessCheckInterval] = useState<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Check API key status
  const updateApiKeyStatus = () => {
    const status = geminiService.getApiKeyStatus();
    setApiKeyStatus(status);
    setHasApiKey(status.isValid);
  };

  // Set up API key listener
  useEffect(() => {
    updateApiKeyStatus();

    const listener = (hasKey: boolean) => {
      setHasApiKey(hasKey);
      updateApiKeyStatus();
    };

    geminiService.addListener(listener);

    return () => {
      geminiService.removeListener(listener);
    };
  }, []);

  // Set up command processor with viewer
  useEffect(() => {
    if (viewerRef.current) {
      molstarCommandProcessor.setViewer(viewerRef.current);
    }
  }, [viewerRef.current]);

  // Monitor selection changes
  useEffect(() => {
    const checkSelection = () => {
      if (viewerRef.current) {
        const selection = viewerRef.current.getCurrentSelection();
        setCurrentSelection(selection);
      }
    };

    // Check selection periodically
    const interval = setInterval(checkSelection, 1000);
    return () => clearInterval(interval);
  }, [viewerRef]);

  // Clean up readiness check interval on unmount
  useEffect(() => {
    return () => {
      if (readinessCheckInterval) {
        clearInterval(readinessCheckInterval);
      }
    };
  }, [readinessCheckInterval]);

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
    return newMessage.id;
  };

  const updateMessage = (messageId: string, updates: Partial<ChatMessage>) => {
    setMessages(prev => 
      prev.map(msg => 
        msg.id === messageId ? { ...msg, ...updates } : msg
      )
    );
  };

  const removeMessage = (messageId: string) => {
    setMessages(prev => prev.filter(msg => msg.id !== messageId));
  };

  // Check if MolScript is ready and retry pending commands
  const checkMolScriptReadiness = (messageId: string, command: string, params?: any) => {
    if (!viewerRef.current) {
      updateMessage(messageId, {
        type: 'system',
        content: 'Viewer not available. Please refresh the page.',
        isWaitingForReady: false
      });
      return;
    }

    const interval = setInterval(async () => {
      if (viewerRef.current?.isMolScriptReady()) {
        clearInterval(interval);
        
        try {
          // Execute the command now that MolScript is ready
          const result = await molstarCommandProcessor.executeCommand(command, params);
          
          // Check if selection was successful and get selection info
          if ((command === 'select_residue' || command === 'select_residue_range') && 
              !result.includes('❌') && !result.includes('not found')) {
            
            // Get current selection info after successful selection
            const selection = viewerRef.current?.getCurrentSelection();
            let finalResult = result;
            
            if (selection) {
              finalResult += `\n\n**Selection Details:**\n${selection.description}`;
              
              if (selection.residueName) {
                finalResult += `\n- Residue: ${selection.residueName} ${selection.residueNumber}`;
                finalResult += `\n- Chain: ${selection.chainId}`;
              }
              
              if (selection.coordinates) {
                finalResult += `\n- Position: (${selection.coordinates.x.toFixed(2)}, ${selection.coordinates.y.toFixed(2)}, ${selection.coordinates.z.toFixed(2)}) Å`;
              }
            }
            
            updateMessage(messageId, {
              type: 'assistant',
              content: finalResult,
              isWaitingForReady: false,
              commands: [command]
            });
          } else {
            // Command failed or is not a selection command
            updateMessage(messageId, {
              type: result.includes('❌') ? 'system' : 'assistant',
              content: result,
              isWaitingForReady: false,
              commands: result.includes('❌') ? undefined : [command]
            });
          }
        } catch (error) {
          updateMessage(messageId, {
            type: 'system',
            content: `Failed to execute command: ${error instanceof Error ? error.message : 'Unknown error'}`,
            isWaitingForReady: false
          });
        }
      }
    }, 500); // Check every 500ms

    // Set timeout to avoid infinite waiting
    setTimeout(() => {
      clearInterval(interval);
      const currentMsg = messages.find(m => m.id === messageId);
      if (currentMsg?.isWaitingForReady) {
        updateMessage(messageId, {
          type: 'system',
          content: 'Timeout waiting for 3D viewer to become ready. Please try again or reload the structure.',
          isWaitingForReady: false
        });
      }
    }, 15000); // 15 second timeout
  };

  const handleApiKeyUpdate = (hasKey: boolean) => {
    setHasApiKey(hasKey);
    updateApiKeyStatus();
    
    if (hasKey) {
      addMessage({
        type: 'system',
        content: 'Great! AI assistant is now ready. You can ask me questions about the protein structure or request specific visualizations.'
      });
    }
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

    try {
      // Check if it's a direct command first
      const directCommand = molstarCommandProcessor.parseCommand(message.toLowerCase());
      
      if (directCommand) {
        // Check if this is a selection command that requires MolScript to be ready
        if (SELECTION_COMMANDS.includes(directCommand.command)) {
          if (!viewerRef.current) {
            addMessage({
              type: 'system',
              content: 'Viewer not available. Please refresh the page.'
            });
            setIsLoading(false);
            return;
          }

          // Check if MolScript is ready
          if (!viewerRef.current.isMolScriptReady()) {
            // Add loading message
            const loadingMessageId = addMessage({
              type: 'loading',
              content: 'Preparing 3D viewer for residue selection...',
              isWaitingForReady: true,
              retryCommand: directCommand
            });
            
            // Start checking for readiness
            checkMolScriptReadiness(loadingMessageId, directCommand.command, directCommand.params);
            setIsLoading(false);
            return;
          }
        }

        // Execute direct command immediately if MolScript is ready or not needed
        const result = await molstarCommandProcessor.executeCommand(
          directCommand.command, 
          directCommand.params
        );
        
        // For successful selection commands, add selection details
        if ((directCommand.command === 'select_residue' || directCommand.command === 'select_residue_range') && 
            !result.includes('❌') && !result.includes('not found')) {
          
          setTimeout(() => {
            const selection = viewerRef.current?.getCurrentSelection();
            if (selection) {
              let finalResult = result;
              finalResult += `\n\n**Selection Details:**\n${selection.description}`;
              
              if (selection.residueName) {
                finalResult += `\n- Residue: ${selection.residueName} ${selection.residueNumber}`;
                finalResult += `\n- Chain: ${selection.chainId}`;
              }
              
              if (selection.coordinates) {
                finalResult += `\n- Position: (${selection.coordinates.x.toFixed(2)}, ${selection.coordinates.y.toFixed(2)}, ${selection.coordinates.z.toFixed(2)}) Å`;
              }
              
              // Update the last message with detailed info
              setMessages(prev => {
                const updated = [...prev];
                const lastMsg = updated[updated.length - 1];
                if (lastMsg && lastMsg.commands?.includes(directCommand.command)) {
                  lastMsg.content = finalResult;
                }
                return updated;
              });
            }
          }, 200); // Small delay to ensure selection is processed
        }
        
        addMessage({
          type: result.includes('❌') ? 'system' : 'assistant',
          content: result,
          commands: result.includes('❌') ? undefined : [directCommand.command]
        });
      } else if (hasApiKey && apiKeyStatus.isValid) {
        // Process with AI including selection context
        const context = {
          structureName: currentStructure,
          representation: currentRepresentation,
          hasStructure: isStructureLoaded,
          currentSelection: currentSelection ? {
            description: currentSelection.description,
            residueName: currentSelection.residueName,
            residueNumber: currentSelection.residueNumber,
            chainId: currentSelection.chainId,
            atomName: currentSelection.atomName,
            elementType: currentSelection.elementType,
            atomCount: currentSelection.atomCount
          } : null
        };

        try {
          const aiResponse = await geminiService.processCommand(message, context);
          const commands = geminiService.extractCommands(aiResponse);
          const cleanResponse = geminiService.cleanResponse(aiResponse);

          // Execute any commands found in the AI response
          const commandResults = [];
          for (const command of commands) {
            const parsedCommand = molstarCommandProcessor.parseCommand(command);
            if (parsedCommand) {
              // Check if this requires MolScript readiness
              if (SELECTION_COMMANDS.includes(parsedCommand.command)) {
                if (!viewerRef.current?.isMolScriptReady()) {
                  commandResults.push('⏳ Waiting for 3D viewer to be ready for selection...');
                  continue;
                }
              }
              
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
        } catch (error) {
          console.error('AI processing error:', error);
          addMessage({
            type: 'system',
            content: error instanceof Error ? error.message : 'Failed to process AI request. You can still use direct commands like "reset_view", "hide_water", or "switch_to_surface".'
          });
        }
      } else {
        // No valid API key, suggest configuration or direct commands
        addMessage({
          type: 'system',
          content: apiKeyStatus.hasKey 
            ? 'AI features require a valid Gemini API key. Please check your API key in Settings, or use direct commands like "reset_view", "hide_water", or "switch_to_surface".'
            : 'AI features require a Gemini API key. Please configure it in Settings, or use direct commands like "reset_view", "hide_water", or "switch_to_surface".'
        });
      }
    } catch (error) {
      console.error('Chat error:', error);
      addMessage({
        type: 'system',
        content: 'Sorry, I encountered an error. Please try again or use direct commands like "reset_view", "hide_water", or "switch_to_surface".'
      });
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
    <Card className={cn("h-[600px] flex flex-col bg-gray-800/50 border-gray-700", className)}>
      {/* Fixed Header */}
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center">
            <MessageCircle className="h-5 w-5 mr-2 text-blue-400" />
            AI Assistant
          </CardTitle>
          <SettingsDialog 
            onApiKeyUpdate={handleApiKeyUpdate}
            trigger={
              <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white hover:bg-gray-700">
                <Settings className="h-4 w-4" />
              </Button>
            }
          />
        </div>
        
        <div className="flex items-center space-x-2 flex-wrap gap-1">
          {currentStructure && (
            <Badge variant="outline" className="text-xs bg-gray-700/50 text-gray-300 border-gray-600">
              {currentStructure}
            </Badge>
          )}
          {currentRepresentation && (
            <Badge variant="outline" className="text-xs bg-gray-700/50 text-gray-300 border-gray-600">
              {currentRepresentation}
            </Badge>
          )}
          
          {/* Selection Badge */}
          {currentSelection && (
            <Badge variant="outline" className="text-xs bg-green-500/20 text-green-300 border-green-500/30">
              {currentSelection.residueName} {currentSelection.residueNumber} (Chain {currentSelection.chainId})
            </Badge>
          )}
          
          {/* API Status Badge */}
          <Badge 
            variant="outline" 
            className={cn(
              "text-xs",
              hasApiKey && apiKeyStatus.isValid
                ? "bg-green-500/20 text-green-300 border-green-500/30"
                : apiKeyStatus.hasKey
                ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"
                : "bg-red-500/20 text-red-300 border-red-500/30"
            )}
          >
            {hasApiKey && apiKeyStatus.isValid ? (
              <>
                <Wifi className="h-3 w-3 mr-1" />
                AI Ready
              </>
            ) : apiKeyStatus.hasKey ? (
              <>
                <WifiOff className="h-3 w-3 mr-1" />
                AI Key Invalid
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3 mr-1" />
                No AI Key
              </>
            )}
          </Badge>
        </div>
      </CardHeader>

      {/* Scrollable Content Area */}
      <CardContent className="flex-1 flex flex-col p-4 space-y-4 min-h-0">
        {/* API Key Warning */}
        {!hasApiKey && (
          <Alert className="bg-blue-500/10 border-blue-500/30 flex-shrink-0">
            <AlertCircle className="h-4 w-4 text-blue-400" />
            <AlertDescription className="text-blue-300 text-sm">
              {apiKeyStatus.hasKey 
                ? "Your API key appears to be invalid. Please check it in Settings."
                : "Configure your Gemini API key in Settings to enable AI features, or use direct commands below."
              }
            </AlertDescription>
          </Alert>
        )}

        {/* Selection Info */}
        {currentSelection && (
          <Alert className="bg-green-500/10 border-green-500/30 flex-shrink-0">
            <Lightbulb className="h-4 w-4 text-green-400" />
            <AlertDescription className="text-green-300 text-sm">
              <strong>Current Selection:</strong> {currentSelection.description}
              <br />
              <span className="text-xs">Ask me questions about this selection!</span>
            </AlertDescription>
          </Alert>
        )}

        {/* Quick Commands */}
        <div className="space-y-2 flex-shrink-0">
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

        <Separator className="bg-gray-600 flex-shrink-0" />

        {/* Fixed Height Messages Area with Scrolling */}
        <div className="flex-1 min-h-0">
          <ScrollArea className="h-full pr-2">
            <div className="space-y-4 pb-4">
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
                      ) : message.type === 'loading' ? (
                        <div className="w-8 h-8 rounded-full bg-orange-600 flex items-center justify-center">
                          <Clock className="h-4 w-4 text-white" />
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
                      : message.type === 'loading'
                      ? "bg-orange-500/20 text-orange-200 border border-orange-500/30"
                      : "bg-gray-600/50 text-gray-200"
                  )}>
                    <div className="text-sm whitespace-pre-wrap leading-relaxed">
                      {message.type === 'loading' && message.isWaitingForReady ? (
                        <div className="flex items-center space-x-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>{message.content}</span>
                        </div>
                      ) : (
                        message.content
                      )}
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
                      <span className="text-sm text-gray-400">
                        {hasApiKey ? 'Processing with AI...' : 'Processing command...'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
        </div>

        {/* Fixed Input Area */}
        <div className="flex-shrink-0 space-y-2">
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
              className="bg-blue-600 hover:bg-blue-700 text-white px-3"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>

          {!isStructureLoaded && (
            <div className="text-center text-xs text-gray-400">
              Load a protein structure to start chatting with the AI assistant
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ChatInterface;