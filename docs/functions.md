# Documentation des fonctions (vue d'ensemble) ✨

Ce mémo explique la logique interne des fonctions front et back, avec un focus sur l’enchaînement des actions et les contrôles clés. Parcourez la section qui vous intéresse.

---

## 🎨 Frontend

### assets/login.js (auth & UI)
| Fonction | Logique rapide |
| --- | --- |
| `initPasswordToggles` | Parcourt les champs mot de passe, branche le bouton œil (toggle `type` + aria). |
| `playRippleAndRedirect` | Lance l’animation ripple si dispo puis redirige vers `menu.html` (sinon redirection directe). |
| `updateSecretVisibility` | Affiche/masque le champ “mot secret” selon le rôle sélectionné (professeur). |
| `switchMode` | Bascule entre formulaires login/register, rafraîchit l’UI et les messages. |
| `apiLogin` / `apiRegister` | POST JSON vers `api/auth.php`, parse la réponse, lève en cas de statut HTTP d’erreur. |

### assets/app.js — API & état
- `apiSession` : GET session, met `state.user` ou null.
- `apiFetchEquipment` : charge le catalogue, normalise catégories/tags, ordonne les réservations, ajoute placeholders/description synthétique.
- `apiFetchLoans` : récupère prêts + stats, filtre les prêts non rendus, construit l’historique via `normalizeHistory`, gère les messages d’erreur.
- `apiFetchAdminLoans` / `apiFetchAdminStats` : récupèrent emprunts globaux et stats admin (si admin).
- `apiFetchUsers`, `apiSetUserRole`, `apiDeleteUser` : gestion comptes via `api/auth.php`.
- `apiReturnLoan`, `apiAdminCancelLoan`, `apiRequestCancel` : actions de retour/annulation, puis rafraîchissement des listes.
- `apiCreateEquipment`, `apiDeleteEquipment`, `apiSetMaintenance` : CRUD/maintenance matériel, lèvent si erreur HTTP.

### assets/app.js — rendu & helpers
- `setAuthUI` / `isAdmin` / `applyRoleVisibility` : mettent à jour l’interface selon le rôle et la session.
- `render` : appelle les sous-rendus (tabs, tags, catalogues, prêts, stats) pour tenir l’UI à jour.
- `updateTabs` : active l’onglet courant, cache les autres sections.
- `renderTags` / `renderAdminTags` / `renderMaintenanceTags` : construisent les chips de tags filtrants + bouton “Tous”.
- `renderAdminCatalog` / `renderMaintenanceCatalog` / `renderCatalog` : appliquent recherche + tags + tri, génèrent les cartes (état, dispo, description).
- `renderMaintenanceAgenda` : liste les maintenances actives, calcule la sévérité (date fin/début), propose “Fin de maintenance”.
- `renderAccounts` : tableau admin des comptes (login, email, rôle) avec actions role/delete.
- `renderLoans` : côté user, trie les prêts par sévérité/date, affiche progression et actions (rendre/annulation).
- `renderAdminLoans` : deux colonnes (gauche : en cours + rendus/état, droite : annulations à traiter puis réservations à venir annulables).
- `renderStats` / `renderUserStatsList` : cartes et historique filtré (retards/dégradations) pour l’utilisateur.
- `renderAdminStats` / `renderAdminStatsList` : cartes + historique (retards/dégradations/maintenances) côté admin.
- Etats matériel : `normalizeCondition`, `conditionRank`, `allowedReturnConditions`, `formatConditionLabel`, `buildReturnOptions` (impossibilité d’améliorer l’état au retour).
- Modale/réservation : `openModal`, `closeModal`, `statusBadge`, `escapeHtml`, `formatDisplayDate`, `formatDateLocal`, `canonicalCategory`, `needsRepair`, `placeholderImage`.
- Calendrier/dates :
  - `isoWeekKey`, `weeksBetween` : clés de semaines ISO pour bloquer des périodes.
  - `buildBlockedDates` : map dates occupées (maintenance prioritaire).
  - `isRangeFree` : vérifie qu’aucune date de la plage n’est bloquée (sauf override maintenance).
  - `datesBetween` : liste toutes les dates incluses.
  - `renderCalendar` : grille du mois, dates passées bloquées, navigation mois ±1.
  - `handleDayClick` : sélection début/fin (max 14j, pas de passé, refuse plage occupée).
  - `selectionRange`, `isDateSelected`, `isDateInSelection`, `dateDiffDays`, `nextAvailableDate`, `weekStartFromDate`, `addDays`, `parseManualInput`, `formatManualInput`, `handleManualDateInput`, `syncManualInputs`, `updateAvailabilityMessage`.
  - `dueSeverity` / `severityColor` / `severityLabel` : calcul et rendu de la sévérité (retard/urgent/bientôt).

