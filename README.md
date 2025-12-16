# Parc matériels GEII — Application web

> Interface full front (HTML/CSS/JS vanilla) + API PHP pour réserver, emprunter, rendre et maintenir le parc d’équipements du département GEII.

## Aperçu express
- Authentification avec rôles (étudiant/professeur/admin), création de compte et effet ripple sur la page de connexion (`index.html`).
- Catalogue filtrable (recherche + tags), fiche détaillée, modale avec calendrier animé, blocage des dates déjà réservées ou en maintenance (`menu.html` + `assets/app.js`).
- Réservations et maintenances multi-jours, gestion des collisions, mise à jour immédiate de la dispo matériel.
- Rendus admin avec liste des prêts en cours/à venir, sélection d’état restreinte (impossible d’améliorer l’état par rapport à l’emprunt).
- Statistiques côté utilisateur et tableau de bord admin (retards, dégradations, maintenances, historique filtrable).
- Reset complet du parc et des emprunts pour repartir à neuf (`api/reset_state.php`).

## Pile technique
- **Frontend** : HTML + CSS custom (`assets/styles.css`), JavaScript vanilla (`assets/app.js`, `assets/login.js`), animations (ripple, modales, calendriers, badges).
- **Backend** : PHP 8.x (PDO), endpoints JSON (`api/auth.php`, `api/equipment.php`, `api/dashboard.php`, `api/reset_state.php`).
- **Base de données** : MySQL/MariaDB, structure fournie dans `BDD/Projet_BDD.sql`.

## Schéma fonctionnel
- **Tables clés** : `User`, `Role`, `Materiel`, `Categorie`, `Emprunt`, `Rendu`.
- **Statuts prêt** : `En cours`, `Annulation demandee`, `Maintenance`, `Terminé`.
- **Etat matériel** : `neuf`, `bon`, `passable`, `reparation nécessaire` (l’admin ne peut saisir qu’un état inférieur ou égal à l’état au moment du prêt).
- **Dispo matériel** : `Oui/Non` sur `Materiel.Dispo`, mis à jour dès qu’une réservation active chevauche la période courante.

## Parcours utilisateur
1. **Connexion / Création** : login/mdp, rôle choisi (professeur avec mot secret côté front), redirection vers `menu.html`.
2. **Catalogue** : recherche, filtres tags, affichage état/emplacement, badge dispo. Réservation via modale + calendrier (max 14 jours, dates grisées).
3. **Maintenance (admin)** : planification multi-jours avec avertissement si écrase une réservation.
4. **Rendus (admin)** : liste des prêts en cours/à venir, saisie de l’état (dropdown bornée), validation immédiate du retour.
5. **Stats** : cartes synthèse côté user, stats admin (retards/dégradations/maintenances) avec historique filtrable.

## Installation rapide
1. **Cloner le projet**
   ```bash
   git clone <repo> && cd BDD_Projet
   ```
2. **Configurer la base**  
   - Créer une base `Projet_BDD`.  
   - Importer le schéma/données :  
     ```bash
     mysql -u <user> -p Projet_BDD < BDD/Projet_BDD.sql
     ```
3. **Paramétrer la connexion**  
   - Editer `api/config.php` (ou variables d’env : `DB_DSN`, `DB_USER`, `DB_PASSWORD`).  
   - DSN exemple : `mysql:host=127.0.0.1;port=3306;dbname=Projet_BDD;charset=utf8mb4`.
4. **Lancer en local**  
   ```bash
   php -S 127.0.0.1:8000 -t .
   ```
   Ouvrir `http://127.0.0.1:8000/index.html`.
5. **Comptes de test** (issus du dump)  
   - Admin : `admin` / `admin`  
   - Utilisateur : `testtruc` / `1234`

## Points d’API
- `GET /api/auth.php` : session courante.  
- `POST /api/auth.php?action=login|register|logout` : auth/compte.  
- `GET /api/equipment.php` : catalogue + réservations.  
- `POST /api/equipment.php?action=reserve|create|delete|maintenance` : réservation CRUD + maintenance (admin requis selon action).  
- `GET /api/dashboard.php?scope=mine|all` : emprunts utilisateur ou globaux (admin).  
- `POST /api/dashboard.php?action=return` : marquer un prêt rendu (admin).  
- `POST /api/dashboard.php?action=cancel_request` : demander une annulation.  
- `GET /api/dashboard.php?action=admin_stats` : stats admin.  
- `POST /api/reset_state.php` : remise à zéro (admin).

## Détails UI & UX
- Ripple animé lors de la connexion, transitions douces sur cartes/modales, badges statut/état, grille responsive, scrollbar stylisée.
- Calendrier custom (navigation mois, sélection début/fin, blocage des semaines déjà occupées).
- Messages contextuels (erreurs/ok) et mises à jour en temps réel après chaque action (réservations, rendus, maintenance).

## Dépannage rapide
- **403/401** : vérifier la session (cookies activés) et le rôle (admin requis pour certaines actions).  
- **Connexion DB** : valider `api/config.php` et les droits MySQL ; le DSN doit cibler `127.0.0.1` si le socket local bloque.  
- **Reset de démo** : appeler `POST /api/reset_state.php` pour vider emprunts/rendus et remettre tout disponible.

---

Fait avec soin pour le parc GEII : catalogue animé, flux complets de prêt/rendu/maintenance, et stats prêtes à l’emploi. Bonne démo ! 🎛️
