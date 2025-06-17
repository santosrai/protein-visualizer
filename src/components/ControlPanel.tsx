import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Separator } from './ui/separator';
import { Badge } from './ui/badge';
import { 
  Settings, 
  Palette, 
  RotateCcw, 
  Home, 
  ZoomIn, 
  ZoomOut, 
  Eye,
  Layers,
  Atom,
  Orbit
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ControlPanelProps {
  onRepresentationChange: (type: 'cartoon' | 'surface' | 'ball-and-stick' | 'spacefill') => void;
  onCameraReset: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  currentRepresentation?: string;
  isStructureLoaded: boolean;
  className?: string;
}

const representationOptions = [
  {
    value: 'cartoon',
    label: 'Cartoon',
    description: 'Simplified ribbon representation showing secondary structure',
    icon: Layers,
    recommended: 'proteins'
  },
  {
    value: 'surface',
    label: 'Surface',
    description: 'Molecular surface showing protein shape and cavities',
    icon: Eye,
    recommended: 'cavities'
  },
  {
    value: 'ball-and-stick',
    label: 'Ball & Stick',
    description: 'Atomic detail with bonds between atoms',
    icon: Atom,
    recommended: 'small molecules'
  },
  {
    value: 'spacefill',
    label: 'Space Fill',
    description: 'Van der Waals spheres showing atomic volumes',
    icon: Orbit,
    recommended: 'packing'
  }
];

const ControlPanel: React.FC<ControlPanelProps> = ({
  onRepresentationChange,
  onCameraReset,
  onZoomIn,
  onZoomOut,
  currentRepresentation,
  isStructureLoaded,
  className
}) => {

  const handleRepresentationChange = (value: string) => {
    onRepresentationChange(value as 'cartoon' | 'surface' | 'ball-and-stick' | 'spacefill');
  };

  return (
    <Card className={cn("bg-gray-800/50 border-gray-700", className)}>
      <CardHeader>
        <CardTitle className="text-white flex items-center">
          <Settings className="h-5 w-5 mr-2" />
          Visualization Controls
        </CardTitle>
        <CardDescription className="text-gray-400">
          Customize the 3D representation and camera view
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        
        {/* Representation Controls */}
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <Palette className="h-4 w-4 text-blue-400" />
            <h4 className="text-sm font-medium text-white">Representation Style</h4>
          </div>
          
          <Select
            value={currentRepresentation || 'cartoon'}
            onValueChange={handleRepresentationChange}
            disabled={!isStructureLoaded}
          >
            <SelectTrigger className="bg-gray-900/50 border-gray-600 text-white">
              <SelectValue placeholder="Select representation" />
            </SelectTrigger>
            <SelectContent className="bg-gray-900 border-gray-600">
              {representationOptions.map((option) => {
                const IconComponent = option.icon;
                return (
                  <SelectItem 
                    key={option.value} 
                    value={option.value}
                    className="text-white hover:bg-gray-800 focus:bg-gray-800"
                  >
                    <div className="flex items-center space-x-2">
                      <IconComponent className="h-4 w-4 text-blue-400" />
                      <span>{option.label}</span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          {/* Representation Details */}
          {currentRepresentation && (
            <Card className="bg-gray-900/30 border-gray-600">
              <CardContent className="p-3">
                {(() => {
                  const option = representationOptions.find(opt => opt.value === currentRepresentation);
                  if (!option) return null;
                  const IconComponent = option.icon;
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <IconComponent className="h-4 w-4 text-blue-400" />
                          <span className="text-sm font-medium text-white">{option.label}</span>
                        </div>
                        <Badge 
                          variant="secondary" 
                          className="text-xs bg-blue-500/20 text-blue-300 border-blue-500/30"
                        >
                          {option.recommended}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-400 leading-relaxed">
                        {option.description}
                      </p>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}
        </div>

        <Separator className="bg-gray-600" />

        {/* Camera Controls */}
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <Eye className="h-4 w-4 text-green-400" />
            <h4 className="text-sm font-medium text-white">Camera Controls</h4>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onCameraReset}
              disabled={!isStructureLoaded}
              className="bg-gray-900/50 border-gray-600 text-white hover:bg-gray-700"
            >
              <Home className="h-4 w-4 mr-1" />
              Reset View
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onZoomIn}
              disabled={!isStructureLoaded}
              className="bg-gray-900/50 border-gray-600 text-white hover:bg-gray-700"
            >
              <ZoomIn className="h-4 w-4 mr-1" />
              Zoom In
            </Button>
          </div>
          
          <Button
            size="sm"
            variant="outline"
            onClick={onZoomOut}
            disabled={!isStructureLoaded}
            className="w-full bg-gray-900/50 border-gray-600 text-white hover:bg-gray-700"
          >
            <ZoomOut className="h-4 w-4 mr-1" />
            Zoom Out
          </Button>
        </div>

        <Separator className="bg-gray-600" />

        {/* Interactive Tips */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-white">Interactive Controls</h4>
          <div className="space-y-1 text-xs text-gray-400">
            <div className="flex justify-between">
              <span>Rotate:</span>
              <span>Left click + drag</span>
            </div>
            <div className="flex justify-between">
              <span>Pan:</span>
              <span>Right click + drag</span>
            </div>
            <div className="flex justify-between">
              <span>Zoom:</span>
              <span>Mouse wheel</span>
            </div>
            <div className="flex justify-between">
              <span>Select:</span>
              <span>Click on atoms</span>
            </div>
          </div>
        </div>

        {!isStructureLoaded && (
          <Card className="bg-yellow-500/10 border-yellow-500/30">
            <CardContent className="p-3">
              <p className="text-xs text-yellow-300">
                Load a protein structure to enable visualization controls
              </p>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
};

export default ControlPanel;
