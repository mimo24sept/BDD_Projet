/*
  Fichier: assets/app/utils.js
  Role: utilitaires partages.
  Formatage dates, libelles, badges et severites.
  Helpers pour statuts et couleurs.
  Sans dependances sur le DOM.
*/
import { CONDITION_RANKS } from './config.js';
/**
 * Echappe les caracteres speciaux pour insertion HTML.
 * Protege contre les balises et guillemets.
 * Retourne une chaine sure.
 */

export function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
/**
 * Formate une date yyyy-mm-dd en dd/mm/yyyy.
 * Retourne N/C si la valeur est vide.
 * Laisse la valeur telle quelle si le format est different.
 */

export function formatDisplayDate(dateStr) {
  if (!dateStr) return 'N/C';
  const parts = String(dateStr).split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${d}/${m}/${y}`;
  }
  return dateStr;
}
/**
 * Convertit une date/heure en format fr-FR.
 * Accepte YYYY-MM-DD HH:MM:SS ou ISO.
 * Retourne la chaine brute si le parsing echoue.
 */

export function formatDateTimeFr(dateStr) {
  if (!dateStr) return '';
  const normalized = String(dateStr).replace(' ', 'T');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
}
/**
 * Formate un objet Date en yyyy-mm-dd local.
 * Utilise zero-padding pour mois et jour.
 * Retourne une chaine stable pour comparaisons.
 */

export function formatDateLocal(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
/**
 * Normalise une date (Date ou string) en yyyy-mm-dd.
 * Extrait le pattern si present, sinon parse en Date.
 * Retourne null si la date est invalide.
 */

export function normalizeDateOnly(value) {
  if (value instanceof Date) {
    return formatDateLocal(value);
  }
  const raw = String(value || '').trim();
  if (!raw) return null;
  const m = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatDateLocal(parsed);
}
/**
 * Mappe une categorie libre vers un tag canonique.
 * Supporte Info/Elen/Ener/Auto via prefixe.
 * Retourne null si pas reconnu.
 */

export function canonicalCategory(cat) {
  const lower = String(cat || '').toLowerCase();
  if (lower.startsWith('info')) return 'Info';
  if (lower.startsWith('elen')) return 'Elen';
  if (lower.startsWith('ener')) return 'Ener';
  if (lower.startsWith('auto')) return 'Auto';
  return null;
}
/**
 * Nettoie un etat materiel en forme canonique.
 * Supprime accents et variations de casse.
 * Retourne une chaine vide si inconnu.
 */

export function normalizeCondition(value = '') {
  const cleaned = String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  if (cleaned.includes('reparation')) return 'reparation nécessaire';
  if (cleaned.includes('passable')) return 'passable';
  if (cleaned.includes('neuf')) return 'neuf';
  if (cleaned.includes('bon')) return 'bon';
  return '';
}
/**
 * Convertit un etat en rang numerique.
 * Utilise CONDITION_RANKS pour comparer.
 * Retourne le rang max si inconnu.
 */

export function conditionRank(value = '') {
  const norm = normalizeCondition(value);
  const maxRank = Math.max(...Object.values(CONDITION_RANKS));
  return norm && norm in CONDITION_RANKS ? CONDITION_RANKS[norm] : maxRank;
}
/**
 * Retourne les etats autorises pour un retour.
 * Interdit dameliorer letat au retour.
 * Classe les options du meilleur au pire.
 */

export function allowedReturnConditions(baseCondition = '') {
  const rank = conditionRank(baseCondition);
  const ordered = ['neuf', 'bon', 'passable', 'reparation nécessaire'];
  return ordered.filter((c) => conditionRank(c) <= rank);
}
/**
 * Convertit la valeur canonique en libelle lisible.
 * Gere les variantes connues.
 * Retourne la valeur brute si non standard.
 */

export function formatConditionLabel(value = '') {
  const norm = normalizeCondition(value);
  if (norm === 'reparation nécessaire') return 'Réparation nécessaire';
  if (norm === 'passable') return 'Passable';
  if (norm === 'bon') return 'Bon';
  if (norm === 'neuf') return 'Neuf';
  return value || 'N/C';
}
/**
 * Genere le HTML des options de retour.
 * Sappuie sur allowedReturnConditions.
 * Echappe les valeurs pour securite.
 */

export function buildReturnOptions(baseCondition = '') {
  const allowed = allowedReturnConditions(baseCondition);
  return allowed
    .map((c) => {
      const value = normalizeCondition(c) || c;
      return `<option value="${escapeHtml(value)}">${escapeHtml(formatConditionLabel(c))}</option>`;
    })
    .join('');
}
/**
 * Detecte si l objet est en reparation necessaire.
 * Normalise la chaine pour gerer les accents.
 * Retourne un booleen.
 */

export function needsRepair(item) {
  const cond = String(item?.condition || '').toLowerCase();
  const plain = cond.normalize ? cond.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : cond;
  return plain.includes('reparation necessaire');
}
/**
 * Retourne le chemin du placeholder par defaut.
 * Centralise la valeur pour tout le front.
 * Utilise une image locale du projet.
 */

export function placeholderImage() {
  return './assets/placeholder.svg';
}
/**
 * Genere un badge HTML selon le statut.
 * Mappe les statuts en classes visuelles.
 * Retourne un fragment pret a inserer.
 */

export function statusBadge(status = '') {
  const norm = status.toLowerCase();
  let cls = 'status-ok';
  let label = 'Disponible';
  if (['reserve', 'emprunte', 'pret'].includes(norm)) {
    cls = 'status-loan';
    label = 'Reserve';
  }
  if (['maintenance', 'hs'].includes(norm)) {
    cls = 'status-maint';
    label = 'Maintenance';
  }
  if (!label) label = status;
  return `<span class="badge ${cls}">${label}</span>`;
}
/**
 * Renvoie un libelle court pour le statut.
 * Utilise un fallback Disponible si vide.
 * Evite les labels techniques.
 */

export function statusLabelText(status = '') {
  const norm = status.toLowerCase();
  if (['reserve', 'emprunte', 'pret'].includes(norm)) return 'Réservé';
  if (['maintenance', 'hs'].includes(norm)) return 'Maintenance';
  if (!status) return 'Disponible';
  return status;
}
/**
 * Calcule la cle de semaine ISO a partir dune date.
 * Travaille en UTC pour stabilite.
 * Retourne null si la date est invalide.
 */

export function isoWeekKey(dateStr) {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}
/**
 * Liste les semaines ISO couvertes par une periode.
 * Saute de 7 jours pour eviter les doublons.
 * Gere les periodes inversees.
 */

export function weeksBetween(start, end) {
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end || start}T00:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return [];
  const weeks = [];
  const step = s <= e ? 1 : -1;
  const cursor = new Date(s);
  while ((step === 1 && cursor <= e) || (step === -1 && cursor >= e)) {
    const wk = isoWeekKey(cursor.toISOString().slice(0, 10));
    if (wk && !weeks.includes(wk)) weeks.push(wk);
    cursor.setDate(cursor.getDate() + 7 * step);
  }
  return weeks;
}
/**
 * Liste les dates entre start et end incluses.
 * Avance jour par jour, dans un sens ou lautre.
 * Retourne [] si la date est invalide.
 */

export function datesBetween(start, end) {
  if (!start) return [];
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${(end || start)}T00:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return [];
  const dates = [];
  const step = s <= e ? 1 : -1;
  const cursor = new Date(s);
  while ((step === 1 && cursor <= e) || (step === -1 && cursor >= e)) {
    dates.push(formatDateLocal(cursor));
    cursor.setDate(cursor.getDate() + step);
  }
  return dates;
}
/**
 * Calcule le nombre de jours inclusifs.
 * Utilise minuit local pour chaque date.
 * Retourne 0 si parsing invalide.
 */

export function dateDiffDays(a, b) {
  const da = new Date(`${a}T00:00:00`);
  const db = new Date(`${b}T00:00:00`);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return 0;
  return Math.abs(Math.round((db - da) / (1000 * 60 * 60 * 24))) + 1;
}
/**
 * Retourne le lundi de la semaine en UTC.
 * Utilise la norme ISO (lundi=1).
 * Renvoie une chaine yyyy-mm-dd.
 */

export function weekStartFromDate(dateObj) {
  const d = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 1 - day);
  return d.toISOString().slice(0, 10);
}
/**
 * Ajoute un nombre de jours a une date.
 * Retourne la date formatee en yyyy-mm-dd.
 * Renvoie la valeur dorigine si invalide.
 */

export function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  d.setDate(d.getDate() + days);
  return formatDateLocal(d);
}
/**
 * Parse la saisie JJ/MM/AAAA ou AAAA-MM-JJ.
 * Valide la date avec Date().
 * Retourne yyyy-mm-dd ou null.
 */

export function parseManualInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  let y; let m; let d;
  if (raw.includes('/')) {
    const parts = raw.split('/');
    if (parts.length !== 3) return null;
    [d, m, y] = parts;
  } else if (raw.includes('-')) {
    const parts = raw.split('-');
    if (parts.length !== 3) return null;
    [y, m, d] = parts;
  } else {
    return null;
  }
  y = String(y).padStart(4, '0');
  m = String(m).padStart(2, '0');
  d = String(d).padStart(2, '0');
  const date = new Date(`${y}-${m}-${d}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return formatDateLocal(date);
}
/**
 * Formate yyyy-mm-dd en JJ/MM/AAAA.
 * Retourne "" si la valeur est invalide.
 * Utilise le format pour les inputs manuels.
 */

export function formatManualInput(value) {
  if (!value) return '';
  const parts = String(value).split('-');
  if (parts.length !== 3) return '';
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
}
/**
 * Determine la severite d une date de retour.
 * Compare la date due au jour courant.
 * Retourne ok/soon/urgent/lastday/overdue.
 */

export function dueSeverity(due) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const match = String(due || '').match(/(\d{4}-\d{2}-\d{2})/);
  const dueStr = match ? match[1] : normalizeDateOnly(due);
  if (!dueStr) return 'ok';
  if (dueStr === todayStr) return 'lastday';
  const toUtc = (str) => {
    const [y, m, d] = str.split('-').map((v) => parseInt(v, 10));
    return Date.UTC(y, (m || 1) - 1, d || 1);
  };
  const diffDays = Math.floor((toUtc(dueStr) - toUtc(todayStr)) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'overdue';
  if (diffDays <= 2) return 'urgent';
  if (diffDays <= 5) return 'soon';
  return 'ok';
}
/**
 * Associe une couleur a la severite.
 * Retourne un gradient pour les cas neutres.
 * Utilise des couleurs alignees avec le theme.
 */

export function severityColor(severity) {
  if (severity === 'lastday') return '#f59e0b';
  if (severity === 'urgent') return '#f97316';
  if (severity === 'overdue') return '#ef4444';
  if (severity === 'soon') return '#f59e0b';
  return 'linear-gradient(120deg, var(--accent), var(--accent-strong))';
}
/**
 * Libelle court pour afficher la severite.
 * Normalise les cas proches (urgent/soon).
 * Retourne A jour par defaut.
 */

