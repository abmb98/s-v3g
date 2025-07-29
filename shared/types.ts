export type UserRole = 'superadmin' | 'admin' | 'user';

export interface User {
  uid: string;
  email: string;
  role: UserRole;
  fermeId?: string;
  nom: string;
  telephone: string;
}

export interface Ferme {
  id: string;
  nom: string;
  totalChambres: number;
  totalOuvriers: number;
  admins: string[];
}

export interface Worker {
  id: string;
  nom: string;
  cin: string;
  fermeId: string;
  telephone: string;
  sexe: 'homme' | 'femme';
  age: number;
  yearOfBirth?: number; // Year of birth for age calculation
  chambre: string;
  dortoir: string;
  dateEntree: string;
  dateSortie?: string;
  motif?: string;
  statut: 'actif' | 'inactif';
}

export interface Room {
  id: string;
  numero: string;
  fermeId: string;
  genre: 'hommes' | 'femmes';
  capaciteTotale: number;
  occupantsActuels: number;
  listeOccupants: string[];
}

export interface DashboardStats {
  totalOuvriers: number;
  totalChambres: number;
  chambresOccupees: number;
  placesRestantes: number;
  ouvriersHommes: number;
  ouvriersFemmes: number;
}
