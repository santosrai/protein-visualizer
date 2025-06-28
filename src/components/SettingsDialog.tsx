import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { Separator } from './ui/separator';
import { 
  Settings, 
  Key, 
  CheckCircle, 
  AlertCircle, 
  ExternalLink,
  Eye,
  EyeOff,
  Save,
  Trash2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { geminiService } from '../services/geminiService';

interface SettingsDialogProps {
  trigger?: React.ReactNode;
  onApiKeyUpdate?: (hasKey: boolean) => void;
}

const SettingsDialog: React.FC<SettingsDialogProps> = ({ 
  trigger, 
  onApiKeyUpdate 
}) => {
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isValid, setIsValid] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [open, setOpen] = useState(false);

  // Load saved API key on component mount
  useEffect(() => {
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) {
      setApiKey(savedKey);
      setIsValid(true);
    }
  }, []);

  // Default trigger component
  const defaultTrigger = (
    <Button variant="outline" size="sm" className="bg-gray-800/50 border-gray-600 text-white hover:bg-gray-700">
      <Settings className="h-4 w-4 mr-2" />
      Settings
    </Button>
  );

  const handleSaveApiKey = () => {
    if (apiKey.trim()) {
      localStorage.setItem('gemini_api_key', apiKey.trim());
      geminiService.updateApiKey(apiKey.trim());
      setIsValid(true);
      onApiKeyUpdate?.(true);
    } else {
      localStorage.removeItem('gemini_api_key');
      geminiService.updateApiKey('');
      setIsValid(false);
      onApiKeyUpdate?.(false);
    }
  };

  const handleClearApiKey = () => {
    setApiKey('');
    localStorage.removeItem('gemini_api_key');
    geminiService.updateApiKey('');
    setIsValid(false);
    setTestResult(null);
    onApiKeyUpdate?.(false);
  };

  const handleTestApiKey = async () => {
    if (!apiKey.trim()) return;

    setIsTesting(true);
    setTestResult(null);

    try {
      // Test the API key with a simple request
      await geminiService.testApiKey(apiKey.trim());
      setTestResult('success');
    } catch (error) {
      setTestResult('error');
    } finally {
      setIsTesting(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveApiKey();
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || defaultTrigger}
      </DialogTrigger>
      <DialogContent className="max-w-2xl bg-gray-900 border-gray-700 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center text-xl">
            <Settings className="h-6 w-6 mr-2 text-blue-400" />
            Application Settings
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Configure your API keys and application preferences
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Gemini API Key Section */}
          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <Key className="h-5 w-5 mr-2 text-green-400" />
                Gemini AI API Key
              </CardTitle>
              <CardDescription className="text-gray-400">
                Configure your Google Gemini API key to enable AI-powered chat features
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Current Status */}
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-400">Status:</span>
                {isValid ? (
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-400" />
                    <span className="text-sm text-green-400">API Key Configured</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <AlertCircle className="h-4 w-4 text-yellow-400" />
                    <span className="text-sm text-yellow-400">No API Key</span>
                  </div>
                )}
              </div>

              {/* API Key Input */}
              <div className="space-y-2">
                <Label htmlFor="apikey" className="text-white">
                  API Key
                </Label>
                <div className="relative">
                  <Input
                    id="apikey"
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Enter your Gemini API key..."
                    className="bg-gray-900/50 border-gray-600 text-white placeholder-gray-400 pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1 h-7 w-7 p-0 hover:bg-gray-700"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? (
                      <EyeOff className="h-4 w-4 text-gray-400" />
                    ) : (
                      <Eye className="h-4 w-4 text-gray-400" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-2">
                <Button
                  onClick={handleSaveApiKey}
                  disabled={!apiKey.trim()}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save API Key
                </Button>
                <Button
                  onClick={handleTestApiKey}
                  disabled={!apiKey.trim() || isTesting}
                  variant="outline"
                  className="bg-gray-700/50 border-gray-600 text-white hover:bg-gray-600"
                >
                  {isTesting ? (
                    <>
                      <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-gray-400 border-t-white" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Test API Key
                    </>
                  )}
                </Button>
                {isValid && (
                  <Button
                    onClick={handleClearApiKey}
                    variant="outline"
                    className="bg-red-500/20 border-red-500/50 text-red-400 hover:bg-red-500/30"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Clear
                  </Button>
                )}
              </div>

              {/* Test Result */}
              {testResult && (
                <Alert className={cn(
                  testResult === 'success' 
                    ? "bg-green-500/10 border-green-500/30" 
                    : "bg-red-500/10 border-red-500/30"
                )}>
                  {testResult === 'success' ? (
                    <CheckCircle className="h-4 w-4 text-green-400" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-400" />
                  )}
                  <AlertDescription className={cn(
                    testResult === 'success' ? "text-green-300" : "text-red-300"
                  )}>
                    {testResult === 'success' 
                      ? "API key is valid and working correctly!"
                      : "API key test failed. Please check your key and try again."
                    }
                  </AlertDescription>
                </Alert>
              )}

              <Separator className="bg-gray-600" />

              {/* Instructions */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-white">How to get your API key:</h4>
                <ol className="text-sm text-gray-400 space-y-1 list-decimal list-inside">
                  <li>Visit Google AI Studio</li>
                  <li>Sign in with your Google account</li>
                  <li>Create a new API key</li>
                  <li>Copy and paste it above</li>
                </ol>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open('https://ai.google.dev/', '_blank')}
                  className="bg-gray-700/50 border-gray-600 text-white hover:bg-gray-600"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Get API Key
                </Button>
              </div>

              {/* Security Notice */}
              <Alert className="bg-blue-500/10 border-blue-500/30">
                <AlertCircle className="h-4 w-4 text-blue-400" />
                <AlertDescription className="text-blue-300 text-sm">
                  <strong>Privacy:</strong> Your API key is stored locally in your browser and never sent to our servers.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsDialog;