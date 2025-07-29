import React, { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useFirestore } from '@/hooks/useFirestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  BarChart3, 
  Users, 
  BedDouble, 
  Building2,
  TrendingUp,
  TrendingDown,
  Calendar,
  Download,
  Filter,
  Clock,
  LogOut,
  MapPin,
  AlertTriangle,
  CheckCircle,
  Activity,
  Target,
  UserCheck,
  UserX,
  Home,
  Zap,
  ArrowUp,
  ArrowDown,
  Minus
} from 'lucide-react';
import { Ferme, Worker, Room } from '@shared/types';
import * as XLSX from 'xlsx';
import { NetworkErrorHandler } from '@/components/NetworkErrorHandler';
import { forceSyncRoomOccupancy, getOccupancySummary, type SyncResult } from '@/utils/syncUtils';

export default function Statistics() {
  const { user, isSuperAdmin } = useAuth();
  const { data: fermes, error: fermesError, refetch: refetchFermes } = useFirestore<Ferme>('fermes');
  const { data: allWorkers, error: workersError, refetch: refetchWorkers } = useFirestore<Worker>('workers');
  const { data: allRooms, error: roomsError, refetch: refetchRooms } = useFirestore<Room>('rooms');
  
  const [selectedFerme, setSelectedFerme] = useState('all');
  const [timeRange, setTimeRange] = useState('month');
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  // Filter data based on user role and selected ferme
  const workers = selectedFerme === 'all' 
    ? (isSuperAdmin ? allWorkers : allWorkers.filter(w => w.fermeId === user?.fermeId))
    : allWorkers.filter(w => w.fermeId === selectedFerme);
  
  const rooms = selectedFerme === 'all'
    ? (isSuperAdmin ? allRooms : allRooms.filter(r => r.fermeId === user?.fermeId))
    : allRooms.filter(r => r.fermeId === selectedFerme);

  // Comprehensive statistics calculation
  const statistics = useMemo(() => {
    const activeWorkers = workers.filter(w => w.statut === 'actif');
    const inactiveWorkers = workers.filter(w => w.statut === 'inactif');
    const exitedWorkers = workers.filter(w => w.statut === 'inactif' && w.dateSortie);
    
    const maleWorkers = activeWorkers.filter(w => w.sexe === 'homme');
    const femaleWorkers = activeWorkers.filter(w => w.sexe === 'femme');
    
    const maleRooms = rooms.filter(r => r.genre === 'hommes');
    const femaleRooms = rooms.filter(r => r.genre === 'femmes');
    
    const occupiedRooms = rooms.filter(r => r.occupantsActuels > 0);
    const fullRooms = rooms.filter(r => r.occupantsActuels >= r.capaciteTotale);
    const emptyRooms = rooms.filter(r => r.occupantsActuels === 0);
    
    const totalCapacity = rooms.reduce((sum, room) => sum + room.capaciteTotale, 0);

    // Calculate actual occupied places from worker assignments (gender-aware)
    const occupiedPlaces = (() => {
      const workerRoomMap = new Map<string, number>();

      workers.filter(w => w.statut === 'actif' && w.chambre).forEach(worker => {
        const workerGenderType = worker.sexe === 'homme' ? 'hommes' : 'femmes';
        const roomKey = `${worker.fermeId}-${worker.chambre}-${workerGenderType}`;
        workerRoomMap.set(roomKey, (workerRoomMap.get(roomKey) || 0) + 1);
      });

      return Array.from(workerRoomMap.values()).reduce((sum, count) => sum + count, 0);
    })();

    const availablePlaces = totalCapacity - occupiedPlaces;
    
    const occupancyRate = totalCapacity > 0 ? (occupiedPlaces / totalCapacity) * 100 : 0;

    // Time-based analytics
    const getTimeThreshold = (range: string) => {
      const date = new Date();
      switch (range) {
        case 'week': date.setDate(date.getDate() - 7); break;
        case 'month': date.setDate(date.getDate() - 30); break;
        case 'quarter': date.setDate(date.getDate() - 90); break;
        case 'year': date.setFullYear(date.getFullYear() - 1); break;
        default: date.setDate(date.getDate() - 30);
      }
      return date;
    };

    const threshold = getTimeThreshold(timeRange);
    const recentArrivals = workers.filter(w => 
      new Date(w.dateEntree) >= threshold && w.statut === 'actif'
    );
    const recentExits = exitedWorkers.filter(w => 
      w.dateSortie && new Date(w.dateSortie) >= threshold
    );

    // Exit analysis
    const exitReasons = exitedWorkers.reduce((acc, worker) => {
      const reason = worker.motif || 'Non spécifié';
      acc[reason] = (acc[reason] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const topExitReason = Object.entries(exitReasons)
      .sort(([,a], [,b]) => b - a)[0];

    // Length of stay analysis
    const staysWithDuration = exitedWorkers
      .filter(w => w.dateEntree && w.dateSortie)
      .map(w => {
        const entryDate = new Date(w.dateEntree);
        const exitDate = new Date(w.dateSortie!);
        return Math.floor((exitDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
      });

    const averageStayDuration = staysWithDuration.length > 0
      ? Math.round(staysWithDuration.reduce((sum, days) => sum + days, 0) / staysWithDuration.length)
      : 0;

    // Age analysis
    const ages = activeWorkers.map(w => w.age);
    const averageAge = ages.length > 0 ? Math.round(ages.reduce((sum, age) => sum + age, 0) / ages.length) : 0;
    const minAge = ages.length > 0 ? Math.min(...ages) : 0;
    const maxAge = ages.length > 0 ? Math.max(...ages) : 0;

    const ageDistribution = {
      '18-25': activeWorkers.filter(w => w.age >= 18 && w.age <= 25).length,
      '26-35': activeWorkers.filter(w => w.age >= 26 && w.age <= 35).length,
      '36-45': activeWorkers.filter(w => w.age >= 36 && w.age <= 45).length,
      '46+': activeWorkers.filter(w => w.age >= 46).length
    };

    // Efficiency metrics
    const turnoverRate = workers.length > 0 ? (exitedWorkers.length / workers.length) * 100 : 0;
    const retentionRate = 100 - turnoverRate;
    const utilizationRate = occupancyRate;
    
    // Performance indicators
    const isHighOccupancy = occupancyRate > 85;
    const isLowOccupancy = occupancyRate < 50;
    const hasRecentGrowth = recentArrivals.length > recentExits.length;
    const balancedGender = Math.abs(maleWorkers.length - femaleWorkers.length) <= Math.ceil(activeWorkers.length * 0.2);

    return {
      // Basic counts
      totalWorkers: activeWorkers.length,
      totalInactiveWorkers: inactiveWorkers.length,
      maleWorkers: maleWorkers.length,
      femaleWorkers: femaleWorkers.length,
      totalRooms: rooms.length,
      maleRooms: maleRooms.length,
      femaleRooms: femaleRooms.length,
      occupiedRooms: occupiedRooms.length,
      emptyRooms: emptyRooms.length,
      fullRooms: fullRooms.length,
      
      // Capacity metrics
      totalCapacity,
      occupiedPlaces,
      availablePlaces,
      occupancyRate: Math.round(occupancyRate * 100) / 100,
      
      // Time-based metrics
      recentArrivals: recentArrivals.length,
      recentExits: recentExits.length,
      netChange: recentArrivals.length - recentExits.length,
      
      // Age metrics
      averageAge,
      minAge,
      maxAge,
      ageDistribution,
      
      // Stay duration
      averageStayDuration,
      totalExitedWorkers: exitedWorkers.length,
      
      // Exit analysis
      exitReasons,
      topExitReason: topExitReason ? topExitReason[0] : 'Aucune',
      topExitReasonCount: topExitReason ? topExitReason[1] : 0,
      
      // Performance metrics
      turnoverRate: Math.round(turnoverRate * 100) / 100,
      retentionRate: Math.round(retentionRate * 100) / 100,
      utilizationRate: Math.round(utilizationRate * 100) / 100,
      
      // Status indicators
      isHighOccupancy,
      isLowOccupancy,
      hasRecentGrowth,
      balancedGender,
      
      // Trends (mock data - in real app would calculate from historical data)
      occupancyTrend: hasRecentGrowth ? 8.5 : -3.2,
      workersTrend: recentArrivals.length > 0 ? 12.1 : -5.4,
    };
  }, [workers, rooms, timeRange]);

  // Export functionality
  const handleExport = () => {
    const exportData = {
      'Vue d\'ensemble': [
        ['Métrique', 'Valeur'],
        ['Total ouvriers actifs', statistics.totalWorkers],
        ['Taux d\'occupation', `${statistics.occupancyRate}%`],
        ['Places disponibles', statistics.availablePlaces],
        ['Âge moyen', `${statistics.averageAge} ans`],
        ['Taux de rétention', `${statistics.retentionRate}%`]
      ],
      'Répartition par âge': [
        ['Tranche d\'âge', 'Nombre'],
        ...Object.entries(statistics.ageDistribution)
      ],
      'Motifs de sortie': [
        ['Motif', 'Nombre'],
        ...Object.entries(statistics.exitReasons)
      ]
    };

    const workbook = XLSX.utils.book_new();
    Object.entries(exportData).forEach(([sheetName, data]) => {
      const worksheet = XLSX.utils.aoa_to_sheet(data);
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    });

    const fileName = `statistiques_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  // Utility function for trend display
  const TrendIndicator = ({ value, isPositive }: { value: number; isPositive: boolean }) => (
    <div className={`inline-flex items-center space-x-1 text-xs px-2 py-1 rounded-full ${
      isPositive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
    }`}>
      {isPositive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      <span>{Math.abs(value).toFixed(1)}%</span>
    </div>
  );

  // Modern KPI Card Component
  const ModernKPICard = ({ 
    title, 
    value, 
    subtitle, 
    icon: Icon, 
    gradient,
    trend 
  }: {
    title: string;
    value: string | number;
    subtitle: string;
    icon: React.ElementType;
    gradient: string;
    trend?: { value: number; isPositive: boolean };
  }) => (
    <Card className={`${gradient} border-0 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1`}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="p-3 bg-white/20 backdrop-blur-sm rounded-xl">
            <Icon className="h-6 w-6 text-white" />
          </div>
          {trend && <TrendIndicator value={trend.value} isPositive={trend.isPositive} />}
        </div>
        
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-white/80 uppercase tracking-wider">{title}</h3>
          <p className="text-3xl font-bold text-white">{value}</p>
          <p className="text-sm text-white/70">{subtitle}</p>
        </div>
      </CardContent>
    </Card>
  );

  // Check for network errors
  const networkError = fermesError || workersError || roomsError;
  const hasNetworkError = networkError && (
    networkError.includes('fetch') ||
    networkError.includes('Failed to fetch') ||
    networkError.includes('TypeError')
  );

  const handleRetry = () => {
    refetchFermes();
    refetchWorkers();
    refetchRooms();
  };

  const handleSyncRoomOccupancy = async () => {
    setSyncLoading(true);
    setSyncResult(null);

    try {
      const result = await forceSyncRoomOccupancy(allWorkers, allRooms);
      setSyncResult(result);

      // Refresh data after sync
      refetchWorkers();
      refetchRooms();

      console.log('🎯 Sync completed, refreshing data...');
    } catch (error) {
      console.error('❌ Sync failed:', error);
    } finally {
      setSyncLoading(false);
    }
  };

  // Get occupancy summary for debugging
  const occupancySummary = getOccupancySummary(allWorkers, allRooms);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {hasNetworkError && (
        <div className="px-4 sm:px-6 lg:px-8 py-8">
          <NetworkErrorHandler
            error={networkError}
            onRetry={handleRetry}
          />
        </div>
      )}
      {/* Modern Header */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-10 backdrop-blur-sm bg-white/95">
        <div className="px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col space-y-4 lg:space-y-0 lg:flex-row lg:justify-between lg:items-center">
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl shadow-lg">
                <BarChart3 className="h-7 w-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Statistiques</h1>
                <p className="text-gray-600 hidden sm:block">Analyse complète et en temps réel</p>
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button
                onClick={handleSyncRoomOccupancy}
                disabled={syncLoading}
                className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 shadow-lg"
              >
                <Activity className="mr-2 h-4 w-4" />
                {syncLoading ? 'Sync...' : 'Sync Occupancy'}
              </Button>
              <Button
                onClick={handleExport}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg"
              >
                <Download className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Exporter</span>
                <span className="sm:hidden">Export</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Sync Results and Debug Info */}
        {(syncResult || occupancySummary.hasDiscrepancy) && (
          <Card className="bg-yellow-50 border-yellow-200 shadow-lg">
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                </div>

                {occupancySummary.hasDiscrepancy && (
                  <div className="bg-white p-4 rounded-lg border border-red-200">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-red-900">⚠️ Incohérence détectée - Synchronisation requise</h4>
                      <Button
                        onClick={handleSyncRoomOccupancy}
                        disabled={syncLoading}
                        size="sm"
                        className="bg-red-600 hover:bg-red-700"
                      >
                        {syncLoading ? 'Correction...' : 'Corriger maintenant'}
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-gray-600">Ouvriers actifs:</p>
                        <p className="font-semibold">{occupancySummary.totalActiveWorkers}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Capacité totale:</p>
                        <p className="font-semibold">{occupancySummary.totalCapacity}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Occupancy (chambres):</p>
                        <p className="font-semibold text-red-600">{occupancySummary.currentOccupiedFromRooms}</p>
                        <p className="text-xs text-red-500">Données de chambres incorrectes</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Ouvriers avec chambre:</p>
                        <p className="font-semibold text-green-600">{occupancySummary.workersWithRooms}</p>
                        <p className="text-xs text-green-500">Données réelles d'ouvriers</p>
                      </div>
                    </div>
                    {occupancySummary.workersWithoutRooms > 0 && (
                      <p className="text-sm text-orange-600 mt-2">
                        ⚠️ {occupancySummary.workersWithoutRooms} ouvrier(s) sans chambre assignée
                      </p>
                    )}
                  </div>
                )}

                {syncResult && (
                  <div className="bg-white p-4 rounded-lg border">
                    <h4 className="font-medium text-gray-900 mb-2">Résultats de synchronisation</h4>
                    <div className="grid grid-cols-3 gap-4 text-sm mb-3">
                      <div>
                        <p className="text-gray-600">Chambres vérifiées:</p>
                        <p className="font-semibold">{syncResult.totalRoomsChecked}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Chambres mises à jour:</p>
                        <p className="font-semibold text-blue-600">{syncResult.roomsUpdated}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Incohérences trouvées:</p>
                        <p className="font-semibold text-orange-600">{syncResult.inconsistenciesFound.length}</p>
                      </div>
                    </div>
                    {syncResult.inconsistenciesFound.length > 0 && (
                      <div className="mt-3">
                        <p className="font-medium text-gray-700 mb-2">Détails des corrections:</p>
                        <div className="space-y-1 text-xs">
                          {syncResult.inconsistenciesFound.slice(0, 5).map((item, i) => (
                            <div key={i} className="bg-gray-50 p-2 rounded">
                              Chambre {item.roomNumber}: {item.oldOccupants} → {item.newOccupants} occupants
                              {item.workerNames.length > 0 && (
                                <span className="text-gray-600"> ({item.workerNames.join(', ')})</span>
                              )}
                            </div>
                          ))}
                          {syncResult.inconsistenciesFound.length > 5 && (
                            <p className="text-gray-500">... et {syncResult.inconsistenciesFound.length - 5} autres</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <Filter className="h-4 w-4" />
                <span className="font-medium">Filtres</span>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {isSuperAdmin && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-700 uppercase tracking-wide">Ferme</label>
                    <Select value={selectedFerme} onValueChange={setSelectedFerme}>
                      <SelectTrigger className="h-11 border-gray-200 hover:border-blue-300 focus:border-blue-500 bg-white">
                        <SelectValue placeholder="Toutes les fermes" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Toutes les fermes</SelectItem>
                        {fermes.map(ferme => (
                          <SelectItem key={ferme.id} value={ferme.id}>
                            {ferme.nom}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                
                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-700 uppercase tracking-wide">Période</label>
                  <Select value={timeRange} onValueChange={setTimeRange}>
                    <SelectTrigger className="h-11 border-gray-200 hover:border-blue-300 focus:border-blue-500 bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="week">7 jours</SelectItem>
                      <SelectItem value="month">30 jours</SelectItem>
                      <SelectItem value="quarter">3 mois</SelectItem>
                      <SelectItem value="year">1 an</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {selectedFerme !== 'all' && (
                  <div className="flex items-end lg:col-span-2">
                    <Badge variant="outline" className="flex items-center px-3 py-2 bg-blue-50 border-blue-200 text-blue-700">
                      <MapPin className="mr-2 h-3 w-3" />
                      {fermes.find(f => f.id === selectedFerme)?.nom || 'Ferme sélectionnée'}
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KPI Cards - Mobile Optimized Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
          <ModernKPICard
            title="Ouvriers Actifs"
            value={statistics.totalWorkers}
            subtitle="Total dans le système"
            icon={Users}
            gradient="bg-gradient-to-br from-emerald-500 to-green-600"
            trend={{ value: Math.abs(statistics.workersTrend), isPositive: statistics.workersTrend > 0 }}
          />
          
          <ModernKPICard
            title="Taux d'Occupation"
            value={`${statistics.occupancyRate}%`}
            subtitle={`${statistics.occupiedPlaces}/${statistics.totalCapacity} places`}
            icon={TrendingUp}
            gradient={
              statistics.isHighOccupancy ? "bg-gradient-to-br from-red-500 to-rose-600" :
              statistics.isLowOccupancy ? "bg-gradient-to-br from-orange-500 to-amber-600" :
              "bg-gradient-to-br from-blue-500 to-indigo-600"
            }
            trend={{ value: Math.abs(statistics.occupancyTrend), isPositive: statistics.occupancyTrend > 0 }}
          />
          
          <ModernKPICard
            title="Nouveaux Arrivants"
            value={statistics.recentArrivals}
            subtitle={`${timeRange === 'week' ? '7' : timeRange === 'month' ? '30' : timeRange === 'quarter' ? '90' : '365'} derniers jours`}
            icon={UserCheck}
            gradient="bg-gradient-to-br from-purple-500 to-violet-600"
          />
          
          <ModernKPICard
            title="Sorties"
            value={statistics.recentExits}
            subtitle="Même période"
            icon={UserX}
            gradient="bg-gradient-to-br from-orange-500 to-red-600"
          />
          
          <ModernKPICard
            title="Rétention"
            value={`${statistics.retentionRate}%`}
            subtitle="Taux de fidélisation"
            icon={Target}
            gradient={
              statistics.retentionRate > 85 ? "bg-gradient-to-br from-green-500 to-emerald-600" :
              statistics.retentionRate > 70 ? "bg-gradient-to-br from-blue-500 to-indigo-600" :
              "bg-gradient-to-br from-red-500 to-rose-600"
            }
          />
          
          <ModernKPICard
            title="Durée Moyenne"
            value={`${statistics.averageStayDuration}j`}
            subtitle="Séjour moyen"
            icon={Clock}
            gradient="bg-gradient-to-br from-cyan-500 to-blue-600"
          />
        </div>

        {/* Mobile-Optimized Tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4 h-auto p-1 bg-white/70 backdrop-blur-sm border-0 shadow-lg">
            <TabsTrigger value="overview" className="flex flex-col lg:flex-row items-center p-4 lg:p-3 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-indigo-600 data-[state=active]:text-white rounded-lg">
              <Activity className="h-4 w-4 mb-1 lg:mb-0 lg:mr-2" />
              <span className="text-xs lg:text-sm font-medium">Vue d'ensemble</span>
            </TabsTrigger>
            <TabsTrigger value="demographics" className="flex flex-col lg:flex-row items-center p-4 lg:p-3 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-indigo-600 data-[state=active]:text-white rounded-lg">
              <Users className="h-4 w-4 mb-1 lg:mb-0 lg:mr-2" />
              <span className="text-xs lg:text-sm font-medium">Démographie</span>
            </TabsTrigger>
            <TabsTrigger value="occupancy" className="flex flex-col lg:flex-row items-center p-4 lg:p-3 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-indigo-600 data-[state=active]:text-white rounded-lg">
              <Home className="h-4 w-4 mb-1 lg:mb-0 lg:mr-2" />
              <span className="text-xs lg:text-sm font-medium">Occupation</span>
            </TabsTrigger>
            <TabsTrigger value="performance" className="flex flex-col lg:flex-row items-center p-4 lg:p-3 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-indigo-600 data-[state=active]:text-white rounded-lg">
              <Zap className="h-4 w-4 mb-1 lg:mb-0 lg:mr-2" />
              <span className="text-xs lg:text-sm font-medium">Performance</span>
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Quick Insights - Mobile Optimized */}
              <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-lg lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center text-lg lg:text-xl">
                    <Activity className="mr-3 h-5 w-5 text-blue-600" />
                    Insights Rapides
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className={`p-4 rounded-xl ${statistics.hasRecentGrowth ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                      <div className="flex items-center mb-2">
                        {statistics.hasRecentGrowth ? 
                          <TrendingUp className="h-5 w-5 text-green-600 mr-2" /> :
                          <TrendingDown className="h-5 w-5 text-red-600 mr-2" />
                        }
                        <span className={`font-medium ${statistics.hasRecentGrowth ? 'text-green-900' : 'text-red-900'}`}>
                          {statistics.hasRecentGrowth ? 'Croissance' : 'Décroissance'}
                        </span>
                      </div>
                      <p className={`text-sm ${statistics.hasRecentGrowth ? 'text-green-800' : 'text-red-800'}`}>
                        {statistics.netChange > 0 ? '+' : ''}{statistics.netChange} ouvriers (net)
                      </p>
                    </div>
                    
                    <div className={`p-4 rounded-xl ${statistics.balancedGender ? 'bg-blue-50 border border-blue-200' : 'bg-yellow-50 border border-yellow-200'}`}>
                      <div className="flex items-center mb-2">
                        <Users className={`h-5 w-5 mr-2 ${statistics.balancedGender ? 'text-blue-600' : 'text-yellow-600'}`} />
                        <span className={`font-medium ${statistics.balancedGender ? 'text-blue-900' : 'text-yellow-900'}`}>
                          Équilibre Genre
                        </span>
                      </div>
                      <p className={`text-sm ${statistics.balancedGender ? 'text-blue-800' : 'text-yellow-800'}`}>
                        {statistics.maleWorkers}H / {statistics.femaleWorkers}F
                      </p>
                    </div>
                    
                    <div className={`p-4 rounded-xl ${statistics.isHighOccupancy ? 'bg-red-50 border border-red-200' : statistics.isLowOccupancy ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200'}`}>
                      <div className="flex items-center mb-2">
                        <BedDouble className={`h-5 w-5 mr-2 ${statistics.isHighOccupancy ? 'text-red-600' : statistics.isLowOccupancy ? 'text-yellow-600' : 'text-green-600'}`} />
                        <span className={`font-medium ${statistics.isHighOccupancy ? 'text-red-900' : statistics.isLowOccupancy ? 'text-yellow-900' : 'text-green-900'}`}>
                          Occupation
                        </span>
                      </div>
                      <p className={`text-sm ${statistics.isHighOccupancy ? 'text-red-800' : statistics.isLowOccupancy ? 'text-yellow-800' : 'text-green-800'}`}>
                        {statistics.occupancyRate}% - {statistics.isHighOccupancy ? 'Saturation' : statistics.isLowOccupancy ? 'Sous-utilisé' : 'Optimal'}
                      </p>
                    </div>
                    
                    <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl">
                      <div className="flex items-center mb-2">
                        <LogOut className="h-5 w-5 text-purple-600 mr-2" />
                        <span className="font-medium text-purple-900">Sortie Principal</span>
                      </div>
                      <p className="text-sm text-purple-800">
                        {statistics.topExitReason} ({statistics.topExitReasonCount})
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Demographics Tab */}
          <TabsContent value="demographics" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Gender Distribution */}
              <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Users className="mr-2 h-5 w-5 text-blue-600" />
                    Répartition par Genre
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-600">Hommes</span>
                      <div className="flex items-center space-x-2">
                        <Progress 
                          value={statistics.totalWorkers > 0 ? (statistics.maleWorkers / statistics.totalWorkers) * 100 : 0} 
                          className="w-32"
                        />
                        <span className="text-sm font-semibold text-gray-900 min-w-[4rem]">
                          {statistics.maleWorkers} ({statistics.totalWorkers > 0 ? Math.round((statistics.maleWorkers / statistics.totalWorkers) * 100) : 0}%)
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-600">Femmes</span>
                      <div className="flex items-center space-x-2">
                        <Progress 
                          value={statistics.totalWorkers > 0 ? (statistics.femaleWorkers / statistics.totalWorkers) * 100 : 0} 
                          className="w-32"
                        />
                        <span className="text-sm font-semibold text-gray-900 min-w-[4rem]">
                          {statistics.femaleWorkers} ({statistics.totalWorkers > 0 ? Math.round((statistics.femaleWorkers / statistics.totalWorkers) * 100) : 0}%)
                        </span>
                      </div>
                    </div>
                    <div className="pt-4 border-t border-gray-100 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Âge moyen:</span>
                        <span className="font-semibold">{statistics.averageAge} ans</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Étendue d'âge:</span>
                        <span className="font-semibold">{statistics.minAge} - {statistics.maxAge} ans</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Age Distribution */}
              <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <BarChart3 className="mr-2 h-5 w-5 text-indigo-600" />
                    Distribution par Âge
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Object.entries(statistics.ageDistribution).map(([range, count]) => (
                      <div key={range} className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-600">{range} ans</span>
                        <div className="flex items-center space-x-2">
                          <Progress 
                            value={statistics.totalWorkers > 0 ? (count / statistics.totalWorkers) * 100 : 0} 
                            className="w-24"
                          />
                          <span className="text-sm font-semibold text-gray-900 min-w-[3rem]">
                            {count} ({statistics.totalWorkers > 0 ? Math.round((count / statistics.totalWorkers) * 100) : 0}%)
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Occupancy Tab */}
          <TabsContent value="occupancy" className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg">Chambres Totales</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-gray-900 mb-2">{statistics.totalRooms}</div>
                  <div className="text-sm text-gray-600">
                    {statistics.maleRooms} hommes • {statistics.femaleRooms} femmes
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg">Chambres Occupées</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-green-600 mb-2">{statistics.occupiedRooms}</div>
                  <div className="text-sm text-gray-600">
                    {Math.round((statistics.occupiedRooms / statistics.totalRooms) * 100)}% du total
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg">Chambres Vides</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-blue-600 mb-2">{statistics.emptyRooms}</div>
                  <div className="text-sm text-gray-600">
                    Disponibles immédiatement
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg">Chambres Pleines</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-red-600 mb-2">{statistics.fullRooms}</div>
                  <div className="text-sm text-gray-600">
                    À capacité maximale
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-lg">
              <CardHeader>
                <CardTitle>Analyse de Capacité</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span>Occupation Globale</span>
                      <span>{statistics.occupancyRate}%</span>
                    </div>
                    <Progress value={statistics.occupancyRate} className="h-3" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-900">{statistics.totalCapacity}</div>
                      <div className="text-sm text-gray-600">Capacité totale</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{statistics.occupiedPlaces}</div>
                      <div className="text-sm text-gray-600">Places occupées</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{statistics.availablePlaces}</div>
                      <div className="text-sm text-gray-600">Places libres</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Performance Tab */}
          <TabsContent value="performance" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Retention & Turnover */}
              <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-lg">
                <CardHeader>
                  <CardTitle>Rétention et Rotation</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span>Taux de Rétention</span>
                        <span className="font-semibold">{statistics.retentionRate}%</span>
                      </div>
                      <Progress value={statistics.retentionRate} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span>Taux de Rotation</span>
                        <span className="font-semibold">{statistics.turnoverRate}%</span>
                      </div>
                      <Progress value={statistics.turnoverRate} className="h-2" />
                    </div>
                    <div className="pt-2 border-t text-sm space-y-1">
                      <div className="flex justify-between">
                        <span>Durée moyenne de séjour:</span>
                        <span className="font-semibold">{statistics.averageStayDuration} jours</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total sorties enregistrées:</span>
                        <span className="font-semibold">{statistics.totalExitedWorkers}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Exit Reasons */}
              <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-lg">
                <CardHeader>
                  <CardTitle>Analyse des Sorties</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Object.entries(statistics.exitReasons)
                      .sort(([,a], [,b]) => b - a)
                      .slice(0, 5)
                      .map(([reason, count]) => (
                      <div key={reason} className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-600 capitalize">
                          {reason.replace('_', ' ')}
                        </span>
                        <div className="flex items-center space-x-2">
                          <Progress 
                            value={statistics.totalExitedWorkers > 0 ? (count / statistics.totalExitedWorkers) * 100 : 0} 
                            className="w-20"
                          />
                          <span className="text-sm font-semibold text-gray-900 min-w-[2rem]">
                            {count}
                          </span>
                        </div>
                      </div>
                    ))}
                    {Object.keys(statistics.exitReasons).length === 0 && (
                      <div className="text-center text-gray-500 py-4">
                        Aucune sortie enregistrée
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
