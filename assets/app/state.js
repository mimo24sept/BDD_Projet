/*
  Fichier: assets/app/state.js.
  Source unique pour garder l'UI coherente entre modules.
  Valeurs par defaut pour demarrer sans erreurs de lecture.
*/
// Objet partage pour eviter les etats dupliques.
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
