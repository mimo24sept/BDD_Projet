/*
  Fichier: assets/app/state.js
  Role: stockage central de letat front.
  Definit les valeurs initiales des filtres et listes.
  Partage le state entre modules de rendu et dAPI.
  Source de verite cote interface.
*/
export const state = {
  user: null,
  inventory: [],
  loans: [],
  adminLoans: [],
  accounts: [],
  activeTab: 'borrow',
  lastActiveTab: null,
  filters: { search: '', tags: [] },
  adminFilters: { search: '', tag: null, sort: 'recent' },
  maintenanceFilters: { search: '', tag: null },
  adminLoanSearch: '',
  adminHistory: [],
  adminStatsView: 'total',
  adminHistorySearch: '',
  modalItem: null,
  stats: null,
  loanHistory: [],
  userStatsView: 'total',
  adminStats: null,
  loanSearch: '',
  notifications: [],
  maintenanceRequests: [],
  reservationRequests: [],
};