---

## 🛠️ Backend

### api/auth.php
| Fonction | Logique |
| --- | --- |
| `login` | Lit JSON login/mdp, cherche par email/login, vérifie hash ou clair, met `LastLogin`, crée la session (id/login/role), renvoie l’utilisateur courant. |
| `logout` | Vide la session, renvoie un message JSON. |
| `register` | Valide email/mdp, protège le rôle professeur (mot secret côté front), vérifie doublons, insère l’utilisateur et ouvre la session. |
| `current_user` | Renvoie l’utilisateur en session ou null. |
| `is_valid_password` | Accepte hash ou clair (dump). |
| `lookup_role_id`, `list_users`, `normalize_role`, `set_role`, `delete_user`, `fetch_user_with_role`, `is_role_admin`, `is_admin`, `ensure_last_login_column` | Helpers rôles/colonnes, CRUD utilisateurs admin-only, protections contre retrait/suppression d’admin. |

### api/equipment.php
| Fonction | Logique |
| --- | --- |
| `list_equipment` | Jointure matériel/catégorie, ajoute périodes actives (prêt/maintenance), tags dérivés, semaines bloquées. |
| `reserve_equipment` | Vérifie ID, dates valides/ordonnées, conflit actif, refuse le passé ; bloque la dispo si la période inclut aujourd’hui, insère l’emprunt. |
| `set_maintenance` | Vérifie ID/dates, supprime emprunts chevauchants (hors maintenance), bloque la dispo si période courante, insère un emprunt de type maintenance. |
| `create_equipment` / `delete_equipment` | CRUD admin, génère référence, renvoie l’item ou le statut. |
| `fetch_active_loans`, `fetch_equipment_by_id`, `map_status`, `merge_tags`, `normalize_categories`, `generate_reference`, `build_reference_prefix`, `transliterate_to_ascii`, `weeks_between`, `period_is_current`, `iso_week_key`, `is_admin` | Helpers statut, tags, références, semaines, rôle admin. |

### api/dashboard.php
| Fonction | Logique |
| --- | --- |
| `fetch_loans` | Emprunts (user ou globaux si admin), garde ceux dont le matériel est supprimé, calcule progression/type. |
| `compute_start_date` | Début par défaut (J-7) si seule la date de fin existe. |
| `progress_percent` | Ratio temps écoulé / durée totale. |
| `build_stats` | (hors maintenance) calcule retards (due < aujourd’hui ou rendu tardif), dégradations (`is_degradation`), totaux annuels, historique trié. |
| `build_admin_stats` | Agrège retards/dégradations/maintenances de l’année pour l’admin, historique avec user + état de retour. |
| `return_pret` | Admin-only : contrôle accès, empêche double rendu, borne l’état (pas mieux que l’état initial), remet `Materiel.Dispo` à “Oui” si plus d’emprunt actif, insère un rendu (flag dégradation). |
| `request_cancel` | User/admin : vérifie accès + non-rendu, marque `Annulation demandee`. |
| `admin_cancel` | Admin : supprime l’emprunt non rendu, remet `Materiel.Dispo` à “Oui” si aucune autre réservation active ne couvre aujourd’hui. |
| Helpers | `normalize_condition`, `condition_rank`, `is_degradation`, `is_admin`. |