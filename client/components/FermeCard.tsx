import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Ferme } from '@shared/types';
import { Building2, MapPin, Users, BedDouble, Settings } from 'lucide-react';
import { useFirestore } from '@/hooks/useFirestore';
import { Worker, Room } from '@shared/types';

interface FermeCardProps {
  ferme: Ferme;
  onManage: (fermeId: string) => void;
}

export const FermeCard: React.FC<FermeCardProps> = ({ ferme, onManage }) => {
  const { data: workers } = useFirestore<Worker>('workers');
  const { data: rooms } = useFirestore<Room>('rooms');

  const fermeWorkers = workers.filter(w => w.fermeId === ferme.id && w.statut === 'actif');
  const fermeRooms = rooms.filter(r => r.fermeId === ferme.id);

  const stats = {
    totalOuvriers: fermeWorkers.length,
    ouvriersHommes: fermeWorkers.filter(w => w.sexe === 'homme').length,
    ouvriersFemmes: fermeWorkers.filter(w => w.sexe === 'femme').length,
    totalChambres: fermeRooms.length,
    chambresOccupees: fermeRooms.filter(r => r.occupantsActuels > 0).length,
    placesRestantes: fermeRooms.reduce((total, room) => total + (room.capaciteTotale - room.occupantsActuels), 0)
  };

  const occupancyRate = stats.totalChambres > 0 ? Math.round((stats.chambresOccupees / stats.totalChambres) * 100) : 0;

  return (
    <Card className="transition-all duration-200 hover:shadow-lg">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
            <div className="p-2 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg flex-shrink-0">
              <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 truncate">
                {ferme.nom}
              </CardTitle>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onManage(ferme.id)}
            className="flex-shrink-0"
          >
            <Settings className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
            <span className="hidden sm:inline">Gérer</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 sm:gap-4 mb-4">
          <div className="flex items-center space-x-2">
            <Users className="h-4 w-4 text-gray-500 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{stats.totalOuvriers}</p>
              <p className="text-xs text-gray-500 truncate">Ouvriers</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <BedDouble className="h-4 w-4 text-gray-500 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{stats.totalChambres}</p>
              <p className="text-xs text-gray-500 truncate">Chambres</p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Taux d'occupation</span>
            <Badge variant={occupancyRate > 80 ? "destructive" : occupancyRate > 60 ? "default" : "secondary"}>
              {occupancyRate}%
            </Badge>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all duration-300" 
              style={{ width: `${occupancyRate}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>{stats.chambresOccupees} occupées</span>
            <span>{stats.placesRestantes} places libres</span>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex flex-col sm:flex-row justify-between gap-1 sm:gap-0 text-sm">
            <span className="text-gray-600">Hommes: {stats.ouvriersHommes}</span>
            <span className="text-gray-600">Femmes: {stats.ouvriersFemmes}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