export function severityLabel(severity) {
  if (severity === 'lastday') return 'Dernier jour';
  if (severity === 'overdue') return 'En retard';
  if (severity === 'urgent') return 'Retour proche';
  if (severity === 'soon') return 'Retour proche';
  if (severity === 'future') return 'Planifiée';
  return 'A jour';
}
/**
 * Normalise la severite pour les classes CSS.
 * Mappe lastday vers overdue.
 * Retourne la valeur originale sinon.
 */

export function severityVisual(severity) {
  if (severity === 'lastday') return 'overdue';
  return severity;
}
/**
 * Choisit la couleur de barre selon progression.
 * Priorise la severite au dela de 50%.
 * Retourne un vert si avance faible.
 */

export function barColorForProgress(progress, visualSeverity) {
  if (visualSeverity !== 'overdue' && progress < 50) return '#22c55e';
  return severityColor(visualSeverity);
}
/**
 * Calcule le pourcentage de temps ecoule.
 * Utilise start et due (fin a 23:59:59).
 * Borne le resultat entre 0 et 100.
 */

export function progressPercentWithTime(start, due) {
  const startStr = normalizeDateOnly(start);
  const dueStr = normalizeDateOnly(due);
  if (!startStr || !dueStr) return 0;
  const startDate = new Date(`${startStr}T00:00:00`);
  const endDate = new Date(`${dueStr}T23:59:59`);
  const now = Date.now();
  const total = endDate.getTime() - startDate.getTime();
  if (total <= 0) {
    return now >= endDate.getTime() ? 100 : 0;
  }
  const ratio = Math.max(0, Math.min(1, (now - startDate.getTime()) / total));
  return Math.round(ratio * 100);
}
