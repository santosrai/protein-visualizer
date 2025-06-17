import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import { Badge } from './ui/badge';
import { 
  HelpCircle, 
  Mouse, 
  Upload, 
  Eye, 
  Palette, 
  Info,
  ExternalLink,
  Dna,
  Atom,
  Layers
} from 'lucide-react';

interface HelpDialogProps {
  trigger?: React.ReactNode;
}

const HelpDialog: React.FC<HelpDialogProps> = ({ trigger }) => {
  const defaultTrigger = (
    <Button variant="outline" size="sm" className="bg-gray-800/50 border-gray-600 text-white hover:bg-gray-700">
      <HelpCircle className="h-4 w-4 mr-2" />
      Help
    </Button>
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger || defaultTrigger}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] bg-gray-900 border-gray-700 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center text-xl">
            <Dna className="h-6 w-6 mr-2 text-blue-400" />
            Protein Visualizer - User Guide
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Learn how to use the 3D protein visualization tools effectively
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="h-[60vh] pr-4">
          <div className="space-y-6">
            
            {/* Getting Started */}
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center">
                  <Info className="h-5 w-5 mr-2 text-green-400" />
                  Getting Started
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-gray-300">
                <p>
                  This application allows you to visualize protein structures in 3D using advanced molecular graphics.
                  You can either load sample proteins or upload your own PDB files.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="bg-gray-900/50 border-gray-600">
                    <CardContent className="p-3">
                      <h4 className="font-medium text-white mb-2">Sample Proteins</h4>
                      <p className="text-sm text-gray-400">
                        Choose from curated high-quality protein structures including small proteins,
                        enzymes, and complex macromolecules.
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gray-900/50 border-gray-600">
                    <CardContent className="p-3">
                      <h4 className="font-medium text-white mb-2">Custom Upload</h4>
                      <p className="text-sm text-gray-400">
                        Upload your own PDB, CIF, or mmCIF files to visualize custom protein structures
                        from research or databases.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>

            {/* Mouse Controls */}
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center">
                  <Mouse className="h-5 w-5 mr-2 text-blue-400" />
                  Mouse & Keyboard Controls
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="space-y-2">
                    <h4 className="font-medium text-white">Mouse Controls</h4>
                    <div className="space-y-1 text-gray-300">
                      <div className="flex justify-between">
                        <span>Rotate view:</span>
                        <Badge variant="outline" className="bg-gray-700 text-gray-300 border-gray-600">
                          Left click + drag
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                        <span>Pan view:</span>
                        <Badge variant="outline" className="bg-gray-700 text-gray-300 border-gray-600">
                          Right click + drag
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                        <span>Zoom:</span>
                        <Badge variant="outline" className="bg-gray-700 text-gray-300 border-gray-600">
                          Mouse wheel
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                        <span>Select atoms:</span>
                        <Badge variant="outline" className="bg-gray-700 text-gray-300 border-gray-600">
                          Click
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium text-white">Touch Controls</h4>
                    <div className="space-y-1 text-gray-300">
                      <div className="flex justify-between">
                        <span>Rotate:</span>
                        <Badge variant="outline" className="bg-gray-700 text-gray-300 border-gray-600">
                          Single finger drag
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                        <span>Pan:</span>
                        <Badge variant="outline" className="bg-gray-700 text-gray-300 border-gray-600">
                          Two finger drag
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                        <span>Zoom:</span>
                        <Badge variant="outline" className="bg-gray-700 text-gray-300 border-gray-600">
                          Pinch gesture
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Visualization Styles */}
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center">
                  <Palette className="h-5 w-5 mr-2 text-purple-400" />
                  Representation Styles
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="bg-gray-900/50 border-gray-600">
                    <CardContent className="p-3">
                      <div className="flex items-center space-x-2 mb-2">
                        <Layers className="h-4 w-4 text-blue-400" />
                        <h4 className="font-medium text-white">Cartoon</h4>
                        <Badge className="bg-green-500/20 text-green-300 border-green-500/30">
                          Recommended
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-400">
                        Simplified ribbon representation showing secondary structure elements 
                        like α-helices and β-sheets. Best for understanding protein fold.
                      </p>
                    </CardContent>
                  </Card>
                  
                  <Card className="bg-gray-900/50 border-gray-600">
                    <CardContent className="p-3">
                      <div className="flex items-center space-x-2 mb-2">
                        <Eye className="h-4 w-4 text-blue-400" />
                        <h4 className="font-medium text-white">Surface</h4>
                      </div>
                      <p className="text-sm text-gray-400">
                        Molecular surface showing the protein's shape and accessible surface.
                        Useful for analyzing binding sites and cavities.
                      </p>
                    </CardContent>
                  </Card>
                  
                  <Card className="bg-gray-900/50 border-gray-600">
                    <CardContent className="p-3">
                      <div className="flex items-center space-x-2 mb-2">
                        <Atom className="h-4 w-4 text-blue-400" />
                        <h4 className="font-medium text-white">Ball & Stick</h4>
                      </div>
                      <p className="text-sm text-gray-400">
                        Detailed atomic representation with bonds. Best for small molecules
                        and active sites where atomic details matter.
                      </p>
                    </CardContent>
                  </Card>
                  
                  <Card className="bg-gray-900/50 border-gray-600">
                    <CardContent className="p-3">
                      <div className="flex items-center space-x-2 mb-2">
                        <div className="h-4 w-4 rounded-full bg-blue-400" />
                        <h4 className="font-medium text-white">Space Fill</h4>
                      </div>
                      <p className="text-sm text-gray-400">
                        Van der Waals spheres showing atomic volumes. Useful for understanding
                        molecular packing and steric interactions.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>

            {/* File Upload */}
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center">
                  <Upload className="h-5 w-5 mr-2 text-orange-400" />
                  File Upload Guidelines
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-gray-300">
                <div className="space-y-2">
                  <h4 className="font-medium text-white">Supported Formats</h4>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="bg-blue-500/20 text-blue-300 border-blue-500/30">
                      .pdb
                    </Badge>
                    <Badge variant="outline" className="bg-blue-500/20 text-blue-300 border-blue-500/30">
                      .cif
                    </Badge>
                    <Badge variant="outline" className="bg-blue-500/20 text-blue-300 border-blue-500/30">
                      .mmcif
                    </Badge>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <h4 className="font-medium text-white">Recommendations</h4>
                  <ul className="text-sm text-gray-400 space-y-1 list-disc list-inside">
                    <li>Use structures with fewer than 10,000 atoms for optimal performance</li>
                    <li>File size should be under 10MB for smooth visualization</li>
                    <li>Ensure files contain valid atom records (ATOM/HETATM lines)</li>
                    <li>Download structures from reputable databases like PDB</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Tips & Tricks */}
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center">
                  <Info className="h-5 w-5 mr-2 text-yellow-400" />
                  Tips & Best Practices
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-gray-300">
                <ul className="text-sm space-y-2 list-disc list-inside">
                  <li>Start with cartoon representation for an overview of protein structure</li>
                  <li>Use surface representation to identify binding pockets and cavities</li>
                  <li>Switch to ball-and-stick for detailed analysis of active sites</li>
                  <li>Reset the view if you lose orientation in the 3D space</li>
                  <li>Try different proteins to compare structural features</li>
                  <li>Use the zoom controls for detailed examination of specific regions</li>
                </ul>
              </CardContent>
            </Card>

            {/* External Resources */}
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center">
                  <ExternalLink className="h-5 w-5 mr-2 text-cyan-400" />
                  Additional Resources
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-gray-300">
                <div className="space-y-1 text-sm">
                  <a
                    href="https://www.rcsb.org/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center text-blue-400 hover:text-blue-300"
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Protein Data Bank (PDB) - Download protein structures
                  </a>
                  <a
                    href="https://molstar.org/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center text-blue-400 hover:text-blue-300"
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Molstar Documentation - Advanced features
                  </a>
                  <a
                    href="https://pdb101.rcsb.org/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center text-blue-400 hover:text-blue-300"
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    PDB-101 - Learn about protein structures
                  </a>
                </div>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default HelpDialog;
