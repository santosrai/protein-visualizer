import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { Alert, AlertDescription } from './ui/alert';
import { Upload, File, X, CheckCircle, AlertCircle, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileUploaderProps {
  onFileLoad: (content: string, filename: string) => void;
  className?: string;
  accept?: string[];
}

interface UploadedFile {
  name: string;
  size: number;
  content: string;
  isValid: boolean;
  error?: string;
}

const FileUploader: React.FC<FileUploaderProps> = ({ 
  onFileLoad, 
  className,
  accept = ['.pdb', '.cif', '.mmcif'] 
}) => {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  // Validate PDB file content
  const validatePDBContent = (content: string, filename: string): { isValid: boolean; error?: string } => {
    try {
      const lines = content.split('\n');
      const hasAtomRecords = lines.some(line => line.startsWith('ATOM') || line.startsWith('HETATM'));
      const hasHeaderInfo = lines.some(line => line.startsWith('HEADER') || line.startsWith('TITLE'));
      
      if (!hasAtomRecords) {
        return { isValid: false, error: 'No atom records found in PDB file' };
      }

      // Check file size (warn if too large)
      if (content.length > 10 * 1024 * 1024) { // 10MB
        return { isValid: false, error: 'File too large (>10MB). Please use smaller structures for better performance.' };
      }

      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: 'Invalid file format or corrupted file' };
    }
  };

  // Process uploaded files
  const processFiles = useCallback(async (files: File[]) => {
    setIsProcessing(true);
    setProgress(0);
    
    try {
      const processedFiles: UploadedFile[] = [];
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress((i / files.length) * 100);
        
        // Read file content
        const content = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            if (e.target?.result) {
              resolve(e.target.result as string);
            } else {
              reject(new Error('Failed to read file'));
            }
          };
          reader.onerror = () => reject(new Error('File read error'));
          reader.readAsText(file);
        });

        // Validate content
        const validation = validatePDBContent(content, file.name);
        
        const uploadedFile: UploadedFile = {
          name: file.name,
          size: file.size,
          content,
          isValid: validation.isValid,
          error: validation.error
        };

        processedFiles.push(uploadedFile);
      }
      
      setUploadedFiles(prev => [...prev, ...processedFiles]);
      setProgress(100);
      
    } catch (error) {
      console.error('Error processing files:', error);
    } finally {
      setIsProcessing(false);
      setTimeout(() => setProgress(0), 2000);
    }
  }, []);

  // Dropzone configuration
  const { getRootProps, getInputProps, isDragActive, isDragAccept, isDragReject } = useDropzone({
    onDrop: processFiles,
    accept: {
      'chemical/x-pdb': accept,
      'text/plain': accept,
      'application/octet-stream': accept
    },
    multiple: true,
    maxSize: 50 * 1024 * 1024, // 50MB max
  });

  // Remove file from list
  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Load file into viewer
  const loadFile = (file: UploadedFile) => {
    if (file.isValid) {
      onFileLoad(file.content, file.name);
    }
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Get dropzone styling
  const getDropzoneStyle = () => {
    if (isDragReject) return 'border-red-500 bg-red-500/10';
    if (isDragAccept) return 'border-green-500 bg-green-500/10';
    if (isDragActive) return 'border-blue-500 bg-blue-500/10';
    return 'border-gray-600 hover:border-gray-500';
  };

  return (
    <Card className={cn("bg-gray-800/50 border-gray-700", className)}>
      <CardHeader>
        <CardTitle className="text-white flex items-center">
          <Upload className="h-5 w-5 mr-2" />
          Upload Protein Structure
        </CardTitle>
        <CardDescription className="text-gray-400">
          Upload your own PDB, CIF, or mmCIF files for visualization
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Dropzone */}
        <div
          {...getRootProps()}
          className={cn(
            "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all duration-200",
            getDropzoneStyle()
          )}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center space-y-2">
            <Upload className="h-8 w-8 text-gray-400" />
            {isDragActive ? (
              <p className="text-white">Drop the files here...</p>
            ) : (
              <>
                <p className="text-white">Drag & drop files here, or click to select</p>
                <p className="text-gray-400 text-sm">
                  Supports .pdb, .cif, .mmcif files up to 50MB
                </p>
              </>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {isProcessing && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Processing files...</span>
              <span className="text-gray-400">{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {/* Uploaded files list */}
        {uploadedFiles.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-white">Uploaded Files</h4>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {uploadedFiles.map((file, index) => (
                <Card 
                  key={index} 
                  className={cn(
                    "bg-gray-900/50 border",
                    file.isValid ? "border-gray-600" : "border-red-500/50"
                  )}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3 flex-1">
                        <div className="flex-shrink-0">
                          {file.isValid ? (
                            <CheckCircle className="h-5 w-5 text-green-400" />
                          ) : (
                            <AlertCircle className="h-5 w-5 text-red-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            <FileText className="h-4 w-4 text-gray-400" />
                            <p className="text-sm font-medium text-white truncate">
                              {file.name}
                            </p>
                          </div>
                          <p className="text-xs text-gray-400">
                            {formatFileSize(file.size)}
                          </p>
                          {file.error && (
                            <p className="text-xs text-red-400 mt-1">
                              {file.error}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {file.isValid && (
                          <Button
                            size="sm"
                            onClick={() => loadFile(file)}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            Load
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeFile(index)}
                          className="text-gray-400 hover:text-white hover:bg-gray-700"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* File format info */}
        <Alert className="bg-gray-900/50 border-gray-600">
          <AlertCircle className="h-4 w-4 text-blue-400" />
          <AlertDescription className="text-gray-300">
            <strong>Supported formats:</strong> PDB (.pdb), CIF (.cif), mmCIF (.mmcif).
            For best performance, use structures with fewer than 10,000 atoms.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};

export default FileUploader;
