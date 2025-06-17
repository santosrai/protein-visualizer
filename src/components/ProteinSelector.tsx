import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { ScrollArea } from './ui/scroll-area';
import { Atom, Download, Info, Dna } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Protein {
  id: string;
  name: string;
  description: string;
  organism: string;
  method: string;
  resolution: string;
  file: string;
  size: string;
  features: string[];
}

interface ProteinMetadata {
  proteins: Protein[];
}

interface ProteinSelectorProps {
  onProteinSelect: (proteinId: string, file: string) => void;
  selectedProtein?: string;
  className?: string;
}

const ProteinSelector: React.FC<ProteinSelectorProps> = ({ 
  onProteinSelect, 
  selectedProtein, 
  className 
}) => {
  const [proteins, setProteins] = useState<Protein[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load protein metadata
  useEffect(() => {
    const loadProteins = async () => {
      try {
        setLoading(true);
        const response = await fetch('/data/protein-metadata.json');
        if (!response.ok) {
          throw new Error('Failed to load protein metadata');
        }
        const data: ProteinMetadata = await response.json();
        setProteins(data.proteins);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    loadProteins();
  }, []);

  // Get size badge color
  const getSizeBadgeColor = (size: string) => {
    switch (size) {
      case 'small': return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'medium': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      case 'large': return 'bg-red-500/20 text-red-300 border-red-500/30';
      default: return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
    }
  };

  if (loading) {
    return (
      <Card className={cn("bg-gray-800/50 border-gray-700", className)}>
        <CardHeader>
          <CardTitle className="text-white flex items-center">
            <Dna className="h-5 w-5 mr-2" />
            Sample Proteins
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-gray-400">Loading proteins...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={cn("bg-gray-800/50 border-gray-700", className)}>
        <CardHeader>
          <CardTitle className="text-white flex items-center">
            <Dna className="h-5 w-5 mr-2" />
            Sample Proteins
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-red-400 text-center py-8">
            Error: {error}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("bg-gray-800/50 border-gray-700", className)}>
      <CardHeader>
        <CardTitle className="text-white flex items-center">
          <Dna className="h-5 w-5 mr-2" />
          Sample Proteins
        </CardTitle>
        <CardDescription className="text-gray-400">
          Choose from curated protein structures for visualization
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-96 pr-4">
          <div className="space-y-4">
            {proteins.map((protein) => (
              <Card
                key={protein.id}
                className={cn(
                  "bg-gray-900/50 border-gray-600 transition-all duration-200 cursor-pointer hover:bg-gray-900/80",
                  selectedProtein === protein.id && "ring-2 ring-blue-500 bg-gray-900/80"
                )}
                onClick={() => onProteinSelect(protein.id, protein.file)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <Atom className="h-5 w-5 text-blue-400" />
                      <h3 className="font-semibold text-white">{protein.name}</h3>
                      <Badge
                        variant="outline"
                        className="text-xs font-mono bg-gray-700/50 text-gray-300 border-gray-600"
                      >
                        {protein.id}
                      </Badge>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn("text-xs", getSizeBadgeColor(protein.size))}
                    >
                      {protein.size}
                    </Badge>
                  </div>

                  <p className="text-sm text-gray-300 mb-3 leading-relaxed">
                    {protein.description}
                  </p>

                  <div className="space-y-2 text-xs text-gray-400">
                    <div className="flex justify-between">
                      <span>Organism:</span>
                      <span className="italic">{protein.organism}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Method:</span>
                      <span>{protein.method}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Resolution:</span>
                      <span>{protein.resolution}</span>
                    </div>
                  </div>

                  {protein.features.length > 0 && (
                    <>
                      <Separator className="my-3 bg-gray-600" />
                      <div className="flex flex-wrap gap-1">
                        {protein.features.map((feature, index) => (
                          <Badge
                            key={index}
                            variant="secondary"
                            className="text-xs bg-blue-500/20 text-blue-300 border-blue-500/30"
                          >
                            {feature}
                          </Badge>
                        ))}
                      </div>
                    </>
                  )}

                  <Separator className="my-3 bg-gray-600" />
                  
                  <Button
                    size="sm"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={(e) => {
                      e.stopPropagation();
                      onProteinSelect(protein.id, protein.file);
                    }}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Load Structure
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default ProteinSelector;
