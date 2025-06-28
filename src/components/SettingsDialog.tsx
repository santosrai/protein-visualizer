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
  Trash2,
  Copy,
  Check
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
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [testError, setTestError] = useState<string>('');
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Load saved API key on component mount and when dialog opens
  useEffect(() => {
    if (open) {
      const savedKey = localStorage.getItem('gemini_api_key');
      if (savedKey) {
        setApiKey(savedKey);
      }
      setTestResult(null);
      setTestError('');
    }
  }, [open]);

  // Default trigger component
  const defaultTrigger = (
    <Button variant="outline" size="sm" className="bg-gray-800/50 border-gray-600 text-white hover:bg-gray-700">
      <Settings className="h-4 w-4 mr-2" />
      Settings
    </Button>
  );

  const getApiKeyStatus = () => {
    const status = geminiService.getApiKeyStatus();
    return status;
  };

  const handleSaveApiKey = async () => {
    const trimmedKey = apiKey.trim();
    
    setIsSaving(true);
    setTestResult(null);
    setTestError('');

    try {
      if (trimmedKey) {
        // Test the API key first
        await geminiService.testApiKey(trimmedKey);
        
        // If test passes, save it
        geminiService.updateApiKey(trimmedKey);
        setTestResult('success');
        onApiKeyUpdate?.(true);
      } else {
        // Clear the API key
        geminiService.updateApiKey('');
        setTestResult(null);
        onApiKeyUpdate?.(false);
      }
    } catch (error) {
      setTestResult('error');
      setTestError(error instanceof Error ? error.message : 'Failed to validate API key');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearApiKey = () => {
    setApiKey('');
    geminiService.updateApiKey('');
    setTestResult(null);
    setTestError('');
    onApiKeyUpdate?.(false);
  };

  const handleTestApiKey = async () => {
    if (!apiKey.trim()) return;

    setIsTesting(true);
    setTestResult(null);
    setTestError('');

    try {
      await geminiService.testApiKey(apiKey.trim());
      setTestResult('success');
      setTestError('');
    } catch (error) {
      setTestResult('error');
      setTestError(error instanceof Error ? error.message : 'API key test failed');
    } finally {
      setIsTesting(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isSaving && !isTesting) {
      handleSaveApiKey();
    }
  };

  const copyExampleKey = () => {
    const exampleKey = 'AIzaSyDc9QtR_example_gemini_api_key_here';
    navigator.clipboard.writeText(exampleKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const status = getApiKeyStatus();

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
                {status.isValid ? (
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-400" />
                    <span className="text-sm text-green-400">API Key Valid ({status.source})</span>
                  </div>
                ) : status.hasKey ? (
                  <div className="flex items-center space-x-2">
                    <AlertCircle className="h-4 w-4 text-yellow-400" />
                    <span className="text-sm text-yellow-400">API Key Invalid ({status.source})</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <AlertCircle className="h-4 w-4 text-red-400" />
                    <span className="text-sm text-red-400">No API Key</span>
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
                    placeholder="AIzaSyDc9QtR_your_gemini_api_key_here"
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
                <p className="text-xs text-gray-400">
                  API keys should start with "AIza" and be at least 35 characters long
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={handleSaveApiKey}
                  disabled={!apiKey.trim() || isSaving || isTesting}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {isSaving ? (
                    <>
                      <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-gray-400 border-t-white" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save & Test
                    </>
                  )}
                </Button>
                
                <Button
                  onClick={handleTestApiKey}
                  disabled={!apiKey.trim() || isTesting || isSaving}
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
                      Test Only
                    </>
                  )}
                </Button>
                
                {status.hasKey && (
                  <Button
                    onClick={handleClearApiKey}
                    variant="outline"
                    className="bg-red-500/20 border-red-500/50 text-red-400 hover:bg-red-500/30"
                    disabled={isSaving || isTesting}
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
                      ? "✅ API key is valid and working correctly!"
                      : `❌ ${testError || 'API key test failed'}`
                    }
                  </AlertDescription>
                </Alert>
              )}

              <Separator className="bg-gray-600" />

              {/* Instructions */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-white">How to get your API key:</h4>
                <ol className="text-sm text-gray-400 space-y-1 list-decimal list-inside">
                  <li>Visit Google AI Studio (link below)</li>
                  <li>Sign in with your Google account</li>
                  <li>Click "Get API key" → "Create API key"</li>
                  <li>Copy the key (starts with "AIza")</li>
                  <li>Paste it above and click "Save & Test"</li>
                </ol>
                
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open('https://ai.google.dev/', '_blank')}
                    className="bg-gray-700/50 border-gray-600 text-white hover:bg-gray-600"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Get API Key
                  </Button>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyExampleKey}
                    className="bg-gray-700/50 border-gray-600 text-white hover:bg-gray-600"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 mr-2" />
                    ) : (
                      <Copy className="h-4 w-4 mr-2" />
                    )}
                    {copied ? 'Copied!' : 'Copy Example'}
                  </Button>
                </div>
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